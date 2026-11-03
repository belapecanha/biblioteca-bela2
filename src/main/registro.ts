import type { DadosLivro, LivroResumo } from '@shared/api'
import { POSSES, STATUS } from '@shared/api'
import { LISTAS_CLASSIFICACAO } from '@shared/classificacoes'
import type { Banco } from './db/conexao'
import { definirClassificacoes, definirStatus, listarLivros } from './livros'
import { idValido, numero, objeto, texto } from './validacao'

const TIPOS = ['livro', 'manhwa', 'manga', 'graphic_novel', 'poesia']
const FORMATOS = ['fisico', 'ebook', 'audiolivro']
export function validarLivro(entrada: DadosLivro): DadosLivro {
  objeto(entrada)
  if (entrada.id !== undefined) idValido(entrada.id)
  if (!TIPOS.includes(entrada.tipo) || !STATUS.includes(entrada.status) ||
      (entrada.formato !== null && !FORMATOS.includes(entrada.formato)) ||
      (entrada.posse !== null && !POSSES.includes(entrada.posse)) || typeof entrada.paginasEstimadas !== 'boolean') throw new Error('Tipo, formato, posse ou status inválido.')
  if (!Array.isArray(entrada.colaboradores) || entrada.colaboradores.length > 40) throw new Error('Colaboradores inválidos.')
  const colaboradores = entrada.colaboradores.map((c) => {
    objeto(c)
    if (!['autor', 'tradutor', 'ilustrador'].includes(c.papel)) throw new Error('Papel inválido.')
    return { nome: texto(c.nome, 'o nome do colaborador', 300, true)!, pais: texto(c.pais, 'País', 100), papel: c.papel }
  })
  if (!colaboradores.some((c) => c.papel === 'autor')) throw new Error('Informe pelo menos um autor.')
  if (new Set(colaboradores.map((c) => `${c.papel}:${c.nome.toLocaleLowerCase()}`)).size !== colaboradores.length) throw new Error('Colaborador repetido.')
  const classes = (campo: 'generos' | 'temas' | 'moods', tipo: 'genero' | 'tema' | 'mood') => {
    const nomes = entrada[campo]
    if (!Array.isArray(nomes) || nomes.length > LISTAS_CLASSIFICACAO[tipo].length || nomes.some((n) => !LISTAS_CLASSIFICACAO[tipo].includes(n))) throw new Error('Classificação inválida.')
    return [...new Set(nomes)]
  }
  const isbn = (valor: string | null, tamanho: number) => {
    const limpo = texto(valor, 'ISBN', 30)?.replace(/[\s-]/g, '').toUpperCase() ?? null
    if (limpo && !(tamanho === 10 ? /^\d{9}[\dX]$/ : /^\d{13}$/).test(limpo)) throw new Error(`ISBN-${tamanho} inválido.`)
    return limpo
  }
  const serie = texto(entrada.serie, 'Série', 300)
  const volume = numero(entrada.volume, 'Volume', 0, 100000, false)
  if (volume !== null && !serie) throw new Error('Informe a série para preencher o volume.')
  return {
    ...entrada, titulo: texto(entrada.titulo, 'o título', 500, true)!, tituloOriginal: texto(entrada.tituloOriginal, 'Título original', 500),
    colaboradores, isbn10: isbn(entrada.isbn10, 10), isbn13: isbn(entrada.isbn13, 13),
    editora: texto(entrada.editora, 'Editora', 300), paisEditora: texto(entrada.paisEditora, 'País da editora', 100),
    serie, volume, paginas: numero(entrada.paginas, 'Páginas', 1), anoEdicao: numero(entrada.anoEdicao, 'Ano da edição', 1, 9999),
    anoPublicacao: numero(entrada.anoPublicacao, 'Ano da publicação', 1, 9999), idioma: texto(entrada.idioma, 'Idioma', 100),
    sinopse: texto(entrada.sinopse, 'Sinopse', 100000), notasPrivadas: texto(entrada.notasPrivadas, 'Notas privadas', 100000),
    generos: classes('generos', 'genero'), temas: classes('temas', 'tema'), moods: classes('moods', 'mood')
  }
}

