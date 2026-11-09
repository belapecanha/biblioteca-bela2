import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

// Diferença tolerada entre o início gravado no bloqueio e o informado pelo sistema.
const TOLERANCIA_MS = 10000

/** Momento (ms desde 1970) em que o processo começou, ou null se não der para saber. */
export function inicioDoProcesso(pid: number): number | null {
  if (pid === process.pid) return Math.round(Date.now() - process.uptime() * 1000)
  try {
    const saida =
      process.platform === 'win32'
        ? execFileSync(
            'powershell.exe',
            [
              '-NoProfile',
              '-NonInteractive',
              '-Command',
              `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().ToString('o')`
            ],
            { encoding: 'utf8', timeout: 15000, windowsHide: true }
          )
        : execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', timeout: 15000 })
    const instante = Date.parse(saida.trim())
    return Number.isFinite(instante) ? instante : null
  } catch {
    return null
  }
}

// Compartilhado pelo app e pelo importador (legado/): o lock do Electron não cobre o CLI.
// O arquivo guarda o PID e o horário de início do dono. No Windows os PIDs são reaproveitados:
// depois de uma queda, outro programa pode herdar o número. Se o processo com aquele PID
// começou em outro horário, ele não é o dono e o bloqueio é tratado como abandonado.
export function bloquearBiblioteca(
  pasta: string,
  consultarInicio: (pid: number) => number | null = inicioDoProcesso
): () => void {
  mkdirSync(pasta, { recursive: true })
  const caminho = join(pasta, 'biblioteca.lock')
  const dono = JSON.stringify({ pid: process.pid, inicio: consultarInicio(process.pid), token: randomUUID() })

  for (let tentativa = 0; tentativa < 3; tentativa++) {
    let arquivo: number
    try {
      arquivo = openSync(caminho, 'wx')
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code !== 'EEXIST') throw erro
      let anterior: string
      try {
        anterior = readFileSync(caminho, 'utf8')
        const { pid, inicio } = JSON.parse(anterior) as { pid: number; inicio?: number | null }
        if (!Number.isInteger(pid) || pid <= 0) throw new Error('Bloqueio inválido.')
        let abandonado = false
        try {
          process.kill(pid, 0)
          if (typeof inicio === 'number') {
            const atual = consultarInicio(pid)
            abandonado = atual !== null && Math.abs(atual - inicio) > TOLERANCIA_MS
          }
        } catch (falha) {
          if ((falha as NodeJS.ErrnoException).code !== 'ESRCH') throw falha
          abandonado = true
        }
        if (abandonado) {
          // Só recupera o bloqueio se ninguém o trocou enquanto conferíamos.
          if (readFileSync(caminho, 'utf8') === anterior) unlinkSync(caminho)
          continue
        }
      } catch (falha) {
        if ((falha as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw new Error(`Não foi possível verificar o uso da biblioteca em ${pasta}.`, { cause: falha })
      }
      throw new Error(
        'A biblioteca está em uso. Feche a Biblioteca Bela e aguarde a importação terminar antes de tentar novamente.'
      )
    }

    try {
      writeFileSync(arquivo, dono)
    } finally {
      closeSync(arquivo)
    }
    return () => {
      try {
        if (readFileSync(caminho, 'utf8') === dono) unlinkSync(caminho)
      } catch (erro) {
        if ((erro as NodeJS.ErrnoException).code !== 'ENOENT') throw erro
      }
    }
  }
  throw new Error('A biblioteca está sendo aberta por outro processo. Tente novamente.')
}
