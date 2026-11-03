import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { abrirBanco } from '../../src/main/db/conexao'
import { backupAoAbrir } from '../../src/main/db/backup-automatico'

describe('backup automático ao abrir', () => {
  let pasta: string
  const copias = () => readdirSync(join(pasta, 'backups', 'automaticos')).sort()
  const dia = (n: number) => new Date(Date.UTC(2026, 0, n, 12))
  beforeEach(() => {
    pasta = mkdtempSync(join(tmpdir(), 'bela-backup-auto-'))
    const banco = abrirBanco(join(pasta, 'biblioteca.db'), resolve('src/main/db/migracoes'))
    banco.sqlite.prepare("INSERT INTO livros (titulo) VALUES ('Guardado')").run()
    banco.sqlite.close()
  })
  afterEach(() => rmSync(pasta, { recursive: true, force: true, maxRetries: 3 }))

  it('não faz nada sem banco', () => {
    rmSync(join(pasta, 'biblioteca.db'))
    expect(backupAoAbrir(pasta, '1.0.0')).toBeNull()
  })

  it('guarda uma cópia consistente por dia e outra quando a versão muda', () => {
    const copia = backupAoAbrir(pasta, '0.1.0', dia(1))!
    const lido = new Database(copia, { readonly: true })
    expect(lido.prepare('SELECT titulo FROM livros').all()).toEqual([{ titulo: 'Guardado' }])
    lido.close()
    expect(backupAoAbrir(pasta, '0.1.0', dia(1))).toBeNull()
    expect(backupAoAbrir(pasta, '0.2.0', dia(1))).not.toBeNull()
    expect(copias()).toEqual(['biblioteca-2026-01-01-v0.1.0.db', 'biblioteca-2026-01-01-v0.2.0.db'])
  })

  it('mantém só as 10 mais novas', () => {
    for (let n = 1; n <= 13; n++) backupAoAbrir(pasta, '0.1.0', dia(n))
    expect(copias()).toHaveLength(10)
    expect(copias()[0]).toBe('biblioteca-2026-01-04-v0.1.0.db')
  })

  it('recusa abrir um banco danificado, sem mexer nele', () => {
    rmSync(join(pasta, 'biblioteca.db-wal'), { force: true })
    writeFileSync(join(pasta, 'biblioteca.db'), 'isto não é um banco SQLite'.repeat(400))
    expect(() => backupAoAbrir(pasta, '0.1.0', dia(1))).toThrow()
  })
})
