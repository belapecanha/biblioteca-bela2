import { POSSES, STATUS } from '@shared/api'
import type { Autor, Citacao, Colaborador, Leitura, LivroDetalhe, LivroResumo, Posse, Progresso, Status } from '@shared/api'
import { LISTAS_CLASSIFICACAO, type TipoClassificacao } from '@shared/classificacoes'
import type { Banco } from './db/conexao'

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
    (SELECT nota FROM leituras x WHERE x.livro_id = l.id ORDER BY x.id DESC LIMIT 1) AS nota,
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

export function listarLivros({ sqlite }: Banco, filtroId?: number): LivroResumo[] {
  const onde = filtroId === undefined ? '' : ' WHERE l.id = ?'
  const parametros = filtroId === undefined ? [] : [filtroId]
  const linhas = sqlite.prepare(`${SELECAO}${onde} ORDER BY l.titulo COLLATE NOCASE`).all(...parametros) as LinhaLivro[]

  const autores = agrupar(
    sqlite
      .prepare(`SELECT x.livro_id, a.id, a.nome, a.pais FROM livro_autores x JOIN autores a ON a.id = x.autor_id
        WHERE x.papel = 'autor' ${filtroId === undefined ? '' : 'AND x.livro_id = ?'} ORDER BY x.ordem`)
      .all(...parametros) as (Autor & { livro_id: number })[]
  )
  const classes = agrupar(
    sqlite
      .prepare(`SELECT x.livro_id, c.tipo, c.nome FROM livro_classificacoes x JOIN classificacoes c ON c.id = x.classificacao_id
        ${filtroId === undefined ? '' : 'WHERE x.livro_id = ?'} ORDER BY x.ordem`)
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
    .prepare(`SELECT l.sinopse, l.ano_publicacao, l.ano_edicao, l.isbn13, l.isbn10, l.idioma, l.notas_privadas
      FROM livros l WHERE l.id = ?`)
    .get(id) as { sinopse: string | null; ano_publicacao: number | null; ano_edicao: number | null; isbn13: string | null; isbn10: string | null; idioma: string | null; notas_privadas: string | null; }
  const leituras = banco.sqlite
    .prepare(`SELECT id, status, formato, data_inicio AS dataInicio, data_fim AS dataFim, ano_fim AS anoFim, precisao_fim AS precisaoFim, nota, resenha
      FROM leituras WHERE livro_id = ? ORDER BY id DESC`)
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
    colaboradores: banco.sqlite.prepare(`SELECT a.nome, a.pais, x.papel FROM livro_autores x JOIN autores a ON a.id = x.autor_id WHERE x.livro_id = ? ORDER BY x.ordem`).all(id) as Colaborador[],
    leituras,
    progresso: banco.sqlite.prepare(`SELECT p.id, p.leitura_id AS leituraId, p.data, p.pagina FROM progresso p JOIN leituras l ON l.id = p.leitura_id WHERE l.livro_id = ? ORDER BY p.data DESC, p.id DESC`).all(id) as Progresso[],
    citacoes: banco.sqlite.prepare('SELECT id, texto, pagina FROM citacoes WHERE livro_id = ? ORDER BY id DESC').all(id) as Citacao[]
  }
}

function exigirId(id: unknown): number {
  if (!Number.isInteger(id) || (id as number) <= 0) throw new Error('Livro inválido.')
  return id as number
}

export function definirNota({ sqlite }: Banco, id: number, nota: number | null): void {
  exigirId(id)
  if (nota !== null && !(Number.isFinite(nota) && nota >= 0.5 && nota <= 5 && Number.isInteger(nota * 2))) {
    throw new Error('Nota inválida.')
  }
  const leitura = sqlite
    .prepare(`SELECT id FROM leituras WHERE livro_id = ? ORDER BY id DESC LIMIT 1`)
    .get(id) as { id: number } | undefined
  if (!leitura) throw new Error('Registre uma leitura antes de dar a nota.')
  sqlite.prepare('UPDATE leituras SET nota = ? WHERE id = ?').run(nota, leitura.id)
}

export function definirStatus({ sqlite }: Banco, id: number, status: Status, hoje = dataDeHoje()): void {
  exigirId(id)
  if (!STATUS.includes(status)) throw new Error('Status inválido.')

  sqlite.transaction(() => {
    const aberta = sqlite
      .prepare(`SELECT id FROM leituras WHERE livro_id = ? AND status IN ('lendo', 'pausado', 'abandonado')
        AND id = (SELECT MAX(id) FROM leituras WHERE livro_id = ?) LIMIT 1`)
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
        .prepare(`DELETE FROM leituras WHERE livro_id = ? AND status IN ('lendo', 'pausado', 'abandonado') AND nota IS NULL AND resenha IS NULL
          AND data_inicio IS NULL AND data_fim IS NULL AND ano_fim IS NULL
          AND NOT EXISTS (SELECT 1 FROM progresso p WHERE p.leitura_id = leituras.id)`)
        .run(id)
    } else if (aberta) {
      sqlite.prepare('UPDATE leituras SET status = ? WHERE id = ?').run(status, aberta.id)
    } else {
      inserir.run(id, status)
    }

    sqlite.prepare(`UPDATE livros SET status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`).run(status, id)
    if (status === 'quero_ler') {
      sqlite
        .prepare('INSERT OR IGNORE INTO fila_meta (livro_id, posicao) SELECT ?, COALESCE(MAX(posicao), -1) + 1 FROM fila_meta')
        .run(id)
    } else {
      sqlite.prepare('DELETE FROM fila_meta WHERE livro_id = ?').run(id)
    }
  })()
}

export function definirPosse({ sqlite }: Banco, ids: number[], posse: Posse | null): void {
  if (!Array.isArray(ids)) throw new Error('Lista inválida.')
  ids.forEach(exigirId)
  if (posse !== null && !POSSES.includes(posse)) throw new Error('Posse inválida.')
  const atualizar = sqlite.prepare('UPDATE livros SET posse = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?')
  sqlite.transaction(() => ids.forEach((id) => atualizar.run(posse, id)))()
}

export function definirClassificacoes({ sqlite }: Banco, id: number, tipo: TipoClassificacao, nomes: string[]): void {
  exigirId(id)
  const permitidos = LISTAS_CLASSIFICACAO[tipo]
  if (!permitidos) throw new Error('Tipo inválido.')
  if (!Array.isArray(nomes) || nomes.some((n) => !permitidos.includes(n))) throw new Error('Classificação inválida.')

  sqlite.transaction(() => {
    sqlite
      .prepare(`DELETE FROM livro_classificacoes WHERE livro_id = ? AND classificacao_id IN (SELECT id FROM classificacoes WHERE tipo = ?)`)
      .run(id, tipo)
    const inserir = sqlite.prepare(`INSERT INTO livro_classificacoes (livro_id, classificacao_id, ordem)
      SELECT ?, id, ? FROM classificacoes WHERE tipo = ? AND nome = ?`)
    nomes.forEach((nome, i) => inserir.run(id, i, tipo, nome))
  })()
}

function dataDeHoje(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
