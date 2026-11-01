import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, ipcMain, net, protocol, shell } from 'electron'
import { count } from 'drizzle-orm'
import type { EstadoApp } from '@shared/api'
import { resolverCapa } from './capas'
import { abrirBanco, type Banco } from './db/conexao'
import { classificacoes, livros } from './db/esquema'

// Os testes usam uma pasta temporária para nunca tocar nos dados reais.
if (process.env.BELA_PASTA_DADOS) app.setPath('userData', process.env.BELA_PASTA_DADOS)

protocol.registerSchemesAsPrivileged([
  { scheme: 'capa', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

let banco: Banco

function criarJanela(): void {
  const janela = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#1C262E',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  janela.once('ready-to-show', () => janela.show())

  const urlDev = process.env.ELECTRON_RENDERER_URL
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  janela.webContents.on('will-navigate', (evento, url) => {
    if (!urlDev || !url.startsWith(urlDev)) evento.preventDefault()
  })

  if (!app.isPackaged && urlDev) void janela.loadURL(urlDev)
  else void janela.loadFile(join(__dirname, '../renderer/index.html'))
}

function iniciar(): void {
  const pastaDados = app.getPath('userData')
  const pastaCapas = join(pastaDados, 'capas')
  const pastaMiniaturas = join(pastaDados, 'miniaturas')
  for (const pasta of [pastaDados, pastaCapas, pastaMiniaturas]) mkdirSync(pasta, { recursive: true })

  banco = abrirBanco(join(pastaDados, 'biblioteca.db'), join(__dirname, 'migracoes'))

  protocol.handle('capa', (pedido) => {
    const caminho = resolverCapa(pastaCapas, pastaMiniaturas, pedido.url)
    if (!caminho) return new Response(null, { status: 404 })
    return net.fetch(pathToFileURL(caminho).toString())
  })

  ipcMain.handle('app:estado', (): EstadoApp => {
    const total = (tabela: typeof livros | typeof classificacoes): number =>
      banco.db.select({ n: count() }).from(tabela).get()?.n ?? 0
    return {
      versao: app.getVersion(),
      livros: total(livros),
      classificacoes: total(classificacoes),
      pastaDados
    }
  })

  criarJanela()
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const janela = BrowserWindow.getAllWindows()[0]
    if (janela?.isMinimized()) janela.restore()
    janela?.focus()
  })
  app.on('window-all-closed', () => app.quit())
  app.on('will-quit', () => banco?.sqlite.close())
  void app.whenReady().then(iniciar)
}
