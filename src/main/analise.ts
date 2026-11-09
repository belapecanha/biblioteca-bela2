import type { BaseAnalise, LeituraAnalise, LivroAnalise } from '@shared/api'
import type { Banco } from './db/conexao'
import { listarLivros } from './livros'
import { eq, like } from 'drizzle-orm'
import { idsValidos, numero } from './validacao'
import { horaLocal } from './db/tempo'
import { configuracoes, metas as tabelaMetas } from './db/esquema'

/** Favoritos escolhidos para a imagem da retrospectiva, um registro por ano em `configuracoes`. */
const PREFIXO_FAVORITOS = 'retrospectiva.favoritos.'
export const LIMITE_FAVORITOS_ANO = 5

export function baseAnalise(banco: Banco): BaseAnalise {
  const { sqlite } = banco
  const extras = new Map(
    (
      sqlite
        .prepare(
          `SELECT l.id, l.ano_publicacao AS anoPublicacao, e.pais, l.cor_destaque_1 AS cor1, l.cor_destaque_2 AS cor2,
        l.origem, ${horaLocal('l.criado_em')} AS criadoEm, (SELECT MIN(data_inicio) FROM leituras x WHERE x.livro_id = l.id) AS primeiroInicio
      FROM livros l LEFT JOIN editoras e ON e.id = l.editora_id`
        )
        .all() as {
        id: number
        anoPublicacao: number | null
        pais: string | null
        cor1: string | null
        cor2: string | null
        origem: LivroAnalise['origem']
        criadoEm: string
        primeiroInicio: string | null
      }[]
    ).map((x) => [x.id, x])
  )
  const leituras = new Map<number, LeituraAnalise[]>()
  const linhas = sqlite
    .prepare(
      `SELECT id, livro_id AS livroId, formato, COALESCE(ano_fim, CAST(substr(data_fim, 1, 4) AS INTEGER)) AS ano, data_fim AS data,
      precisao_fim AS precisao, nota, resenha IS NOT NULL AND trim(resenha) != '' AS temResenha
    FROM leituras WHERE status = 'lido' ORDER BY id`
    )
    .all() as (Omit<LeituraAnalise, 'temResenha'> & { livroId: number; temResenha: number })[]
  for (const { livroId, temResenha, ...l } of linhas)
    leituras.set(livroId, [...(leituras.get(livroId) ?? []), { ...l, temResenha: !!temResenha }])

  const metas: Record<number, number> = {}
  for (const m of banco.db.select().from(tabelaMetas).all()) metas[m.ano] = m.livros

  const favoritosAno: Record<number, number[]> = {}
  for (const c of banco.db
    .select()
    .from(configuracoes)
    .where(like(configuracoes.chave, `${PREFIXO_FAVORITOS}%`))
    .all()) {
    try {
      const ids: unknown = JSON.parse(c.valor ?? '')
      if (Array.isArray(ids))
        favoritosAno[Number(c.chave.slice(PREFIXO_FAVORITOS.length))] = ids.filter(Number.isInteger)
    } catch {
      // Valor corrompido: o ano volta a usar a sugestão automática.
    }
  }

  return {
    metas,
    favoritosAno,
    livros: listarLivros(banco).map((l) => {
      const x = extras.get(l.id)!
      return {
        ...l,
        anoPublicacao: x.anoPublicacao,
        pais: x.pais,
        cor1: x.cor1,
        cor2: x.cor2,
        origem: x.origem,
        criadoEm: x.criadoEm,
        primeiroInicio: x.primeiroInicio,
        leituras: leituras.get(l.id) ?? []
      }
    })
  }
}

export function definirMeta({ db }: Banco, ano: number, livros: number | null): void {
  const a = numero(ano, 'Ano da meta', 1, 9999)
  const n = numero(livros, 'Meta', 1, 100000)
  if (a === null) throw new Error('Ano da meta: número inválido.')
  if (n === null) db.delete(tabelaMetas).where(eq(tabelaMetas.ano, a)).run()
  else
    db.insert(tabelaMetas)
      .values({ ano: a, livros: n })
      .onConflictDoUpdate({ target: tabelaMetas.ano, set: { livros: n } })
      .run()
}

/** Grava os favoritos do ano (null volta à sugestão automática). Só aceita livros lidos naquele ano. */
export function definirFavoritosDoAno(banco: Banco, ano: number, ids: number[] | null): void {
  const a = numero(ano, 'Ano', 1, 9999)
  if (a === null) throw new Error('Ano: número inválido.')
  const chave = `${PREFIXO_FAVORITOS}${a}`
  if (ids === null) {
    banco.db.delete(configuracoes).where(eq(configuracoes.chave, chave)).run()
    return
  }
  idsValidos(ids, LIMITE_FAVORITOS_ANO)
  const lidoNoAno = banco.sqlite.prepare(
    "SELECT 1 FROM leituras WHERE livro_id = ? AND status = 'lido' AND ano_fim = ?"
  )
  if (ids.some((id) => !lidoNoAno.get(id, a))) throw new Error(`Escolha apenas livros lidos em ${a}.`)
  const valor = JSON.stringify(ids)
  banco.db
    .insert(configuracoes)
    .values({ chave, valor })
    .onConflictDoUpdate({ target: configuracoes.chave, set: { valor } })
    .run()
}
