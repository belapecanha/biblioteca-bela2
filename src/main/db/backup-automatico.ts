import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'

const MANTER = 10

// Antes de abrir (e antes das migrações), confere o banco e guarda uma cópia.
// Uma cópia por dia, e outra sempre que a versão do app muda; ficam as 10 mais novas.
// É só o banco: capas e miniaturas nunca são alteradas por uma atualização.
export function backupAoAbrir(pastaDados: string, versao: string, agora = new Date()): string | null {
  const banco = join(pastaDados, 'biblioteca.db')
  if (!existsSync(banco)) return null
  const pasta = join(pastaDados, 'backups', 'automaticos')
  mkdirSync(pasta, { recursive: true })

  const destino = join(pasta, `biblioteca-${agora.toISOString().slice(0, 10)}-v${versao}.db`)
  const fonte = new Database(banco, { fileMustExist: true })
  try {
    const situacao = fonte.pragma('quick_check', { simple: true })
    if (situacao !== 'ok') {
      throw new Error(
        `O banco da biblioteca está danificado (${String(situacao)}). Nada foi alterado. As cópias automáticas ficam em ${pasta}.`
      )
    }
    if (existsSync(destino)) return null
    // VACUUM INTO gera uma cópia consistente, já com o que estava no WAL.
    fonte.prepare('VACUUM INTO ?').run(destino)
  } finally {
    fonte.close()
  }

  const copias = readdirSync(pasta)
    .filter((f) => /^biblioteca-\d{4}-\d{2}-\d{2}-v.+\.db$/.test(f))
    .sort()
  for (const antiga of copias.slice(0, Math.max(0, copias.length - MANTER))) unlinkSync(join(pasta, antiga))
  return destino
}
