import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

const real = join(process.env.APPDATA ?? '', 'biblioteca-bela')

async function abrir(pasta: string): Promise<{ app: ElectronApplication; janela: Page; erros: string[] }> {
  const { ELECTRON_RENDERER_URL: _ignorada, ...ambiente } = process.env
  const app = await electron.launch({
    args: [resolve('.')],
    env: { ...ambiente, BELA_PASTA_DADOS: pasta } as Record<string, string>
  })
  const janela = await app.firstWindow()
  const erros: string[] = []
  janela.on('pageerror', (e) => erros.push(e.message))
  janela.on('console', (m) => {
    if (m.type() === 'error') erros.push(m.text())
  })
  await janela.setViewportSize({ width: 1400, height: 900 })
  return { app, janela, erros }
}

test('abre vazio sem erro e sem expor o Node', async () => {
  const pasta = mkdtempSync(join(tmpdir(), 'bela-app-'))
  const { app, janela, erros } = await abrir(pasta)
  try {
    await expect(janela.getByRole('heading', { name: /Sua estante/ })).toBeVisible()
    expect(await janela.evaluate(() => typeof (window as { require?: unknown }).require)).toBe('undefined')
    await janela.getByRole('link', { name: 'Perfil' }).click()
    await expect(janela.getByRole('heading', { name: 'Favoritos', exact: true })).toBeVisible()
    expect(erros).toEqual([])
  } finally {
    await app.close()
    rmSync(pasta, { recursive: true, force: true })
  }
})

