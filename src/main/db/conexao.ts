import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { LISTAS_CLASSIFICACAO, type TipoClassificacao } from '@shared/classificacoes'
import * as esquema from './esquema'

export interface Banco {
  db: BetterSQLite3Database<typeof esquema>
  sqlite: Database.Database
}

export function abrirBanco(caminho: string, pastaMigracoes: string): Banco {
  const sqlite = new Database(caminho)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  const db = drizzle(sqlite, { schema: esquema })
  migrate(db, { migrationsFolder: pastaMigracoes })
  semearClassificacoes(db)

  return { db, sqlite }
}

export function semearClassificacoes(db: Banco['db']): void {
  const linhas = (Object.keys(LISTAS_CLASSIFICACAO) as TipoClassificacao[]).flatMap((tipo) =>
    LISTAS_CLASSIFICACAO[tipo].map((nome, ordem) => ({ tipo, nome, ordem }))
  )
  db.insert(esquema.classificacoes).values(linhas).onConflictDoNothing().run()
}