function normalizar(s: string): string { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '') }
export function encontrarDuplicados(banco: Banco, entrada: DadosLivro): LivroResumo[] {
  const d = validarLivro(entrada)
  const autores = d.colaboradores.filter((c) => c.papel === 'autor').map((c) => normalizar(c.nome))
  const isbnsPorId = new Map((banco.sqlite.prepare('SELECT id, isbn10, isbn13 FROM livros').all() as { id: number; isbn10: string | null; isbn13: string | null }[]).map((l) => [l.id, l]))
  return listarLivros(banco).filter((l) => {
    if (l.id === d.id) return false
    const isbns = isbnsPorId.get(l.id)!
    return !!((d.isbn13 && isbns.isbn13 === d.isbn13) || (d.isbn10 && isbns.isbn10 === d.isbn10) ||
      (normalizar(l.titulo) === normalizar(d.titulo) && l.autores.some((a) => autores.includes(normalizar(a.nome)))))
  })
}

export function salvarDadosLivro(banco: Banco, entrada: DadosLivro): number {
  const d = validarLivro(entrada)
  const { sqlite } = banco
  return sqlite.transaction(() => {
    if (d.id && !sqlite.prepare('SELECT 1 FROM livros WHERE id = ?').get(d.id)) throw new Error('Livro não encontrado.')
    const editora = d.editora ? (sqlite.prepare(`INSERT INTO editoras (nome, pais) VALUES (?, ?)
      ON CONFLICT(nome) DO UPDATE SET pais = COALESCE(excluded.pais, pais) RETURNING id`).get(d.editora, d.paisEditora) as { id: number }).id : null
    const serie = d.serie ? (sqlite.prepare(`INSERT INTO series (nome) VALUES (?) ON CONFLICT(nome) DO UPDATE SET nome = nome RETURNING id`).get(d.serie) as { id: number }).id : null
    const valores = [d.titulo, d.tituloOriginal, d.isbn10, d.isbn13, editora, serie, d.volume, d.tipo, d.formato,
      d.paginas, Number(d.paginasEstimadas), d.anoEdicao, d.anoPublicacao, d.idioma, d.sinopse, d.posse, d.notasPrivadas]
    const campos = ['titulo', 'titulo_original', 'isbn10', 'isbn13', 'editora_id', 'serie_id', 'volume', 'tipo', 'formato',
      'paginas', 'paginas_estimadas', 'ano_edicao', 'ano_publicacao', 'idioma', 'sinopse', 'posse', 'notas_privadas']
    const id = d.id ?? Number(sqlite.prepare(`INSERT INTO livros (${campos.join(',')}) VALUES (${campos.map(() => '?').join(',')})`).run(...valores).lastInsertRowid)
    if (d.id) sqlite.prepare(`UPDATE livros SET ${campos.map((c) => `${c} = ?`).join(',')}, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`).run(...valores, id)
    sqlite.prepare('DELETE FROM livro_autores WHERE livro_id = ?').run(id)
    d.colaboradores.forEach((c, ordem) => {
      const autor = sqlite.prepare(`INSERT INTO autores (nome, pais) VALUES (?, ?) ON CONFLICT(nome) DO UPDATE SET pais = COALESCE(excluded.pais, pais) RETURNING id`).get(c.nome, c.pais) as { id: number }
      sqlite.prepare('INSERT INTO livro_autores (livro_id, autor_id, papel, ordem) VALUES (?, ?, ?, ?)').run(id, autor.id, c.papel, ordem)
    })
    definirClassificacoes(banco, id, 'genero', d.generos)
    definirClassificacoes(banco, id, 'tema', d.temas)
    definirClassificacoes(banco, id, 'mood', d.moods)
    const atual = sqlite.prepare('SELECT status FROM livros WHERE id = ?').get(id) as { status: string }
    if (!d.id || atual.status !== d.status) definirStatus(banco, id, d.status)
    return id
  })()
}

export function salvarNotas({ sqlite }: Banco, id: number, valor: string | null): void {
  idValido(id)
  const notas = texto(valor, 'Notas privadas', 100000)
  if (!sqlite.prepare('UPDATE livros SET notas_privadas = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?').run(notas, id).changes) throw new Error('Livro não encontrado.')
}
