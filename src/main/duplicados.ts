import type Database from 'better-sqlite3'
import type { DadosLivro } from '@shared/api'
import { chaveTexto } from '@shared/texto'

// Índice em memória para achar duplicados: por ISBN-13, ISBN-10 e título + autor normalizados.
// Montado com duas consultas leves; numa importação, cada livro novo entra com `adicionar`,
// então a biblioteca não é remontada a cada linha do CSV.
export interface IndiceDuplicados {
  procurar: (livro: Pick<DadosLivro, 'id' | 'titulo' | 'isbn10' | 'isbn13' | 'colaboradores'>) => number[]
  adicionar: (id: number, livro: Pick<DadosLivro, 'titulo' | 'isbn10' | 'isbn13' | 'colaboradores'>) => void
}

export function criarIndiceDuplicados(sqlite: Database.Database): IndiceDuplicados {
  const porIsbn13 = new Map<string, Set<number>>()
  const porIsbn10 = new Map<string, Set<number>>()
  const porTitulo = new Map<string, Map<number, Set<string>>>()
  const juntar = <K>(mapa: Map<K, Set<number>>, chave: K, id: number) =>
    mapa.set(chave, (mapa.get(chave) ?? new Set()).add(id))
  const registrar = (id: number, titulo: string, isbn10: string | null, isbn13: string | null, autores: string[]) => {
    if (isbn13) juntar(porIsbn13, isbn13, id)
    if (isbn10) juntar(porIsbn10, isbn10, id)
    const livros = porTitulo.get(chaveTexto(titulo)) ?? new Map<number, Set<string>>()
    livros.set(id, new Set([...(livros.get(id) ?? []), ...autores.map(chaveTexto)]))
    porTitulo.set(chaveTexto(titulo), livros)
  }

  const autores = new Map<number, string[]>()
  for (const a of sqlite
    .prepare(
      "SELECT x.livro_id id, a.nome FROM livro_autores x JOIN autores a ON a.id = x.autor_id WHERE x.papel = 'autor'"
    )
    .all() as { id: number; nome: string }[]) {
    autores.set(a.id, [...(autores.get(a.id) ?? []), a.nome])
  }
  for (const l of sqlite.prepare('SELECT id, titulo, isbn10, isbn13 FROM livros').all() as {
    id: number
    titulo: string
    isbn10: string | null
    isbn13: string | null
  }[]) {
    registrar(l.id, l.titulo, l.isbn10, l.isbn13, autores.get(l.id) ?? [])
  }

  const nomesAutores = (livro: Pick<DadosLivro, 'colaboradores'>) =>
    livro.colaboradores.filter((c) => c.papel === 'autor').map((c) => c.nome)
  return {
    procurar(livro) {
      const achados = new Set<number>([
        ...(livro.isbn13 ? (porIsbn13.get(livro.isbn13) ?? []) : []),
        ...(livro.isbn10 ? (porIsbn10.get(livro.isbn10) ?? []) : [])
      ])
      const procurados = nomesAutores(livro).map(chaveTexto)
      for (const [id, deles] of porTitulo.get(chaveTexto(livro.titulo)) ?? [])
        if (procurados.some((a) => deles.has(a))) achados.add(id)
      if (livro.id !== undefined) achados.delete(livro.id)
      return [...achados].sort((a, b) => a - b)
    },
    adicionar(id, livro) {
      registrar(id, livro.titulo, livro.isbn10, livro.isbn13, nomesAutores(livro))
    }
  }
}
