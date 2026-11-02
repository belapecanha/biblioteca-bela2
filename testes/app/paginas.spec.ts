import { copyFileSync, cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

const real = join(process.env.APPDATA ?? '', 'biblioteca-bela')

test('ficha leva às páginas de editora e país, também encontradas na busca', async () => {
  test.skip(!existsSync(join(real, 'biblioteca.db')), 'sem biblioteca importada')
  const pasta = mkdtempSync(join(tmpdir(), 'bela-paginas-'))
  for (const item of ['capas', 'miniaturas']) cpSync(join(real, item), join(pasta, item), { recursive: true })
  for (const item of ['biblioteca.db', 'biblioteca.db-wal']) if (existsSync(join(real, item))) copyFileSync(join(real, item), join(pasta, item))
  const { ELECTRON_RENDERER_URL: _url, ELECTRON_RUN_AS_NODE: _node, ...ambiente } = process.env
  const app = await electron.launch({ args: [resolve('.')], env: { ...ambiente, BELA_PASTA_DADOS: pasta } as Record<string, string> })
  const erros: string[] = []
  try {
    const janela = await app.firstWindow()
    janela.on('pageerror', (e) => erros.push(e.message))
    await janela.setViewportSize({ width: 1400, height: 900 })
    const alvo = await janela.evaluate(async () => {
      const livros = await window.bela.livros.listar()
      const l = livros.find((x) => x.editora && x.paisEditora)!
      return {
        id: l.id, editora: l.editora!.nome, pais: l.paisEditora!,
        daEditora: livros.filter((x) => x.editora?.id === l.editora!.id).length,
        doPais: livros.filter((x) => x.paisEditora === l.paisEditora || x.autores.some((a) => a.pais === l.paisEditora)).length
      }
    })
    await janela.goto(`${janela.url().split('#')[0]}#/livro/${alvo.id}`)
    await janela.getByRole('link', { name: `Editora ${alvo.editora}` }).click()
    await expect(janela.getByRole('heading', { level: 1 })).toHaveText(alvo.editora)
    await expect(janela.locator('.numeros .num').first()).toHaveText(String(alvo.daEditora))
    await janela.screenshot({ path: 'test-results/pagina-editora.png' })

    await janela.goBack()
    await janela.getByRole('link', { name: `País ${alvo.pais}` }).click()
    await expect(janela.getByRole('heading', { level: 1 })).toHaveText(alvo.pais)
    await expect(janela.locator('.numeros .num').first()).toHaveText(String(alvo.doPais))
    await expect(janela.getByRole('heading', { name: `Publicados em ${alvo.pais}` })).toBeVisible()
    // A seção de autoria só lista quem tem aquela nacionalidade.
    const daNacionalidade = await janela.evaluate(async (p) => {
      const livros = await window.bela.livros.listar()
      return [...new Set(livros.flatMap((l) => l.autores).filter((a) => a.pais === p).map((a) => a.nome))].sort()
    }, alvo.pais)
    const listados = (await janela.locator('section', { has: janela.getByRole('heading', { name: 'Autoria', exact: true }) }).getByRole('link').allTextContents()).map((t) => t.replace(/ · \d+$/, '')).sort()
    expect(listados).toEqual(daNacionalidade)
    const editorasDoPais = await janela.evaluate(async (p) => {
      const livros = await window.bela.livros.listar()
      return [...new Set(livros.filter((l) => l.paisEditora === p).map((l) => l.editora!.nome))].sort()
    }, alvo.pais)
    const editorasListadas = (await janela.locator('section', { has: janela.getByRole('heading', { name: 'Editoras', exact: true }) }).getByRole('link').allTextContents()).map((t) => t.replace(/ · \d+$/, '')).sort()
    expect(editorasListadas).toEqual(editorasDoPais)
    await janela.screenshot({ path: 'test-results/pagina-pais.png' })

    await janela.getByLabel('Buscar título, autor ou série').fill(alvo.editora.slice(0, 5))
    await janela.getByRole('link', { name: alvo.editora, exact: true }).click()
    await expect(janela.getByRole('heading', { level: 1 })).toHaveText(alvo.editora)
    await janela.getByRole('link', { name: alvo.pais, exact: true }).first().click()
    await expect(janela.getByRole('heading', { level: 1 })).toHaveText(alvo.pais)
    expect(erros).toEqual([])
  } finally {
    await app.close()
    rmSync(pasta, { recursive: true, force: true, maxRetries: 3 })
  }
})
