import { desc, eq, sql } from 'drizzle-orm'
import { citacoes, editoras } from './db/esquema'
import { POSSES, STATUS, STATUS_EM_ANDAMENTO } from '@shared/dominio'
import { dataLocal } from '@shared/datas'
import type { Autor, Colaborador, Leitura, LivroDetalhe, LivroResumo, Posse, Progresso, Status } from '@shared/api'
import { LISTAS_CLASSIFICACAO, type TipoClassificacao } from '@shared/classificacoes'
import type { Banco } from './db/conexao'
import { limparOrfaos } from './entidades'
import { apagarSeOrfas } from './imagens'
import { recalcularStatus, ultimaLeitura } from './status'
import { idValido, notaValida, opcao, opcaoOuNulo } from './validacao'

interface LinhaLivro {
  id: number
  titulo: string
  titulo_original: string | null
  serie_id: number | null
  serie: string | null
  editora_id: number | null
  editora: string | null
  pais_editora: string | null
  volume: number | null
  tipo: LivroResumo['tipo']
  formato: LivroResumo['formato']
  paginas: number | null
  paginas_estimadas: number
  status: Status
  posse: Posse | null
  favorito_posicao: number | null
  capa_arquivo: string | null
  miniatura_arquivo: string | null
  cor_principal: string | null
  cor_destaque_1: string | null
  cor_destaque_2: string | null
  cor_texto: string | null
  nota: number | null
  data_lida: string | null
  ano_lido: number | null
}

const SELECAO = `
  SELECT l.*, s.nome AS serie, e.nome AS editora, e.pais AS pais_editora,
    -- Nota da leitura mais recente que tem nota: uma releitura recém-começada não apaga as estrelas.
    (SELECT nota FROM leituras x WHERE x.livro_id = l.id AND x.nota IS NOT NULL ORDER BY x.id DESC LIMIT 1) AS nota,
    (SELECT data_fim FROM leituras x WHERE x.livro_id = l.id AND x.status = 'lido' ORDER BY x.id DESC LIMIT 1) AS data_lida,
    (SELECT ano_fim FROM leituras x WHERE x.livro_id = l.id AND x.status = 'lido' ORDER BY x.id DESC LIMIT 1) AS ano_lido
  FROM livros l LEFT JOIN series s ON s.id = l.serie_id LEFT JOIN editoras e ON e.id = l.editora_id`

function agrupar<T>(linhas: (T & { livro_id: number })[]): Map<number, T[]> {
  const mapa = new Map<number, T[]>()
  for (const linha of linhas) {
    const lista = mapa.get(linha.livro_id)
    if (lista) lista.push(linha)
    else mapa.set(linha.livro_id, [linha])
  }
  return mapa
}

// Sem filtro, a biblioteca inteira; com um id ou uma lista de ids, só esses livros.
export function listarLivros({ sqlite }: Banco, filtro?: number | number[]): LivroResumo[] {
  const ids = filtro === undefined ? undefined : Array.isArray(filtro) ? filtro : [filtro]
  if (ids && !ids.length) return []
  const onde = ids ? ' WHERE l.id IN (SELECT value FROM json_each(?))' : ''
  const parametros = ids ? [JSON.stringify(ids)] : []
  const linhas = sqlite.prepare(`${SELECAO}${onde} ORDER BY l.titulo COLLATE NOCASE`).all(...parametros) as LinhaLivro[]

  const autores = agrupar(
    sqlite
      .prepare(
        `SELECT x.livro_id, a.id, a.nome, a.pais FROM livro_autores x JOIN autores a ON a.id = x.autor_id
        WHERE x.papel = 'autor' ${ids ? 'AND x.livro_id IN (SELECT value FROM json_each(?))' : ''} ORDER BY x.ordem`
      )
      .all(...parametros) as (Autor & { livro_id: number })[]
  )
  const classes = agrupar(
    sqlite
      .prepare(
        `SELECT x.livro_id, c.tipo, c.nome FROM livro_classificacoes x JOIN classificacoes c ON c.id = x.classificacao_id
        ${ids ? 'WHERE x.livro_id IN (SELECT value FROM json_each(?))' : ''} ORDER BY x.ordem`
      )
      .all(...parametros) as { livro_id: number; tipo: TipoClassificacao; nome: string }[]
  )

  return linhas.map((l) => {
    const dele = classes.get(l.id) ?? []
    const nomes = (tipo: TipoClassificacao) => dele.filter((c) => c.tipo === tipo).map((c) => c.nome)
    return {
      id: l.id,
      titulo: l.titulo,
      tituloOriginal: l.titulo_original,
      autores: (autores.get(l.id) ?? []).map(({ id, nome, pais }) => ({ id, nome, pais })),
      editora: l.editora_id && l.editora ? { id: l.editora_id, nome: l.editora } : null,
      paisEditora: l.pais_editora,
      serie: l.serie_id && l.serie ? { id: l.serie_id, nome: l.serie } : null,
      volume: l.volume,
      tipo: l.tipo,
      formato: l.formato,
      paginas: l.paginas,
      paginasEstimadas: !!l.paginas_estimadas,
      status: l.status,
      posse: l.posse,
      favorito: l.favorito_posicao !== null,
      nota: l.nota,
      anoLido: l.ano_lido ?? (l.data_lida ? Number(l.data_lida.slice(0, 4)) : null),
      dataLida: l.data_lida,
      capa: l.capa_arquivo ? `capa://original/${encodeURIComponent(l.capa_arquivo)}` : null,
      miniatura: l.miniatura_arquivo ? `capa://miniatura/${encodeURIComponent(l.miniatura_arquivo)}` : null,
      corPrincipal: l.cor_principal,
      coresDestaque: [l.cor_destaque_1, l.cor_destaque_2].filter((c): c is string => !!c),
      corTexto: l.cor_texto,
      generos: nomes('genero'),
      temas: nomes('tema'),
      moods: nomes('mood')
    }
  })
}

