import { and, asc, eq, ne, sql } from 'drizzle-orm'
import type { ListaDados, ListaDetalhe, ListaResumo, LivroResumo } from '@shared/api'
import type { Banco } from './db/conexao'
import { listaLivros, listas, livros } from './db/esquema'
import { listarLivros } from './livros'
import { idsValidos, idValido, objeto, texto } from './validacao'

type Lista = Omit<ListaResumo, 'total' | 'capas'>

function exigirLista({ db }: Banco, id: number): Lista {
  idValido(id)
  const lista = db
    .select({ id: listas.id, nome: listas.nome, descricao: listas.descricao, ordenada: listas.ordenada })
    .from(listas)
    .where(eq(listas.id, id))
    .get()
  if (!lista) throw new Error('Lista não encontrada.')
  return lista
}

function exigirLivros({ db }: Banco, ids: number[]): void {
  for (const id of ids) {
    if (!db.select({ id: livros.id }).from(livros).where(eq(livros.id, id)).get())
      throw new Error('Um dos livros não existe mais. Atualize a seleção.')
  }
}

// Monta a biblioteca uma vez e distribui os livros entre as listas pedidas.
function montar(banco: Banco, ids?: number[]): ListaDetalhe[] {
  const resumo = listas
  const linhas = (
    ids
      ? banco.db
          .select()
          .from(resumo)
          .where(sql`${resumo.id} IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`)
      : banco.db.select().from(resumo)
  )
    .orderBy(sql`${resumo.nome} COLLATE NOCASE`)
    .all()
  if (!linhas.length) return []
  const mapa = new Map(listarLivros(banco).map((l) => [l.id, l]))
  const membros = banco.db
    .select({ lista: listaLivros.listaId, livro: listaLivros.livroId, posicao: listaLivros.posicao })
    .from(listaLivros)
    .orderBy(asc(listaLivros.listaId), asc(listaLivros.posicao), asc(listaLivros.livroId))
    .all()
  const porLista = new Map<number, LivroResumo[]>()
  for (const m of membros) {
    const livro = mapa.get(m.livro)
    if (livro) porLista.set(m.lista, [...(porLista.get(m.lista) ?? []), livro])
  }
  return linhas.map((l) => {
    const deles = porLista.get(l.id) ?? []
    // Lista sem ordem definida aparece em ordem alfabética, como a biblioteca.
    const ordenados = l.ordenada
      ? deles
      : [...deles].sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR', { sensitivity: 'base' }) || a.id - b.id)
    return {
      id: l.id,
      nome: l.nome,
      descricao: l.descricao,
      ordenada: l.ordenada,
      total: ordenados.length,
      capas: ordenados.slice(0, 5),
      livros: ordenados
    }
  })
}

export function obterLista(banco: Banco, id: number): ListaDetalhe | null {
  idValido(id)
  return montar(banco, [id])[0] ?? null
}

export function listarListas(banco: Banco): ListaResumo[] {
  return montar(banco).map(({ livros: _livros, ...lista }) => lista)
}

export function salvarLista(banco: Banco, d: ListaDados): number {
  objeto(d)
  const nome = texto(d.nome, 'o nome da lista', 200, true)!
  const descricao = texto(d.descricao, 'Descrição', 10000)
  if (typeof d.ordenada !== 'boolean') throw new Error('Tipo de lista inválido.')
  if (d.id !== undefined) exigirLista(banco, d.id)
  const { db } = banco
  if (
    db
      .select({ id: listas.id })
      .from(listas)
      .where(and(sql`lower(${listas.nome}) = lower(${nome})`, ne(listas.id, d.id ?? -1)))
      .get()
  )
    throw new Error('Já existe uma lista com esse nome.')
  if (d.id) {
    db.update(listas).set({ nome, descricao, ordenada: d.ordenada }).where(eq(listas.id, d.id)).run()
    return d.id
  }
  return db.insert(listas).values({ nome, descricao, ordenada: d.ordenada }).returning({ id: listas.id }).get().id
}

export function adicionarNaLista(banco: Banco, id: number, ids: number[]): void {
  exigirLista(banco, id)
  idsValidos(ids)
  const { db } = banco
  banco.sqlite.transaction(() => {
    exigirLivros(banco, ids)
    const { maior } = db
      .select({ maior: sql<number>`COALESCE(MAX(${listaLivros.posicao}), -1)` })
      .from(listaLivros)
      .where(eq(listaLivros.listaId, id))
      .get()!
    ids.forEach((livroId, i) =>
      db
        .insert(listaLivros)
        .values({ listaId: id, livroId, posicao: maior + 1 + i })
        .onConflictDoNothing()
        .run()
    )
  })()
}

export function removerDaLista(banco: Banco, id: number, livroId: number): void {
  exigirLista(banco, id)
  idValido(livroId)
  banco.db
    .delete(listaLivros)
    .where(and(eq(listaLivros.listaId, id), eq(listaLivros.livroId, livroId)))
    .run()
}

export function ordenarLista(banco: Banco, id: number, ids: number[]): void {
  const lista = exigirLista(banco, id)
  idsValidos(ids)
  if (!lista.ordenada) throw new Error('Ative o tipo Ordenada para definir posições.')
  const { db } = banco
  banco.sqlite.transaction(() => {
    const atuais = db.select({ id: listaLivros.livroId }).from(listaLivros).where(eq(listaLivros.listaId, id)).all()
    if (atuais.length !== ids.length || atuais.some((x) => !ids.includes(x.id)))
      throw new Error('A lista mudou. Atualize antes de reordenar.')
    ids.forEach((livroId, posicao) =>
      db
        .update(listaLivros)
        .set({ posicao })
        .where(and(eq(listaLivros.listaId, id), eq(listaLivros.livroId, livroId)))
        .run()
    )
  })()
}

export function excluirLista(banco: Banco, id: number): void {
  exigirLista(banco, id)
  banco.db.delete(listas).where(eq(listas.id, id)).run()
}
