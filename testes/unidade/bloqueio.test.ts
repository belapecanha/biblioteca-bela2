import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bloquearBiblioteca } from '../../src/main/db/bloqueio'

describe('acesso exclusivo à biblioteca', () => {
  let pasta: string
  let liberar: (() => void) | undefined

  beforeEach(() => { pasta = mkdtempSync(join(tmpdir(), 'bela-bloqueio-')) })
  afterEach(() => {
    liberar?.()
    liberar = undefined
    rmSync(pasta, { recursive: true, force: true })
  })

  it('impede abrir ou importar enquanto outro usuário do banco estiver ativo', () => {
    liberar = bloquearBiblioteca(pasta)
    expect(() => bloquearBiblioteca(pasta)).toThrow('A biblioteca está em uso')
    liberar()
    liberar = bloquearBiblioteca(pasta)
  })

  it('recupera o bloqueio de um processo encerrado', () => {
    writeFileSync(join(pasta, 'biblioteca.lock'), JSON.stringify({ pid: 2147483647, token: 'encerrado' }))
    liberar = bloquearBiblioteca(pasta)
    expect(() => bloquearBiblioteca(pasta)).toThrow('A biblioteca está em uso')
  })

  it('não remove um bloqueio que não consegue identificar', () => {
    const caminho = join(pasta, 'biblioteca.lock')
    writeFileSync(caminho, '')
    expect(() => bloquearBiblioteca(pasta)).toThrow('Não foi possível verificar')
    expect(existsSync(caminho)).toBe(true)
  })
})
