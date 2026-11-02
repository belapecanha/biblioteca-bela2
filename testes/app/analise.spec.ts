import { copyFileSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import sharp from 'sharp'

const real = join(process.env.APPDATA ?? '', 'biblioteca-bela')

test.describe('etapa 5: análise', () => {
  test.skip(!existsSync(join(real, 'biblioteca.db')), 'sem biblioteca importada')
  let pasta: string
  let app: ElectronApplication
  let janela: Page
  let erros: string[]

  test.beforeAll(() => {
    pasta = mkdtempSync(join(tmpdir(), 'bela-etapa5-'))
    for (const item of ['capas', 'miniaturas']) cpSync(join(real, item), join(pasta, item), { recursive: true })
    for (const item of ['biblioteca.db', 'biblioteca.db-wal']) if (existsSync(join(real, item))) copyFileSync(join(real, item), join(pasta, item))
  })
  test.beforeEach(async () => {
    const { ELECTRON_RENDERER_URL: _url, ELECTRON_RUN_AS_NODE: _node, ...ambiente } = process.env
    app = await electron.launch({ args: [resolve('.')], env: { ...ambiente, BELA_PASTA_DADOS: pasta } as Record<string, string> })
    janela = await app.firstWindow()
    erros = []
    janela.on('pageerror', (e) => erros.push(e.message))
    janela.on('console', (e) => { if (e.type() === 'error') erros.push(e.text()) })
    await janela.setViewportSize({ width: 1400, height: 900 })
  })
  test.afterEach(async () => {
    try { expect(erros).toEqual([]) } finally { await app.close() }
  })
  test.afterAll(() => rmSync(pasta, { recursive: true, force: true, maxRetries: 3 }))

  test('filtra todos os gráficos ao clicar e guarda a meta', async () => {
    await janela.getByRole('link', { name: 'Estatísticas' }).click()
    await expect(janela.getByRole('heading', { name: 'Sua vida em livros' })).toBeVisible()
    await janela.screenshot({ path: 'test-results/etapa5-estatisticas.png', fullPage: true, animations: 'disabled' })
    await janela.locator('.est-autores').scrollIntoViewIfNeeded()
    await janela.waitForTimeout(600)
    await janela.screenshot({ path: 'test-results/etapa5-autores.png' })
    const lidos = janela.locator('.est-kpis .num').first()
    const total = Number(await lidos.textContent())
    expect(total).toBeGreaterThan(0)

    await janela.getByRole('button', { name: /^Filtrar nota 5:/ }).click()
    await expect(janela.getByRole('button', { name: 'Remover filtro Nota: 5 estrelas' })).toBeVisible()
    const comCinco = Number(await lidos.textContent())
    expect(comCinco).toBeLessThan(total)
    await expect(janela.locator('.est-kpis .num').nth(5)).toHaveText(String(comCinco))

    await janela.getByRole('button', { name: 'Brasil' }).click()
    await expect(janela.getByRole('button', { name: 'Remover filtro País: Brasil' })).toBeVisible()
    expect(Number(await lidos.textContent())).toBeLessThan(comCinco)
    await janela.getByRole('button', { name: 'Limpar filtros' }).click()
    await expect(lidos).toHaveText(String(total))

    await janela.getByLabel('Período').selectOption('2021')
    expect(Number(await lidos.textContent())).toBeLessThan(total)
    await janela.getByLabel('Período').selectOption('')

    await janela.getByLabel('Meta', { exact: true }).fill('77')
    await janela.getByLabel('Meta', { exact: true }).blur()
    await expect(janela.locator('.est-meta').first()).toHaveText(/ de 77$/)
    await janela.reload()
    await janela.getByRole('link', { name: 'Estatísticas' }).click()
    await expect(janela.locator('.est-meta').first()).toHaveText(/ de 77$/)
  })

  test('percorre a retrospectiva e salva a imagem em 1080 × 1350', async () => {
    await janela.goto(janela.url().split('#')[0] + '#/retrospectiva?ano=2021')
    await expect(janela.getByRole('heading', { level: 1 })).toHaveText(/livros?$/)
    await expect(janela.locator('.par-i').first()).toBeVisible()
    const cores = await janela.locator('.par-i .diam').first().evaluate((d) => getComputedStyle(d).boxShadow)
    expect(cores).toContain('rgb')
    await janela.waitForTimeout(1500)
    await janela.screenshot({ path: 'test-results/etapa5-retrospectiva.png', animations: 'disabled' })
    await janela.locator('.parede').scrollIntoViewIfNeeded()
    await janela.mouse.wheel(0, 700)
    await janela.waitForTimeout(800)
    await janela.locator('.par-i').nth(1).hover()
    await janela.waitForTimeout(700)
    await janela.screenshot({ path: 'test-results/etapa5-parede.png' })
    for (let i = 1; i < 10; i++) await janela.getByRole('button', { name: 'Próximo' }).click()
    await expect(janela.getByText('Cartão 10 de 10')).toBeVisible()
    await janela.getByRole('button', { name: 'Rever' }).click()
    await expect(janela.getByText('Cartão 1 de 10')).toBeVisible()
    const noAno = await janela.locator('.par-i').count()
    await janela.getByRole('button', { name: 'Todos os anos' }).click()
    expect(await janela.locator('.par-i').count()).toBeGreaterThan(noAno)

    await janela.getByRole('button', { name: 'Salvar como imagem' }).click()
    await expect(janela.getByRole('heading', { name: 'Imagem de 2021' })).toBeVisible()
    await expect(janela.getByTestId('imagem-retrospectiva')).toBeVisible()
    const destino = join(pasta, 'retrospectiva.png')
    await app.evaluate(({ dialog }, caminho) => { dialog.showSaveDialog = (async () => ({ canceled: false, filePath: caminho })) as never }, destino)
    await janela.getByRole('button', { name: 'Salvar imagem' }).click()
    await expect(janela.getByRole('status')).toContainText('Imagem salva', { timeout: 30000 })
    const dados = readFileSync(destino)
    const info = await sharp(dados).metadata()
    expect([info.width, info.height]).toEqual([1080, 1350])
    // Uma captura sem conteúdo sairia só com a cor de fundo.
    const { channels } = await sharp(dados).stats()
    expect(channels[0].stdev).toBeGreaterThan(10)
    // As capas dos favoritos ficam no fim: uma captura cortada deixa esta faixa lisa.
    const rodape = await sharp(dados).extract({ left: 64, top: 1100, width: 952, height: 180 }).stats()
    expect(rodape.channels[0].stdev).toBeGreaterThan(10)
    copyFileSync(destino, 'test-results/etapa5-imagem.png')
  })
})
