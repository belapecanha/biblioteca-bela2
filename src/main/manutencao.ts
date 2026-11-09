import type Database from 'better-sqlite3'
import { limparOrfaos } from './entidades'
import { corrigirTodosOsStatus } from './status'

// Configurações que versões antigas gravavam e que não devem mais existir.
// `google_books_chave`: a chave do Google Books já foi guardada no banco. Hoje ela vem só do
// arquivo .env; no banco ela ainda iria junto em todo backup .bela.
const CONFIGURACOES_OBSOLETAS = ['google_books_chave']

export function apagarConfiguracoesObsoletas(sqlite: Database.Database): number {
  return sqlite
    .prepare(`DELETE FROM configuracoes WHERE chave IN (${CONFIGURACOES_OBSOLETAS.map(() => '?').join(',')})`)
    .run(...CONFIGURACOES_OBSOLETAS).changes
}

/** Roda ao abrir e depois de restaurar um backup. Só altera dados incoerentes ou obsoletos. */
export function manutencao(sqlite: Database.Database): { status: number; orfaos: number; obsoletas: number } {
  return sqlite.transaction(() => ({
    status: corrigirTodosOsStatus(sqlite),
    orfaos: limparOrfaos(sqlite),
    obsoletas: apagarConfiguracoesObsoletas(sqlite)
  }))()
}
