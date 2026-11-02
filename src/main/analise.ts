import type { BaseAnalise, LeituraAnalise, LivroAnalise } from '@shared/api'
import type { Banco } from './db/conexao'
import { listarLivros } from './livros'
import { numero } from './validacao'

export function baseAnalise(banco: Banco): BaseAnalise {
  const { sqlite } = banco
  const extras = new Map(
    (sqlite.prepare(`SELECT l.id, l.ano_publicacao AS anoPublicacao, e.pais, l.cor_destaque_1 AS cor1, l.cor_destaque_2 AS cor2,
        l.origem, l.criado_em AS criadoEm, (SELECT MIN(data_inicio) FROM leituras x WHERE x.livro_id = l.id) AS primeiroInicio
      FROM livros l LEFT JOIN editoras e ON e.id = l.editora_id`).all() as {
        id: number; anoPublicacao: number | null; pais: string | null; cor1: string | null; cor2: string | null
        origem: LivroAnalise['origem']; criadoEm: string; primeiroInicio: string | null
      }[]).map((x) => [x.id, x])
  )
  const leituras = new Map<number, LeituraAnalise[]>()
  const linhas = sqlite.prepare(`SELECT id, livro_id AS livroId, formato, COALESCE(ano_fim, CAST(substr(data_fim, 1, 4) AS INTEGER)) AS ano, data_fim AS data,
      precisao_fim AS precisao, nota, resenha IS NOT NULL AND trim(resenha) != '' AS temResenha
    FROM leituras WHERE status = 'lido' ORDER BY id`).all() as (Omit<LeituraAnalise, 'temResenha'> & { livroId: number; temResenha: number })[]
  for (const { livroId, temResenha, ...l } of linhas) leituras.set(livroId, [...(leituras.get(livroId) ?? []), { ...l, temResenha: !!temResenha }])

  const metas: Record<number, number> = {}
  for (const m of sqlite.prepare('SELECT ano, livros FROM metas').all() as { ano: number; livros: number }[]) metas[m.ano] = m.livros

  return {
    metas,
    livros: listarLivros(banco).map((l) => {
      const x = extras.get(l.id)!
      return { ...l, anoPublicacao: x.anoPublicacao, pais: x.pais, cor1: x.cor1, cor2: x.cor2, origem: x.origem, criadoEm: x.criadoEm, primeiroInicio: x.primeiroInicio, leituras: leituras.get(l.id) ?? [] }
    })
  }
}

export function definirMeta({ sqlite }: Banco, ano: number, livros: number | null): void {
  const a = numero(ano, 'Ano da meta', 1, 9999)
  const n = numero(livros, 'Meta', 1, 100000)
  if (a === null) throw new Error('Ano da meta: número inválido.')
  if (n === null) sqlite.prepare('DELETE FROM metas WHERE ano = ?').run(a)
  else sqlite.prepare('INSERT INTO metas (ano, livros) VALUES (?, ?) ON CONFLICT(ano) DO UPDATE SET livros = excluded.livros').run(a, n)
}
