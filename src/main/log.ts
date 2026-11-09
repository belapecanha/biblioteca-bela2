import { appendFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

// Um arquivo por dia em <pasta de dados>/logs; ficam os 30 mais recentes.
const MANTER = 30
let pastaLogs: string | null = null

export function iniciarLog(pastaDados: string): string {
  pastaLogs = join(pastaDados, 'logs')
  mkdirSync(pastaLogs, { recursive: true })
  try {
    const antigos = readdirSync(pastaLogs)
      .filter((f) => /^biblioteca-\d{4}-\d{2}-\d{2}\.log$/.test(f))
      .sort()
    for (const nome of antigos.slice(0, Math.max(0, antigos.length - MANTER))) unlinkSync(join(pastaLogs, nome))
  } catch {
    /* A rotação nunca impede o app de abrir. */
  }
  return pastaLogs
}

function descrever(detalhe: unknown): string {
  if (detalhe instanceof Error)
    return `${detalhe.stack ?? detalhe.message}${detalhe.cause ? `\n  causa: ${descrever(detalhe.cause)}` : ''}`
  if (typeof detalhe === 'string') return detalhe
  try {
    return JSON.stringify(detalhe)
  } catch {
    return String(detalhe)
  }
}

export function registrarLog(nivel: 'info' | 'aviso' | 'erro', mensagem: string, detalhe?: unknown): void {
  const agora = new Date()
  const linha = `${agora.toISOString()} [${nivel}] ${mensagem}${detalhe === undefined ? '' : `\n  ${descrever(detalhe).slice(0, 20000).replace(/\n/g, '\n  ')}`}\n`
  if (nivel === 'erro') console.error(linha.trimEnd())
  if (!pastaLogs) return
  const dia = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`
  try {
    appendFileSync(join(pastaLogs, `biblioteca-${dia}.log`), linha)
  } catch {
    /* Sem disco para o log, o app continua. */
  }
}
