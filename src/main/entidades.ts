import type Database from 'better-sqlite3'
import type { DadosEntidade, Entidade, ResultadoEditarEntidade, TipoEntidade } from '@shared/api'
import type { Banco } from './db/conexao'
import { idValido, numero, objeto, texto } from './validacao'

const TABELA: Record<TipoEntidade, 'autores' | 'editoras' | 'series'> = {
  autor: 'autores',
  editora: 'editoras',
  serie: 'series'
}

// Autores, editoras e séries que nenhum livro usa mais (nome digitado errado, livro excluído).
export function limparOrfaos(sqlite: Database.Database): number {
  return (
    sqlite.prepare('DELETE FROM autores WHERE id NOT IN (SELECT autor_id FROM livro_autores)').run().changes +
    sqlite
      .prepare('DELETE FROM editoras WHERE id NOT IN (SELECT editora_id FROM livros WHERE editora_id IS NOT NULL)')
      .run().changes +
    sqlite.prepare('DELETE FROM series WHERE id NOT IN (SELECT serie_id FROM livros WHERE serie_id IS NOT NULL)').run()
      .changes
  )
}

function tipoValido(tipo: unknown): asserts tipo is TipoEntidade {
  if (typeof tipo !== 'string' || !(tipo in TABELA)) throw new Error('Tipo inválido.')
}

export function obterEntidade({ sqlite }: Banco, tipo: TipoEntidade, id: number): Entidade | null {
  tipoValido(tipo)
  idValido(id)
  const colunas = tipo === 'serie' ? 'NULL AS pais, total_volumes AS totalVolumes' : 'pais, NULL AS totalVolumes'
  return (
    (sqlite.prepare(`SELECT id, nome, ${colunas} FROM ${TABELA[tipo]} WHERE id = ?`).get(id) as Entidade | undefined) ??
    null
  )
}

// Renomeia e corrige país ou total de volumes. Se o nome novo já pertence a outro registro,
// só mescla os dois com `mesclar`: os livros passam para o existente e este é removido.
export function editarEntidade(
  banco: Banco,
  tipo: TipoEntidade,
  id: number,
  dados: DadosEntidade,
  mesclar = false
): ResultadoEditarEntidade {
  tipoValido(tipo)
  idValido(id)
  objeto(dados)
  if (typeof mesclar !== 'boolean') throw new Error('Confirmação inválida.')
  const nome = texto(dados.nome, 'o nome', 300, true)!
  const pais = tipo === 'serie' ? null : texto(dados.pais, 'País', 100)
  const total = tipo === 'serie' ? numero(dados.totalVolumes, 'Total de volumes', 1, 100000) : null
  const { sqlite } = banco
  const tabela = TABELA[tipo]
  return sqlite.transaction((): ResultadoEditarEntidade => {
    if (!sqlite.prepare(`SELECT 1 FROM ${tabela} WHERE id = ?`).get(id)) throw new Error('Registro não encontrado.')
    const existente = sqlite
      .prepare(`SELECT id, nome FROM ${tabela} WHERE lower(nome) = lower(?) AND id != ?`)
      .get(nome, id) as { id: number; nome: string } | undefined
    if (existente && !mesclar) return { existente }
    const destino = existente?.id ?? id
    if (existente) {
      if (tipo === 'autor') {
        sqlite
          .prepare(
            'INSERT OR IGNORE INTO livro_autores (livro_id, autor_id, papel, ordem) SELECT livro_id, ?, papel, ordem FROM livro_autores WHERE autor_id = ?'
          )
          .run(destino, id)
        sqlite.prepare('DELETE FROM livro_autores WHERE autor_id = ?').run(id)
      } else {
        sqlite
          .prepare(
            `UPDATE livros SET ${tipo === 'editora' ? 'editora_id' : 'serie_id'} = ?, atualizado_em = CURRENT_TIMESTAMP WHERE ${tipo === 'editora' ? 'editora_id' : 'serie_id'} = ?`
          )
          .run(destino, id)
      }
      sqlite.prepare(`DELETE FROM ${tabela} WHERE id = ?`).run(id)
    }
    if (tipo === 'serie')
      sqlite
        .prepare(
          'UPDATE series SET nome = ?, total_volumes = COALESCE(?, CASE WHEN ? THEN total_volumes END) WHERE id = ?'
        )
        .run(nome, total, existente ? 1 : 0, destino)
    else
      sqlite
        .prepare(`UPDATE ${tabela} SET nome = ?, pais = COALESCE(?, CASE WHEN ? THEN pais END) WHERE id = ?`)
        .run(nome, pais, existente ? 1 : 0, destino)
    return { id: destino }
  })()
}
