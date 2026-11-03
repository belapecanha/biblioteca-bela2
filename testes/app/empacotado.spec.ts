import { copyFileSync, cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import sharp from 'sharp'

// Roda o app já empacotado (release\win-unpacked), gerado por `npm run instalador`.
const executavel = resolve('release/win-unpacked/Biblioteca Bela.exe')
const real = join(process.env.APPDATA ?? '', 'biblioteca-bela')

test('app empacotado abre a biblioteca, faz backup ao abrir e processa capas', async () => {
  test.skip(!existsSync(executavel), 'rode npm run instalador antes')
  test.skip(!existsSync(join(real, 'biblioteca.db')), 'sem biblioteca importada')
  const pasta = mkdtempSync(join(tmpdir(), 'bela-empacotado-'))
  for (const item of ['capas', 'miniaturas']) cpSync(join(real, item), join(pasta, item), { recursive: true })
  for (const item of ['biblioteca.db', 'biblioteca.db-wal']) if (existsSync(join(real, item))) copyFileSync(join(real, item), join(pasta, item))
  const { ELECTRON_RENDERER_URL: _url, ELECTRON_RUN_AS_NODE: _node, ...ambiente } = process.env
  const app = await electron.launch({ executablePath: executavel, env: { ...ambiente, BELA_PASTA_DADOS: pasta } as Record<string, string> })
  const erros: string[] = []
  try {
    const janela = await app.firstWindow()
    janela.on('pageerror', (e) => erros.push(e.message))
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true)
    const estado = await janela.evaluate(() => window.bela.estado())
    expect(estado.livros).toBeGreaterThan(200)
    expect(estado.pastaDados).toBe(pasta)
    await expect(janela.getByRole('heading', { name: `Sua estante, ${estado.livros} livros` })).toBeVisible()
    await expect(janela.locator('.lombada.com-capa').first()).toBeVisible()

    // Backup feito antes das migrações, na pasta de dados.
    expect(readdirSync(join(pasta, 'backups', 'automaticos'))).toHaveLength(1)

    // sharp empacotado: trocar a capa gera original, miniatura e cores.
    const png = await sharp({ create: { width: 300, height: 450, channels: 3, background: '#7E2F3A' } }).png().toBuffer()
    const capa = await janela.evaluate(async (bytes) => {
      const [livro] = await window.bela.livros.listar()
      await window.bela.livros.trocarCapa(livro.id, { bytes })
      return (await window.bela.livros.obter(livro.id))!.capa
    }, Array.from(png))
    expect(capa).toBeTruthy()
    await janela.screenshot({ path: 'test-results/empacotado.png' })
    expect(erros).toEqual([])
  } finally {
    await app.close()
    rmSync(pasta, { recursive: true, force: true, maxRetries: 3 })
  }
})