export function obterLivro(banco: Banco, id: number): LivroDetalhe | null {
  const resumo = listarLivros(banco, id)[0]
  if (!resumo) return null
  const extra = banco.sqlite
    .prepare(
      `SELECT l.sinopse, l.ano_publicacao, l.ano_edicao, l.isbn13, l.isbn10, l.idioma, l.notas_privadas
      FROM livros l WHERE l.id = ?`
    )
    .get(id) as {
    sinopse: string | null
    ano_publicacao: number | null
    ano_edicao: number | null
    isbn13: string | null
    isbn10: string | null
    idioma: string | null
    notas_privadas: string | null
  }
  const leituras = banco.sqlite
    .prepare(
      `SELECT id, status, formato, data_inicio AS dataInicio, data_fim AS dataFim, ano_fim AS anoFim, precisao_fim AS precisaoFim, nota, resenha
      FROM leituras WHERE livro_id = ? ORDER BY id DESC`
    )
    .all(id) as Leitura[]
  return {
    ...resumo,
    sinopse: extra.sinopse,
    anoPublicacao: extra.ano_publicacao,
    anoEdicao: extra.ano_edicao,
    isbn13: extra.isbn13,
    isbn10: extra.isbn10,
    idioma: extra.idioma,
    notasPrivadas: extra.notas_privadas,
    colaboradores: banco.sqlite
      .prepare(
        `SELECT a.nome, a.pais, x.papel FROM livro_autores x JOIN autores a ON a.id = x.autor_id WHERE x.livro_id = ? ORDER BY x.ordem`
      )
      .all(id) as Colaborador[],
    leituras,
    progresso: banco.sqlite
      .prepare(
        `SELECT p.id, p.leitura_id AS leituraId, p.data, p.pagina FROM progresso p JOIN leituras l ON l.id = p.leitura_id WHERE l.livro_id = ? ORDER BY p.data DESC, p.id DESC`
      )
      .all(id) as Progresso[],
    citacoes: banco.db
      .select({ id: citacoes.id, texto: citacoes.texto, pagina: citacoes.pagina })
      .from(citacoes)
      .where(eq(citacoes.livroId, id))
      .orderBy(desc(citacoes.id))
      .all()
  }
}

// A nota vai para a leitura atual (a mais recente).
export function definirNota({ sqlite }: Banco, id: number, nota: number | null): void {
  idValido(id)
  const valor = notaValida(nota)
  const leitura = ultimaLeitura(sqlite, id)
  if (!leitura) throw new Error('Registre uma leitura antes de dar a nota.')
  sqlite.prepare('UPDATE leituras SET nota = ? WHERE id = ?').run(valor, leitura.id)
}

