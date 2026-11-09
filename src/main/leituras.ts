import type { Citacao, DadosLeitura, Leitura, LeituraDiario, Progresso } from '@shared/api'
import type { Banco } from './db/conexao'
import { listarLivros } from './livros'
import { and, eq } from 'drizzle-orm'
import { FORMATOS, PRECISOES, STATUS_EM_ANDAMENTO, STATUS_LEITURA } from '@shared/dominio'
import { citacoes, livros } from './db/esquema'
import { recalcularStatus, ultimaLeitura } from './status'
import { dataValida, idValido, notaValida, numero, objeto, opcao, opcaoOuNulo, texto } from './validacao'

export const SELECAO_LEITURA = `SELECT id, status, formato, data_inicio AS dataInicio, data_fim AS dataFim,
  ano_fim AS anoFim, precisao_fim AS precisaoFim, nota, resenha FROM leituras`

export function salvarLeitura({ sqlite }: Banco, d: DadosLeitura): number {
  objeto(d)
  idValido(d.livroId)
  if (d.id !== undefined) idValido(d.id)
  opcao(STATUS_LEITURA, d.status, 'Status da leitura')
  opcaoOuNulo(FORMATOS, d.formato, 'Formato')
  opcaoOuNulo(PRECISOES, d.precisaoFim, 'Precisão da data')
  const inicio = dataValida(d.dataInicio)
  const fim = dataValida(d.dataFim)
  const ano = numero(d.anoFim, 'Ano da leitura', 1, 9999)
  if (
    (d.precisaoFim === 'dia' && (!fim || ano !== Number(fim.slice(0, 4)))) ||
    (d.precisaoFim === 'ano' && (fim !== null || ano === null)) ||
    (d.precisaoFim === null && (fim !== null || ano !== null))
  )
    throw new Error('Informe uma data completa, somente o ano ou deixe a data em branco.')
  if (d.status !== 'lido' && d.precisaoFim !== null)
    throw new Error('A data de conclusão é reservada a leituras concluídas.')
  if (inicio && ((fim && inicio > fim) || (!fim && ano && Number(inicio.slice(0, 4)) > ano)))
    throw new Error('A conclusão não pode vir antes do início.')
  const nota = notaValida(d.nota)
  const resenha = texto(d.resenha, 'Resenha', 100000)
  return sqlite.transaction(() => {
    if (!sqlite.prepare('SELECT 1 FROM livros WHERE id = ?').get(d.livroId)) throw new Error('Livro não encontrado.')
    if (d.id && !sqlite.prepare('SELECT 1 FROM leituras WHERE id = ? AND livro_id = ?').get(d.id, d.livroId))
      throw new Error('Leitura não encontrada neste livro.')
    const emAndamento = STATUS_EM_ANDAMENTO.includes(d.status)
    if (
      (!d.id || emAndamento) &&
      sqlite
        .prepare(`SELECT 1 FROM leituras WHERE livro_id = ? AND status IN ('lendo', 'pausado') AND id != ?`)
        .get(d.livroId, d.id ?? -1)
    )
      throw new Error('Conclua ou abandone a leitura em andamento antes de iniciar outra.')
    if (d.id && d.id !== ultimaLeitura(sqlite, d.livroId)?.id && emAndamento)
      throw new Error('Para retomar este livro, registre uma nova releitura.')
    if (
      d.id &&
      sqlite
        .prepare(
          `SELECT 1 FROM progresso WHERE leitura_id = ? AND ((? IS NOT NULL AND data < ?) OR (? IS NOT NULL AND data > ?))`
        )
        .get(d.id, inicio, inicio, fim, fim)
    )
      throw new Error('Há progresso fora dessas datas. Corrija o progresso antes de alterar o período da leitura.')
    const valores = [d.status, d.formato, inicio, fim, ano, d.precisaoFim, nota, resenha]
    const id =
      d.id ??
      Number(
        sqlite
          .prepare(
            `INSERT INTO leituras (status, formato, data_inicio, data_fim, ano_fim, precisao_fim, nota, resenha, livro_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(...valores, d.livroId).lastInsertRowid
      )
    if (d.id)
      sqlite
        .prepare(
          'UPDATE leituras SET status = ?, formato = ?, data_inicio = ?, data_fim = ?, ano_fim = ?, precisao_fim = ?, nota = ?, resenha = ? WHERE id = ?'
        )
        .run(...valores, id)
    // Leitura nova define o status; corrigir uma existente só o muda se ele deixar de valer.
    recalcularStatus(sqlite, d.livroId, d.id ? undefined : d.status)
    return id
  })()
}

export function excluirLeitura({ sqlite }: Banco, livroId: number, id: number): void {
  idValido(livroId)
  idValido(id)
  sqlite.transaction(() => {
    if (!sqlite.prepare('DELETE FROM leituras WHERE id = ? AND livro_id = ?').run(id, livroId).changes)
      throw new Error('Leitura não encontrada neste livro.')
    recalcularStatus(sqlite, livroId)
  })()
}

export function salvarProgresso(
  { sqlite }: Banco,
  livroId: number,
  leituraId: number,
  data: string,
  pagina: number
): void {
  idValido(livroId)
  idValido(leituraId)
  const dia = dataValida(data)
  if (!dia) throw new Error('Informe a data do progresso.')
  if (numero(pagina, 'Página') === null) throw new Error('Informe a página.')
  const leitura = sqlite
    .prepare(
      `SELECT l.data_inicio inicio, l.data_fim fim, b.paginas FROM leituras l JOIN livros b ON b.id = l.livro_id WHERE l.id = ? AND l.livro_id = ?`
    )
    .get(leituraId, livroId) as { inicio: string | null; fim: string | null; paginas: number | null } | undefined
  if (!leitura) throw new Error('Leitura não encontrada neste livro.')
  if (leitura.paginas && pagina > leitura.paginas)
    throw new Error('A página ultrapassa o total do livro. Corrija o total na ficha se necessário.')
  if ((leitura.inicio && dia < leitura.inicio) || (leitura.fim && dia > leitura.fim))
    throw new Error('O progresso deve estar entre o início e o fim da leitura.')
  const existente = sqlite.prepare('SELECT id FROM progresso WHERE leitura_id = ? AND data = ?').get(leituraId, dia) as
    { id: number } | undefined
  if (existente) sqlite.prepare('UPDATE progresso SET pagina = ? WHERE id = ?').run(pagina, existente.id)
  else sqlite.prepare('INSERT INTO progresso (leitura_id, data, pagina) VALUES (?, ?, ?)').run(leituraId, dia, pagina)
}

export function removerProgresso({ sqlite }: Banco, livroId: number, id: number): void {
  idValido(livroId)
  idValido(id)
  if (
    !sqlite
      .prepare('DELETE FROM progresso WHERE id = ? AND leitura_id IN (SELECT id FROM leituras WHERE livro_id = ?)')
      .run(id, livroId).changes
  )
    throw new Error('Progresso não encontrado neste livro.')
}

export function salvarCitacao({ db }: Banco, livroId: number, citacao: Omit<Citacao, 'id'> & { id?: number }): void {
  idValido(livroId)
  objeto(citacao)
  const trecho = texto(citacao.texto, 'a citação', 100000, true)!
  const pagina = numero(citacao.pagina, 'Página da citação', 1)
  if (!db.select({ id: livros.id }).from(livros).where(eq(livros.id, livroId)).get())
    throw new Error('Livro não encontrado.')
  if (citacao.id === undefined) {
    db.insert(citacoes).values({ livroId, texto: trecho, pagina }).run()
    return
  }
  idValido(citacao.id)
  const alteradas = db
    .update(citacoes)
    .set({ texto: trecho, pagina })
    .where(and(eq(citacoes.id, citacao.id), eq(citacoes.livroId, livroId)))
    .run().changes
  if (!alteradas) throw new Error('Citação não encontrada neste livro.')
}
export function removerCitacao({ db }: Banco, livroId: number, id: number): void {
  idValido(livroId)
  idValido(id)
  if (
    !db
      .delete(citacoes)
      .where(and(eq(citacoes.id, id), eq(citacoes.livroId, livroId)))
      .run().changes
  )
    throw new Error('Citação não encontrada neste livro.')
}
export function diario(banco: Banco): LeituraDiario[] {
  const leituras = banco.sqlite
    .prepare(`${SELECAO_LEITURA.replace('SELECT id,', 'SELECT livro_id AS livroId, id,')}`)
    .all() as (Leitura & { livroId: number })[]
  const progressos = banco.sqlite
    .prepare('SELECT id, leitura_id AS leituraId, data, pagina FROM progresso ORDER BY data, id')
    .all() as Progresso[]
  const livros = new Map(listarLivros(banco).map((l) => [l.id, l]))
  const porLeitura = new Map<number, Progresso[]>()
  for (const p of progressos) porLeitura.set(p.leituraId, [...(porLeitura.get(p.leituraId) ?? []), p])
  return leituras.map((l) => ({ ...l, livro: livros.get(l.livroId)!, progresso: porLeitura.get(l.id) ?? [] }))
}
