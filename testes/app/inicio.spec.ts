import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

test('abre com banco novo e sem expor o Node à interface', async () => {
  const pasta = mkdtempSync(join(tmpdir(), 'bela-app-'))
  const erros: string[] = []
  const { ELECTRON_RENDERER_URL: _ignorada, ...ambiente } = process.env
  const app = await electron.launch({
    args: [resolve('.')],
    env: { ...ambiente, BELA_PASTA_DADOS: pasta } as Record<string, string>
  })

  try {
    const janela = await app.firstWindow()
    janela.on('pageerror', (e) => erros.push(e.message))
    janela.on('console', (m) => {
      if (m.type() === 'error') erros.push(m.text())
    })

    await expect(janela.getByRole('heading', { name: 'Biblioteca Bela' })).toBeVisible()
    await expect(janela.getByTestId('estado')).toContainText('0 livros e 57 classificações')
    expect(await janela.evaluate(() => typeof (window as { require?: unknown }).require)).toBe('undefined')

    const fonte = await janela.evaluate(async () => {
      await document.fonts.ready
      return document.fonts.check('italic 600 64px "Cormorant Garamond"')
    })
    expect(fonte).toBe(true)

    await janela.screenshot({ path: 'test-results/inicio.png' })
    expect(erros).toEqual([])
  } finally {
    await app.close()
    rmSync(pasta, { recursive: true, force: true })
  }
})
