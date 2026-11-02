import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

// Compartilhado pelo app e pelo importador: o lock do Electron não cobre o CLI.
export function bloquearBiblioteca(pasta: string): () => void {
  mkdirSync(pasta, { recursive: true })
  const caminho = join(pasta, 'biblioteca.lock')
  const dono = JSON.stringify({ pid: process.pid, token: randomUUID() })

  for (let tentativa = 0; tentativa < 3; tentativa++) {
    let arquivo: number
    try {
      arquivo = openSync(caminho, 'wx')
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code !== 'EEXIST') throw erro
      let anterior: string
      try {
        anterior = readFileSync(caminho, 'utf8')
        const { pid } = JSON.parse(anterior) as { pid: number }
        if (!Number.isInteger(pid) || pid <= 0) throw new Error('Bloqueio inválido.')
        try {
          process.kill(pid, 0)
        } catch (falha) {
          if ((falha as NodeJS.ErrnoException).code !== 'ESRCH') throw falha
          // Só recupera um bloqueio abandonado se o dono realmente terminou.
          if (readFileSync(caminho, 'utf8') === anterior) unlinkSync(caminho)
          continue
        }
      } catch (falha) {
        if ((falha as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw new Error(`Não foi possível verificar o uso da biblioteca em ${pasta}.`, { cause: falha })
      }
      throw new Error('A biblioteca está em uso. Feche a Biblioteca Bela e aguarde a importação terminar antes de tentar novamente.')
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
