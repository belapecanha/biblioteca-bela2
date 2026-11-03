import { existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import type { ListaDados, ListaDetalhe, ListaResumo, PainelPerfil, PendenciaDados, PerfilDados, PerfilEdicao } from '@shared/api'
import type { Banco } from './db/conexao'
import { listarLivros } from './livros'
import { baseAnalise } from './analise'
import { idValido, numero, objeto, texto } from './validacao'
import { resolverCapa } from './capas'

export function idsValidos(ids: unknown, limite = 10000): asserts ids is number[] {
  if (!Array.isArray(ids) || ids.length > limite) throw new Error('Seleção inválida.')
  ids.forEach(idValido)
  if (new Set(ids).size !== ids.length) throw new Error('A seleção contém livros repetidos.')
}
function exigirLivros(banco: Banco, ids: number[]): void {
  const obter = banco.sqlite.prepare('SELECT 1 FROM livros WHERE id = ?')
  for (const id of ids) if (!obter.get(id)) throw new Error('Um dos livros não existe mais. Atualize a seleção.')
}
function configuracao(banco: Banco, chave: string): string | null {
  return (banco.sqlite.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get(chave) as { valor: string | null } | undefined)?.valor ?? null
}
const imagem = (nome: string | null) => nome && /^[a-zA-Z0-9_.-]+\.webp$/.test(nome) ? `capa://original/${encodeURIComponent(nome)}` : null
export function dadosPerfil(banco: Banco): PerfilDados {
  return { nome: configuracao(banco, 'perfil.nome') ?? 'Isabela', frase: configuracao(banco, 'perfil.frase') ?? '', foto: imagem(configuracao(banco, 'perfil.foto')), topo: imagem(configuracao(banco, 'perfil.topo')) }
}
export async function salvarPerfil(banco: Banco, pasta: string, entrada: PerfilEdicao): Promise<void> {
  objeto(entrada)
  const nome = texto(entrada.nome, 'o nome', 100, true)!
  const frase = texto(entrada.frase, 'Frase de perfil', 300) ?? ''
  const arquivos: string[] = []
  const valores: [string, string | null][] = [['perfil.nome', nome], ['perfil.frase', frase]]
  try {
    for (const campo of ['foto', 'topo'] as const) {
      const bytes = entrada[campo]
      if (bytes === undefined) continue
      if (bytes === null) { valores.push([`perfil.${campo}`, null]); continue }
      if (!Array.isArray(bytes) || !bytes.length || bytes.length > 15 * 1024 * 1024 || bytes.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) throw new Error('Escolha uma imagem de até 15 MB.')
      const arquivo = `perfil-${campo}-${randomUUID()}.webp`
      mkdirSync(join(pasta, 'capas'), { recursive: true })
      const caminho = join(pasta, 'capas', arquivo)
      arquivos.push(caminho)
      try { await sharp(Buffer.from(bytes), { limitInputPixels: 40000000 }).rotate().resize(campo === 'foto' ? { width: 512, height: 512, fit: 'cover' } : { width: 1920, height: 600, fit: 'cover' }).webp({ quality: 88 }).toFile(caminho) } catch { throw new Error('Imagem inválida. Escolha uma foto JPG, PNG ou WebP.') }
      valores.push([`perfil.${campo}`, arquivo])
    }
    banco.sqlite.transaction(() => {
      const salvar = banco.sqlite.prepare('INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor')
      valores.forEach(([chave, valor]) => salvar.run(chave, valor))
    })()
  } catch (erro) { for (const arquivo of arquivos) { try { unlinkSync(arquivo) } catch { /* Arquivo novo ainda não escrito. */ } }; throw erro }
}
export function definirFavoritos(banco: Banco, ids: number[]): void {
  idsValidos(ids, 4)
  banco.sqlite.transaction(() => {
    exigirLivros(banco, ids)
    banco.sqlite.prepare('UPDATE livros SET favorito_posicao = NULL WHERE favorito_posicao IS NOT NULL').run()
    const atualizar = banco.sqlite.prepare('UPDATE livros SET favorito_posicao = ? WHERE id = ?')
    ids.forEach((id, i) => atualizar.run(i + 1, id))
  })()
}
export function definirFila(banco: Banco, ids: number[]): void {
  idsValidos(ids)
  banco.sqlite.transaction(() => {
    exigirLivros(banco, ids)
    const obter = banco.sqlite.prepare('SELECT status FROM livros WHERE id = ?')
    if (ids.some((id) => (obter.get(id) as { status: string }).status !== 'quero_ler')) throw new Error('A fila aceita apenas livros com status Quero ler.')
    banco.sqlite.prepare('DELETE FROM fila_meta').run()
    const inserir = banco.sqlite.prepare('INSERT INTO fila_meta (livro_id, posicao) VALUES (?, ?)')
    ids.forEach((id, i) => inserir.run(id, i))
  })()
}
export function painelPerfil(banco: Banco, ano: number): PainelPerfil {
  if (numero(ano, 'Ano', 1, 9999) === null) throw new Error('Ano inválido.')
  const base = baseAnalise(banco)
  const mapa = new Map(base.livros.map((l) => [l.id, l]))
  const concluidas = base.livros.flatMap((livro) => livro.leituras.map((l) => ({ livro, data: l.data, ano: l.ano, nota: l.nota, leituraId: l.id })))
  const favoritos = (banco.sqlite.prepare('SELECT id FROM livros WHERE favorito_posicao IS NOT NULL ORDER BY favorito_posicao').all() as { id: number }[]).map((x) => mapa.get(x.id)!)
  const fila = (banco.sqlite.prepare(`SELECT f.livro_id id FROM fila_meta f JOIN livros l ON l.id = f.livro_id WHERE l.status = 'quero_ler' ORDER BY f.posicao, l.id`).all() as { id: number }[]).map((x) => mapa.get(x.id)!)
  const lendo = (banco.sqlite.prepare(`SELECT l.id livroId, x.id leituraId, (SELECT pagina FROM progresso p WHERE p.leitura_id = x.id ORDER BY data DESC, id DESC LIMIT 1) pagina
    FROM livros l JOIN leituras x ON x.livro_id = l.id AND x.id = (SELECT MAX(id) FROM leituras WHERE livro_id = l.id) WHERE l.status = 'lendo' AND x.status = 'lendo' ORDER BY x.id DESC`).all() as { livroId: number; leituraId: number; pagina: number | null }[]).map((x) => ({ livro: mapa.get(x.livroId)!, leituraId: x.leituraId, pagina: x.pagina }))
  const series = (banco.sqlite.prepare('SELECT id, nome, total_volumes total FROM series ORDER BY nome COLLATE NOCASE').all() as { id: number; nome: string; total: number | null }[]).map((s) => {
    const livros = base.livros.filter((l) => l.serie?.id === s.id)
    return { ...s, cadastrados: livros.length, lidos: livros.filter((l) => l.leituras.length > 0).length, emLeitura: livros.some((l) => l.status === 'lendo' || l.status === 'pausado') }
  }).filter((s) => (s.lidos > 0 || s.emLeitura) && (s.lidos < s.cadastrados || (s.total !== null && s.lidos < s.total)))
  return {
    perfil: dadosPerfil(banco), favoritos, fila, lendo, meta: base.metas[ano] ?? null, series,
    numeros: { lidos: base.livros.filter((l) => l.leituras.length).length, noAno: concluidas.filter((l) => l.ano === ano).length, paginas: concluidas.reduce((s, l) => s + (l.livro.paginas ?? 0), 0), series: new Set(base.livros.flatMap((l) => l.serie ? [l.serie.id] : [])).size, listas: (banco.sqlite.prepare('SELECT COUNT(*) n FROM listas').get() as { n: number }).n },
    atividade: concluidas.sort((a, b) => (b.ano ?? 0) - (a.ano ?? 0) || (b.data ?? '').localeCompare(a.data ?? '') || b.leituraId - a.leituraId).slice(0, 10)
  }
}
function exigirLista(banco: Banco, id: number) {
  idValido(id)
  const lista = banco.sqlite.prepare('SELECT id, nome, descricao, ordenada FROM listas WHERE id = ?').get(id) as (Omit<ListaResumo, 'total' | 'capas' | 'ordenada'> & { ordenada: number }) | undefined
  if (!lista) throw new Error('Lista não encontrada.')
  return lista
}
export function obterLista(banco: Banco, id: number): ListaDetalhe | null {
  idValido(id)
  if (!banco.sqlite.prepare('SELECT 1 FROM listas WHERE id = ?').get(id)) return null
  const lista = exigirLista(banco, id)
  const mapa = new Map(listarLivros(banco).map((l) => [l.id, l]))
  const livros = (banco.sqlite.prepare(`SELECT x.livro_id id FROM lista_livros x JOIN livros l ON l.id = x.livro_id WHERE lista_id = ? ORDER BY ${lista.ordenada ? 'x.posicao, x.livro_id' : 'l.titulo COLLATE NOCASE, l.id'}`).all(id) as { id: number }[]).map((x) => mapa.get(x.id)!)
  return { ...lista, ordenada: !!lista.ordenada, total: livros.length, capas: livros.slice(0, 5), livros }
}
export function listarListas(banco: Banco): ListaResumo[] {
  return (banco.sqlite.prepare('SELECT id FROM listas ORDER BY nome COLLATE NOCASE').all() as { id: number }[]).map(({ id }) => { const { livros: _livros, ...lista } = obterLista(banco, id)!; return lista })
}
export function salvarLista(banco: Banco, d: ListaDados): number {
  objeto(d)
  const nome = texto(d.nome, 'o nome da lista', 200, true)!
  const descricao = texto(d.descricao, 'Descrição', 10000)
  if (typeof d.ordenada !== 'boolean') throw new Error('Tipo de lista inválido.')
  if (d.id !== undefined) exigirLista(banco, d.id)
  if (banco.sqlite.prepare('SELECT 1 FROM listas WHERE lower(nome) = lower(?) AND id != ?').get(nome, d.id ?? -1)) throw new Error('Já existe uma lista com esse nome.')
  if (d.id) { banco.sqlite.prepare('UPDATE listas SET nome = ?, descricao = ?, ordenada = ? WHERE id = ?').run(nome, descricao, Number(d.ordenada), d.id); return d.id }
  return Number(banco.sqlite.prepare('INSERT INTO listas (nome, descricao, ordenada) VALUES (?, ?, ?)').run(nome, descricao, Number(d.ordenada)).lastInsertRowid)
}
export function adicionarNaLista(banco: Banco, id: number, ids: number[]): void {
  exigirLista(banco, id); idsValidos(ids)
  banco.sqlite.transaction(() => {
    exigirLivros(banco, ids)
    let posicao = (banco.sqlite.prepare('SELECT COALESCE(MAX(posicao), -1) n FROM lista_livros WHERE lista_id = ?').get(id) as { n: number }).n + 1
    const inserir = banco.sqlite.prepare('INSERT OR IGNORE INTO lista_livros (lista_id, livro_id, posicao) VALUES (?, ?, ?)')
    ids.forEach((livro) => inserir.run(id, livro, posicao++))
  })()
}
export function removerDaLista(banco: Banco, id: number, livroId: number): void { exigirLista(banco, id); idValido(livroId); banco.sqlite.prepare('DELETE FROM lista_livros WHERE lista_id = ? AND livro_id = ?').run(id, livroId) }
export function ordenarLista(banco: Banco, id: number, ids: number[]): void {
  const lista = exigirLista(banco, id); idsValidos(ids)
  if (!lista.ordenada) throw new Error('Ative o tipo Ordenada para definir posições.')
  banco.sqlite.transaction(() => {
    const atuais = banco.sqlite.prepare('SELECT livro_id id FROM lista_livros WHERE lista_id = ?').all(id) as { id: number }[]
    if (atuais.length !== ids.length || atuais.some((x) => !ids.includes(x.id))) throw new Error('A lista mudou. Atualize antes de reordenar.')
    const atualizar = banco.sqlite.prepare('UPDATE lista_livros SET posicao = ? WHERE lista_id = ? AND livro_id = ?')
    ids.forEach((livro, pos) => atualizar.run(pos, id, livro))
  })()
}
export function excluirLista(banco: Banco, id: number): void { exigirLista(banco, id); banco.sqlite.prepare('DELETE FROM listas WHERE id = ?').run(id) }
export function pendenciasDados(banco: Banco, pasta: string): PendenciaDados[] {
  const livros = listarLivros(banco)
  const lidos = new Set((banco.sqlite.prepare("SELECT DISTINCT livro_id id FROM leituras WHERE status = 'lido' AND nota IS NULL").all() as { id: number }[]).map((l) => l.id))
  const aproximadas = new Set((banco.sqlite.prepare("SELECT DISTINCT livro_id id FROM leituras WHERE status = 'lido' AND precisao_fim = 'ano'").all() as { id: number }[]).map((l) => l.id))
  const semData = new Set((banco.sqlite.prepare("SELECT DISTINCT livro_id id FROM leituras WHERE status = 'lido' AND precisao_fim IS NULL").all() as { id: number }[]).map((l) => l.id))
  const semSinopse = new Set((banco.sqlite.prepare("SELECT id FROM livros WHERE sinopse IS NULL OR trim(sinopse) = ''").all() as { id: number }[]).map((l) => l.id))
  return [
    { codigo: 'nota', rotulo: 'Lidos sem nota', livros: livros.filter((l) => lidos.has(l.id)) },
    { codigo: 'paginas', rotulo: 'Sem páginas', livros: livros.filter((l) => !l.paginas) },
    { codigo: 'genero', rotulo: 'Sem gênero', livros: livros.filter((l) => !l.generos.length) },
    { codigo: 'mood', rotulo: 'Sem mood', livros: livros.filter((l) => !l.moods.length) },
    { codigo: 'capa', rotulo: 'Sem capa', livros: livros.filter((l) => { const caminho = l.capa ? resolverCapa(join(pasta, 'capas'), join(pasta, 'miniaturas'), l.capa) : null; return !caminho || !existsSync(caminho) }) },
    { codigo: 'formato', rotulo: 'Sem formato', livros: livros.filter((l) => !l.formato) },
    { codigo: 'posse', rotulo: 'Posse a definir', livros: livros.filter((l) => !l.posse) },
    { codigo: 'aproximada', rotulo: 'Data aproximada', livros: livros.filter((l) => aproximadas.has(l.id)) },
    { codigo: 'data', rotulo: 'Sem data de leitura', livros: livros.filter((l) => semData.has(l.id)) },
    { codigo: 'sinopse', rotulo: 'Sem sinopse', livros: livros.filter((l) => semSinopse.has(l.id)) },
    { codigo: 'colecao', rotulo: 'Coleções a revisar', livros: livros.filter((l) => /\b(box\s*set|coleção|collection|books?\s+\d+\s*[-–]\s*\d+)\b/i.test(l.titulo)) }
  ]
}
