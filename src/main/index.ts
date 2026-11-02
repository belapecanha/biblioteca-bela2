import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron'
import { count } from 'drizzle-orm'
import type { EstadoApp, Posse, Status } from '@shared/api'
import type { TipoClassificacao } from '@shared/classificacoes'
import { resolverCapa } from './capas'
import { definirClassificacoes, definirNota, definirPosse, definirStatus, listarLivros, obterLivro } from './livros'
import { abrirBanco, type Banco } from './db/conexao'
import { bloquearBiblioteca } from './db/bloqueio'
import { classificacoes, livros } from './db/esquema'
import { encontrarDuplicados, salvarNotas } from './registro'
import { salvarRegistro, trocarCapa } from './registro-capas'
import { diario, removerCitacao, removerProgresso, salvarCitacao, salvarLeitura, salvarProgresso } from './leituras'
import { chaveDoEnv, servicoGoogle } from './google'
import { baseAnalise, definirMeta } from './analise'
import { salvarImagemRetrospectiva } from './imagem-retrospectiva'

// Os testes usam uma pasta temporária para nunca tocar nos dados reais.
// A pasta é fixa porque o Electron usaria "Biblioteca Bela", do nome de exibição.
app.setPath('userData', process.env.BELA_PASTA_DADOS ?? join(app.getPath('appData'), 'biblioteca-bela'))

protocol.registerSchemesAsPrivileged([
  { scheme: 'capa', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

let banco: Banco
let liberarBiblioteca: (() => void) | undefined

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

  void carregarRota(janela)
}

function carregarRota(janela: BrowserWindow, rota = ''): Promise<void> {
  const urlDev = process.env.ELECTRON_RENDERER_URL
  if (!app.isPackaged && urlDev) return janela.loadURL(rota ? `${urlDev}#/${rota}` : urlDev)
  return janela.loadFile(join(__dirname, '../renderer/index.html'), rota ? { hash: `/${rota}` } : undefined)
}

function iniciar(): void {
  const pastaDados = app.getPath('userData')
  liberarBiblioteca = bloquearBiblioteca(pastaDados)
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

  ipcMain.handle('livros:listar', () => listarLivros(banco))
  ipcMain.handle('livros:obter', (_e, id: number) => obterLivro(banco, id))
  ipcMain.handle('livros:nota', (_e, id: number, nota: number | null) => definirNota(banco, id, nota))
  ipcMain.handle('livros:status', (_e, id: number, status: Status) => definirStatus(banco, id, status))
  ipcMain.handle('livros:posse', (_e, ids: number[], posse: Posse | null) => definirPosse(banco, ids, posse))
  ipcMain.handle('livros:classificacoes', (_e, id: number, tipo: TipoClassificacao, nomes: string[]) =>
    definirClassificacoes(banco, id, tipo, nomes)
  )
  ipcMain.handle('livros:salvar', (_e, dados, confirmar, capa) => salvarRegistro(banco, pastaDados, dados, confirmar, capa))
  ipcMain.handle('livros:duplicados', (_e, dados) => encontrarDuplicados(banco, dados))
  ipcMain.handle('livros:capa', (_e, id, capa) => trocarCapa(banco, pastaDados, id, capa))
  ipcMain.handle('livros:notas', (_e, id, texto) => salvarNotas(banco, id, texto))
  ipcMain.handle('livros:editoras', () => banco.sqlite.prepare('SELECT nome, pais FROM editoras ORDER BY nome COLLATE NOCASE').all())
  ipcMain.handle('leituras:salvar', (_e, dados) => salvarLeitura(banco, dados))
  ipcMain.handle('leituras:progresso', (_e, livroId, leituraId, data, pagina) => salvarProgresso(banco, livroId, leituraId, data, pagina))
  ipcMain.handle('leituras:remover-progresso', (_e, livroId, id) => removerProgresso(banco, livroId, id))
  ipcMain.handle('leituras:citacao', (_e, livroId, citacao) => salvarCitacao(banco, livroId, citacao))
  ipcMain.handle('leituras:remover-citacao', (_e, livroId, id) => removerCitacao(banco, livroId, id))
  ipcMain.handle('leituras:diario', () => diario(banco))
  // Em desenvolvimento é o .env da raiz do projeto; o instalado não tem essa pasta.
  const arquivoEnv = process.env.BELA_ARQUIVO_ENV ?? join(app.isPackaged ? pastaDados : app.getAppPath(), '.env')
  // Lido a cada uso, para uma chave nova valer sem reiniciar o app.
  const google = servicoGoogle(() => (existsSync(arquivoEnv) ? chaveDoEnv(readFileSync(arquivoEnv, 'utf8')) : null))
  ipcMain.handle('google:configuracao', () => google.configuracao(arquivoEnv))
  ipcMain.handle('google:buscar', (_e, termo) => google.buscar(termo))
  ipcMain.handle('analise:base', () => baseAnalise(banco))
  ipcMain.handle('analise:meta', (_e, ano, livros) => definirMeta(banco, ano, livros))
  ipcMain.handle('analise:salvar-imagem', (e, ano) =>
    salvarImagemRetrospectiva(ano, BrowserWindow.fromWebContents(e.sender), join(__dirname, '../preload/index.js'), carregarRota)
  )

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
  app.on('will-quit', () => {
    try {
      banco?.sqlite.close()
    } finally {
      liberarBiblioteca?.()
    }
  })
  void app.whenReady().then(iniciar).catch((erro: unknown) => {
    dialog.showErrorBox('Não foi possível abrir a biblioteca', erro instanceof Error ? erro.message : String(erro))
    app.quit()
  })
}
