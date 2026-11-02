import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

test('país do colaborador filtra ao digitar e só aceita países da lista', async () => {
  const pasta = mkdtempSync(join(tmpdir(), 'bela-pais-'))
  const { ELECTRON_RENDERER_URL: _url, ELECTRON_RUN_AS_NODE: _node, ...ambiente } = process.env
  const app = await electron.launch({ args: [resolve('.')], env: { ...ambiente, BELA_PASTA_DADOS: pasta } as Record<string, string> })
  try {
    const janela = await app.firstWindow()
    await janela.setViewportSize({ width: 1400, height: 900 })
    await janela.getByRole('link', { name: '+ Registrar' }).click()
    const campo = janela.getByRole('combobox', { name: 'País do colaborador 1' })
    const lista = janela.getByRole('listbox', { name: 'País do colaborador 1' })
    await campo.click()
    expect(await lista.getByRole('option').count()).toBeGreaterThan(240)
    await campo.fill('cor')
    await expect(lista.getByRole('option').first()).toHaveText(/^Coreia/)
    expect(await lista.getByRole('option').count()).toBeLessThan(10)
    await janela.screenshot({ path: 'test-results/pais-filtro.png' })
    await janela.getByRole('option', { name: 'Coreia do Sul' }).click()
    await expect(campo).toHaveValue('Coreia do Sul')
    await expect(lista.getByRole('option')).toHaveCount(0)

    await campo.fill('bras')
    await campo.press('Enter')
    await expect(campo).toHaveValue('Brasil')
    await campo.fill('Lugar nenhum')
    await expect(janela.getByText('Nenhum país encontrado')).toBeVisible()
    await campo.blur()
    await expect(campo).toHaveValue('Brasil')

    await janela.getByLabel('Título', { exact: true }).fill('Livro do país')
    await janela.getByLabel('Nome do colaborador 1', { exact: true }).fill('Autora')
    await janela.locator('form.cadastro .acoes-form .btn:not(.btn2)').first().click()
    await janela.waitForURL(/livro\/\d+/)
    const salvo = await janela.evaluate(async () => {
      const [l] = await window.bela.livros.listar()
      return (await window.bela.livros.obter(l.id))?.colaboradores[0].pais
    })
    expect(salvo).toBe('Brasil')

    // Série: lista as séries da autoria e permite adicionar uma nova pela própria lista.
    const base = { tituloOriginal: null, isbn10: null, isbn13: null, editora: null, paisEditora: null, tipo: 'livro', formato: null, paginas: null, paginasEstimadas: false, anoEdicao: null, anoPublicacao: null, idioma: null, sinopse: null, posse: null, status: 'quero_ler', generos: [], temas: [], moods: [], notasPrivadas: null, volume: 1 }
    await janela.evaluate(async (b) => {
      const salvar = (titulo: string, autora: string, serie: string) => window.bela.livros.salvar({ ...b, titulo, serie, colaboradores: [{ nome: autora, pais: null, papel: 'autor' }] } as never, true)
      await salvar('Caraval', 'Stephanie Garber', 'Caraval')
      await salvar('Era uma vez um coração partido', 'Stephanie Garber', 'Era uma vez um coração partido')
      await salvar('Corte de espinhos e rosas', 'Sarah J. Maas', 'Corte de Espinhos e Rosas')
    }, base)
    await janela.reload()
    await janela.getByRole('link', { name: '+ Registrar' }).click()
    const serie = janela.getByRole('combobox', { name: 'Série' })
    const seriesLista = janela.getByRole('listbox', { name: 'Série' })
    await janela.getByLabel('Nome do colaborador 1', { exact: true }).fill('stephanie garber')
    await serie.click()
    await expect(seriesLista.getByText('Séries de stephanie garber')).toBeVisible()
    await expect(seriesLista.getByRole('option')).toHaveText(['Caraval', 'Era uma vez um coração partido'])
    await serie.fill('era')
    await expect(seriesLista.getByRole('option')).toHaveText(['Era uma vez um coração partido', '+ Adicionar nova série “era”'])
    await serie.press('Enter')
    await expect(serie).toHaveValue('Era uma vez um coração partido')
    await serie.fill('Lendário')
    await expect(seriesLista.getByRole('option')).toHaveText(['+ Adicionar nova série “Lendário”'])
    await serie.blur()
    await expect(serie).toHaveValue('Era uma vez um coração partido')
    await serie.fill('Lendário')
    await janela.screenshot({ path: 'test-results/serie-nova.png' })
    await seriesLista.getByRole('option', { name: /Adicionar nova série/ }).click()
    await expect(serie).toHaveValue('Lendário')
    await janela.getByLabel('Nome do colaborador 1', { exact: true }).fill('Autora sem livros')
    await serie.click()
    await expect(seriesLista.getByText('Esta autoria ainda não tem séries. Todas as séries:')).toBeVisible()
    await expect(seriesLista.getByRole('option')).toHaveCount(3)

    // Editora: lista as registradas, traz o país e permite adicionar uma nova.
    await janela.evaluate(async (b) => {
      await window.bela.livros.salvar({ ...b, titulo: 'Com editora', serie: null, volume: null, editora: 'Seguinte', paisEditora: 'Brasil', colaboradores: [{ nome: 'Alguém', pais: null, papel: 'autor' }] } as never, true)
    }, base)
    await janela.reload()
    await janela.getByRole('link', { name: '+ Registrar' }).click()
    const editora = janela.getByRole('combobox', { name: 'Editora' })
    const editorasLista = janela.getByRole('listbox', { name: 'Editora' })
    await editora.click()
    await expect(editorasLista.getByRole('option')).toHaveText(['Seguinte'])
    await editora.fill('seg')
    await editora.press('Enter')
    await expect(editora).toHaveValue('Seguinte')
    await expect(janela.getByLabel('País da editora', { exact: true })).toHaveValue('Brasil')
    await editora.fill('Intrínseca')
    await expect(editorasLista.getByRole('option')).toHaveText(['+ Adicionar nova editora “Intrínseca”'])
    await janela.screenshot({ path: 'test-results/editora-nova.png' })
    await editora.press('Enter')
    await expect(editora).toHaveValue('Intrínseca')
    await janela.getByLabel('Título', { exact: true }).fill('Livro da editora nova')
    await janela.getByLabel('Nome do colaborador 1', { exact: true }).fill('Autora')
    await janela.locator('form.cadastro .acoes-form .btn:not(.btn2)').first().click()
    await janela.waitForURL(/livro\/\d+/)
    expect((await janela.evaluate(() => window.bela.livros.editoras())).map((e) => e.nome)).toEqual(['Intrínseca', 'Seguinte'])
  } finally {
    await app.close()
    rmSync(pasta, { recursive: true, force: true, maxRetries: 3 })
  }
})