test.describe('com uma cópia da biblioteca real', () => {
  test.skip(!existsSync(join(real, 'biblioteca.db')), 'sem biblioteca importada')
  let pasta: string
  let app: ElectronApplication
  let janela: Page
  let erros: string[]
  let total: number

  test.beforeAll(() => {
    pasta = mkdtempSync(join(tmpdir(), 'bela-real-'))
    for (const item of ['biblioteca.db', 'capas', 'miniaturas']) cpSync(join(real, item), join(pasta, item), { recursive: true })
  })
  test.beforeEach(async () => {
    ;({ app, janela, erros } = await abrir(pasta))
    total = await janela.evaluate(async () => (await window.bela.estado()).livros)
    expect(total).toBeGreaterThan(0)
  })
  test.afterEach(async () => {
    try {
      expect(erros).toEqual([])
    } finally {
      await app.close()
    }
  })
  test.afterAll(() => rmSync(pasta, { recursive: true, force: true }))

  test('estante: tira o livro, mostra capa e abre a ficha', async () => {
    await expect(janela.getByRole('heading', { name: `Sua estante, ${total} livros` })).toBeVisible()
    expect(await janela.locator('.lombada').count()).toBe(total)
    await janela.waitForTimeout(600)
    await janela.screenshot({ path: 'test-results/estante.png' })
    // Nenhum título de lombada fica cortado ou com reticências, e cada série tem uma altura só.
    const lombadas = await janela.evaluate(async () => {
      await document.fonts.ready
      const livros = await window.bela.livros.listar()
      const cortados = [...document.querySelectorAll<HTMLElement>('.lb-titulo')]
        .filter((t) => t.scrollHeight > t.clientHeight + 1 || t.scrollWidth > t.clientWidth + 1 || t.textContent!.includes('…'))
        .map((t) => t.textContent)
      const alturas: Record<string, Set<number>> = {}
      for (const b of document.querySelectorAll<HTMLElement>('.lombada')) {
        const livro = livros.find((l) => b.getAttribute('aria-label')!.startsWith(`${l.titulo}, de`))
        if (livro?.serie) (alturas[livro.serie.nome] ??= new Set()).add(Math.round(b.getBoundingClientRect().height))
      }
      return { cortados, seriesDesiguais: Object.entries(alturas).filter(([, a]) => a.size > 1).map(([s]) => s) }
    })
    expect(lombadas).toEqual({ cortados: [], seriesDesiguais: [] })

    await janela.getByRole('button', { name: /^Heartless, de/ }).click()
    await expect(janela.locator('.ficha3d')).toBeVisible()
    await janela.waitForTimeout(1200)
    await janela.screenshot({ path: 'test-results/estante-aberta.png' })

    const caixa = await janela.locator('.capa3d').boundingBox()
    expect(caixa!.width).toBeGreaterThan(100)
    const carregou = await janela.locator('.capa3d img').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)
    expect(carregou).toBe(true)

    await janela.keyboard.press('Escape')
    await expect(janela.locator('.ficha3d')).toBeHidden()
    await expect(janela.locator('.capa3d')).toBeHidden({ timeout: 2000 })

    // Perto da borda direita, o cartão não pode sair da estante.
    const ultimo = janela.locator('.lombada').last()
    await ultimo.click()
    await janela.waitForTimeout(1200)
    const cartao = await janela.locator('.ficha3d').boundingBox()
    const moveis = await janela.locator('.moveis').boundingBox()
    expect(cartao!.x + cartao!.width).toBeLessThanOrEqual(moveis!.x + moveis!.width)

    await janela.getByRole('button', { name: /^Heartless, de/ }).click()
    await janela.waitForTimeout(1100)
    await janela.getByRole('link', { name: 'Abrir ficha de Heartless' }).click()
    await expect(janela.getByRole('heading', { name: 'Heartless', exact: true })).toBeVisible()
  })

  test('ficha: nota com meia estrela persiste e classificação é editável', async () => {
    await janela.locator('#busca-geral').fill('Heartless')
    await janela.locator('.grade .livro').first().click()
    await expect(janela.getByText('Marissa Meyer').first()).toBeVisible()
    await janela.waitForTimeout(600)
    await janela.screenshot({ path: 'test-results/ficha.png' })

    await janela.getByRole('button', { name: 'Dar nota 3,5' }).click()
    await expect(janela.getByText('3,5 de 5.')).toBeVisible()
    await janela.getByRole('button', { name: 'Editar classificação' }).click()
    await janela.getByRole('button', { name: 'Cozy', exact: true }).click()
    await janela.getByRole('button', { name: 'Concluir' }).click()
    await expect(janela.locator('.chip', { hasText: 'Cozy' })).toBeVisible()

    await janela.reload()
    await expect(janela.getByText('3,5 de 5.')).toBeVisible()
    await expect(janela.locator('.chip', { hasText: 'Cozy' })).toBeVisible()

    await janela.getByRole('link', { name: 'Marissa Meyer' }).first().click()
    await expect(janela.getByRole('heading', { name: 'Marissa Meyer' })).toBeVisible()
    await janela.waitForTimeout(600)
    await janela.screenshot({ path: 'test-results/autor.png' })
  })

  test('livros: filtra e marca posse em lote; série e busca funcionam', async () => {
    await janela.getByRole('link', { name: 'Livros', exact: true }).click()
    await expect(janela.getByRole('heading', { name: `${total} livros` })).toBeVisible()
    await janela.locator('#f-tema').selectOption('Dark Romance')
    await expect(janela.getByRole('heading', { name: /^\d+ livros$/ })).not.toHaveText(`${total} livros`)
    await janela.waitForTimeout(500)
    await janela.screenshot({ path: 'test-results/livros.png' })

    await janela.getByRole('button', { name: 'Selecionar vários' }).click()
    await janela.getByRole('button', { name: 'Selecionar os filtrados' }).click()
    await janela.getByRole('button', { name: 'Marcar como Tenho' }).click()
    await janela.locator('#f-tema').selectOption('')
    await janela.locator('#f-posse').selectOption('tenho')
    await expect(janela.locator('.grade .livro')).not.toHaveCount(0)

    await janela.locator('#busca-geral').fill('Bridgertons')
    await janela.getByRole('link', { name: 'Os Bridgertons', exact: true }).click()
    await expect(janela.getByRole('heading', { name: 'Os Bridgertons' })).toBeVisible()
    await expect(janela.locator('.grade .livro')).toHaveCount(5)
  })
})