export function definirStatus({ sqlite }: Banco, id: number, status: Status, hoje = dataLocal()): void {
  idValido(id)
  opcao(STATUS, status, 'Status')

  sqlite.transaction(() => {
    const aberta = sqlite
      .prepare(
        `SELECT id FROM leituras WHERE livro_id = ? AND status IN ('lendo', 'pausado', 'abandonado')
        AND id = (SELECT MAX(id) FROM leituras WHERE livro_id = ?) LIMIT 1`
      )
      .get(id, id) as { id: number } | undefined
    const jaLido = sqlite.prepare(`SELECT 1 FROM leituras WHERE livro_id = ? AND status = 'lido' LIMIT 1`).get(id)
    const inserir = sqlite.prepare('INSERT INTO leituras (livro_id, status) VALUES (?, ?)')

    if (status === 'lido') {
      if (aberta) {
        sqlite
          .prepare(`UPDATE leituras SET status = 'lido', data_fim = ?, ano_fim = ?, precisao_fim = 'dia' WHERE id = ?`)
          .run(hoje, Number(hoje.slice(0, 4)), aberta.id)
      } else if (!jaLido) {
        inserir.run(id, 'lido')
      }
    } else if (status === 'quero_ler') {
      // Só descarta uma leitura aberta que ainda não tem nada registrado.
      sqlite
        .prepare(
          `DELETE FROM leituras WHERE livro_id = ? AND status IN ('lendo', 'pausado', 'abandonado') AND nota IS NULL AND resenha IS NULL
          AND data_inicio IS NULL AND data_fim IS NULL AND ano_fim IS NULL
          AND NOT EXISTS (SELECT 1 FROM progresso p WHERE p.leitura_id = leituras.id)`
        )
        .run(id)
      const ultima = ultimaLeitura(sqlite, id)
      if (ultima && STATUS_EM_ANDAMENTO.includes(ultima.status)) {
        throw new Error(
          'A leitura em andamento já tem dados registrados (datas, nota, resenha ou progresso). Abandone-a ou exclua-a no histórico antes de voltar para Quero ler.'
        )
      }
    } else if (aberta) {
      sqlite.prepare('UPDATE leituras SET status = ? WHERE id = ?').run(status, aberta.id)
    } else {
      inserir.run(id, status)
    }

    recalcularStatus(sqlite, id, status)
  })()
}

export function definirPosse({ sqlite }: Banco, ids: number[], posse: Posse | null): void {
  if (!Array.isArray(ids)) throw new Error('Lista inválida.')
  ids.forEach(idValido)
  opcaoOuNulo(POSSES, posse, 'Posse')
  const atualizar = sqlite.prepare('UPDATE livros SET posse = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?')
  sqlite.transaction(() => ids.forEach((id) => atualizar.run(posse, id)))()
}

export function definirClassificacoes({ sqlite }: Banco, id: number, tipo: TipoClassificacao, nomes: string[]): void {
  idValido(id)
  const permitidos = LISTAS_CLASSIFICACAO[tipo]
  if (!permitidos) throw new Error('Tipo inválido.')
  if (!Array.isArray(nomes) || nomes.some((n) => !permitidos.includes(n))) throw new Error('Classificação inválida.')

  sqlite.transaction(() => {
    sqlite
      .prepare(
        `DELETE FROM livro_classificacoes WHERE livro_id = ? AND classificacao_id IN (SELECT id FROM classificacoes WHERE tipo = ?)`
      )
      .run(id, tipo)
    const inserir = sqlite.prepare(`INSERT INTO livro_classificacoes (livro_id, classificacao_id, ordem)
      SELECT ?, id, ? FROM classificacoes WHERE tipo = ? AND nome = ?`)
    nomes.forEach((nome, i) => inserir.run(id, i, tipo, nome))
  })()
}

export function listarEditoras({ db }: Banco): { nome: string; pais: string | null }[] {
  return db
    .select({ nome: editoras.nome, pais: editoras.pais })
    .from(editoras)
    .orderBy(sql`${editoras.nome} COLLATE NOCASE`)
    .all()
}

// Apaga o livro e tudo o que é dele (leituras, progresso, citações, listas: ON DELETE CASCADE).
// Autores, editora e série sem outros livros saem junto; as imagens, depois do commit.
export function excluirLivro(banco: Banco, pastaDados: string, id: number): void {
  idValido(id)
  const { sqlite } = banco
  const imagens = sqlite.transaction(() => {
    const livro = sqlite
      .prepare('SELECT capa_arquivo capa, miniatura_arquivo miniatura FROM livros WHERE id = ?')
      .get(id) as { capa: string | null; miniatura: string | null } | undefined
    if (!livro) throw new Error('Livro não encontrado.')
    sqlite.prepare('DELETE FROM livros WHERE id = ?').run(id)
    limparOrfaos(sqlite)
    return [
      { pasta: 'capas' as const, nome: livro.capa ?? '' },
      { pasta: 'miniaturas' as const, nome: livro.miniatura ?? '' }
    ]
  })()
  apagarSeOrfas(sqlite, pastaDados, imagens)
}
