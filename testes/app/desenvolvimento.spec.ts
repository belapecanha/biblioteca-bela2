import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium, expect, test, type Browser } from '@playwright/test'
import { buildSync } from 'esbuild'

const require = createRequire(resolve('package.json'))
const electron = require('electron') as string
const cli = resolve('node_modules/electron-vite/bin/electron-vite.js')

function desenvolver(pasta: string) {
  const { ELECTRON_RUN_AS_NODE: _node, ELECTRON_RENDERER_URL: _url, ...ambiente } = process.env
  const processo = spawn(process.execPath, [cli, 'dev'], {
    env: { ...ambiente, BELA_PASTA_DADOS: pasta, REMOTE_DEBUGGING_PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let saida = ''
  processo.stdout.on('data', (dados) => { saida += String(dados) })
  processo.stderr.on('data', (dados) => { saida += String(dados) })
  return { processo, saida: () => saida }
}

async function terminou(processo: ChildProcess) {
  await expect.poll(() => processo.exitCode, { timeout: 15000 }).not.toBeNull()
}

function encerrar(processo: ChildProcess) {
  if (processo.exitCode !== null || !processo.pid) return
  // Apenas a árvore criada por este teste, com dados temporários.
  if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(processo.pid), '/T', '/F'])
  else processo.kill()
}

test('dev mostra os livros e recusa substituir o banco enquanto o app está aberto', async () => {
  const pasta = mkdtempSync(join(tmpdir(), 'bela-dev-'))
  const fixture = resolve('test-results/preparar-biblioteca.cjs')
  buildSync({
    stdin: {
      contents: `import { abrirBanco } from './src/main/db/conexao';
        import { join, resolve } from 'node:path';
        const banco = abrirBanco(join(process.argv[2], 'biblioteca.db'), resolve('src/main/db/migracoes'));
        const inserir = banco.sqlite.prepare('INSERT INTO livros (titulo) VALUES (?)');
        for (const titulo of ['Livro de teste A', 'Livro de teste B', 'Livro de teste C']) inserir.run(titulo);
        banco.sqlite.close();`,
      resolveDir: process.cwd(), loader: 'ts'
    },
    outfile: fixture, bundle: true, platform: 'node', format: 'cjs',
    external: ['better-sqlite3'], alias: { '@shared': resolve('src/shared') }
  })
  execFileSync(electron, [fixture, pasta], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } })
  const dev = desenvolver(pasta)
  let browser: Browser | undefined
  try {
    await expect.poll(() => dev.saida().match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1], {
      timeout: 30000, message: 'O app de desenvolvimento precisa iniciar'
    }).toBeTruthy()
    browser = await chromium.connectOverCDP(dev.saida().match(/DevTools listening on (ws:\/\/[^\s]+)/)![1])
    await expect.poll(() => browser!.contexts()[0].pages().length).toBeGreaterThan(0)
    const janela = browser.contexts()[0].pages()[0]
    await expect(janela.getByRole('heading', { name: 'Sua estante, 3 livros' })).toBeVisible()
    await expect(janela.locator('.lombada')).toHaveCount(3)
    expect(await janela.evaluate(() => window.bela.estado())).toMatchObject({ livros: 3, pastaDados: pasta })

    const importador = spawn(process.execPath, ['scripts/importar.mjs', '--substituir'], {
      env: { ...process.env, BELA_PASTA_DADOS: pasta }, stdio: ['ignore', 'pipe', 'pipe']
    })
    let erroImportacao = ''
    importador.stderr.on('data', (dados) => { erroImportacao += String(dados) })
    await terminou(importador)
    expect(importador.exitCode).toBe(1)
    expect(erroImportacao).toContain('A biblioteca está em uso')
    expect(await janela.evaluate(async () => (await window.bela.livros.listar()).length)).toBe(3)
    await janela.reload()
    await expect(janela.locator('.lombada')).toHaveCount(3)
    await janela.close()
    await terminou(dev.processo)
    expect(dev.processo.exitCode).toBe(0)
  } finally {
    await browser?.close()
    encerrar(dev.processo)
    rmSync(pasta, { recursive: true, force: true })
  }
})

test('dev falha com aviso quando a porta já está ocupada, sem carregar outro servidor', async () => {
  const pasta = mkdtempSync(join(tmpdir(), 'bela-porta-'))
  const servidor = createServer((_pedido, resposta) => resposta.end('servidor antigo'))
  await new Promise<void>((resolve, reject) => {
    servidor.once('error', reject)
    servidor.listen(5173, 'localhost', resolve)
  })
  const dev = desenvolver(pasta)
  try {
    await terminou(dev.processo)
    expect(dev.processo.exitCode).toBe(1)
    expect(dev.saida()).toContain('Port 5173 is already in use')
    expect(dev.saida()).not.toContain('starting electron app')
  } finally {
    encerrar(dev.processo)
    await new Promise<void>((resolve) => servidor.close(() => resolve()))
    rmSync(pasta, { recursive: true, force: true })
  }
})
