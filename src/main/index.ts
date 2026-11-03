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
import { adicionarNaLista, dadosPerfil, definirFavoritos, definirFila, excluirLista, listarListas, obterLista, ordenarLista, painelPerfil, pendenciasDados, removerDaLista, salvarLista, salvarPerfil } from './organizacao'
import { servicoArquivos } from './arquivos'

// Os testes usam uma pasta temporária para nunca tocar nos dados reais.
// A pasta é fixa porque o Electron usaria "Biblioteca Bela", do nome de exibição.
app.setPath('userData', process.env.BELA_PASTA_DADOS ?? join(app.getPath('appData'), 'biblioteca-bela'))

protocol.registerSchemesAsPrivileged([
  { scheme: 'capa', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

let banco: Banco
let liberarBiblioteca: (() => void) | undefined
let arquivos: ReturnType<typeof servicoArquivos> | undefined
let filaEscrita: Promise<unknown> = Promise.resolve()

// Escritas assíncronas (imagens, importação e restauração) terminam antes da próxima.
// As consultas continuam disponíveis para a interface e a captura da retrospectiva.
function registrar(canal: string, acao: Parameters<typeof ipcMain.handle>[1]): void {
  const consulta = /:(estado|listar|obter|editoras|duplicados|diario|configuracao|buscar|base|dados|painel|pendencias)$/.test(canal)
  ipcMain.handle(canal, (evento, ...args) => {
    if (consulta) return acao(evento, ...args)
    const pedido = filaEscrita.then(() => acao(evento, ...args))
    filaEscrita = pedido.catch(() => undefined)
    return pedido
  })
}

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
  arquivos = servicoArquivos(banco, pastaDados)

  protocol.handle('capa', (pedido) => {
    const caminho = resolverCapa(pastaCapas, pastaMiniaturas, pedido.url)
    if (!caminho) return new Response(null, { status: 404 })
    return net.fetch(pathToFileURL(caminho).toString())
  })

  registrar('app:estado', (): EstadoApp => {
    const total = (tabela: typeof livros | typeof classificacoes): number =>
      banco.db.select({ n: count() }).from(tabela).get()?.n ?? 0
    return {
      versao: app.getVersion(),
      livros: total(livros),
      classificacoes: total(classificacoes),
      pastaDados
    }
  })

  registrar('livros:listar', () => listarLivros(banco))
  registrar('livros:obter', (_e, id: number) => obterLivro(banco, id))
  registrar('livros:nota', (_e, id: number, nota: number | null) => definirNota(banco, id, nota))
  registrar('livros:status', (_e, id: number, status: Status) => definirStatus(banco, id, status))
  registrar('livros:posse', (_e, ids: number[], posse: Posse | null) => definirPosse(banco, ids, posse))
  registrar('livros:classificacoes', (_e, id: number, tipo: TipoClassificacao, nomes: string[]) =>
    definirClassificacoes(banco, id, tipo, nomes)
  )
  registrar('livros:salvar', (_e, dados, confirmar, capa) => salvarRegistro(banco, pastaDados, dados, confirmar, capa))
  registrar('livros:duplicados', (_e, dados) => encontrarDuplicados(banco, dados))
  registrar('livros:capa', (_e, id, capa) => trocarCapa(banco, pastaDados, id, capa))
  registrar('livros:notas', (_e, id, texto) => salvarNotas(banco, id, texto))
  registrar('livros:editoras', () => banco.sqlite.prepare('SELECT nome, pais FROM editoras ORDER BY nome COLLATE NOCASE').all())
  registrar('leituras:salvar', (_e, dados) => salvarLeitura(banco, dados))
  registrar('leituras:progresso', (_e, livroId, leituraId, data, pagina) => salvarProgresso(banco, livroId, leituraId, data, pagina))
  registrar('leituras:remover-progresso', (_e, livroId, id) => removerProgresso(banco, livroId, id))
  registrar('leituras:citacao', (_e, livroId, citacao) => salvarCitacao(banco, livroId, citacao))
  registrar('leituras:remover-citacao', (_e, livroId, id) => removerCitacao(banco, livroId, id))
  registrar('leituras:diario', () => diario(banco))
  // Em desenvolvimento é o .env da raiz do projeto; o instalado não tem essa pasta.
  const arquivoEnv = process.env.BELA_ARQUIVO_ENV ?? join(app.isPackaged ? pastaDados : app.getAppPath(), '.env')
  // Lido a cada uso, para uma chave nova valer sem reiniciar o app.
  const google = servicoGoogle(() => (existsSync(arquivoEnv) ? chaveDoEnv(readFileSync(arquivoEnv, 'utf8')) : null))
  registrar('google:configuracao', () => google.configuracao(arquivoEnv))
  registrar('google:buscar', (_e, termo) => google.buscar(termo))
  registrar('analise:base', () => baseAnalise(banco))
  registrar('analise:meta', (_e, ano, livros) => definirMeta(banco, ano, livros))
  registrar('analise:salvar-imagem', (e, ano) =>
    salvarImagemRetrospectiva(ano, BrowserWindow.fromWebContents(e.sender), join(__dirname, '../preload/index.js'), carregarRota)
  )
  registrar('perfil:dados', () => dadosPerfil(banco))
  registrar('perfil:painel', (_e, ano) => painelPerfil(banco, ano))
  registrar('perfil:salvar', (_e, dados) => salvarPerfil(banco, pastaDados, dados))
  registrar('perfil:favoritos', (_e, ids) => definirFavoritos(banco, ids))
  registrar('perfil:fila', (_e, ids) => definirFila(banco, ids))
  registrar('perfil:pendencias', () => pendenciasDados(banco, pastaDados))
  registrar('listas:listar', () => listarListas(banco))
  registrar('listas:obter', (_e, id) => obterLista(banco, id))
  registrar('listas:salvar', (_e, dados) => salvarLista(banco, dados))
  registrar('listas:adicionar', (_e, id, livros) => adicionarNaLista(banco, id, livros))
  registrar('listas:remover', (_e, id, livroId) => removerDaLista(banco, id, livroId))
  registrar('listas:ordenar', (_e, id, livros) => ordenarLista(banco, id, livros))
  registrar('listas:excluir', (_e, id) => excluirLista(banco, id))
  registrar('arquivos:preparar-csv', (_e, csv) => arquivos!.prepararCsv(csv))
  registrar('arquivos:importar-csv', (_e, token) => arquivos!.importarCsv(token))
  async function salvarArquivo(evento: Electron.IpcMainInvokeEvent, tipo: 'csv' | 'bela') {
    const dono = BrowserWindow.fromWebContents(evento.sender)
    const opcoes = { defaultPath: `biblioteca-bela-${new Date().toISOString().slice(0, 10)}.${tipo}`, filters: [{ name: tipo === 'csv' ? 'Planilha CSV' : 'Backup da Biblioteca Bela', extensions: [tipo] }] }
    const escolha = dono ? await dialog.showSaveDialog(dono, opcoes) : await dialog.showSaveDialog(opcoes)
    if (escolha.canceled || !escolha.filePath) return null
    if (tipo === 'csv') arquivos!.exportarCsv(escolha.filePath)
    else await arquivos!.backup(escolha.filePath)
    return escolha.filePath
  }
  registrar('arquivos:exportar-csv', (e) => salvarArquivo(e, 'csv'))
  registrar('arquivos:backup', (e) => salvarArquivo(e, 'bela'))
  registrar('arquivos:preparar-restauracao', async (e) => {
    const dono = BrowserWindow.fromWebContents(e.sender)
    const opcoes = { properties: ['openFile'] as ['openFile'], filters: [{ name: 'Backup da Biblioteca Bela', extensions: ['bela'] }] }
    const escolha = dono ? await dialog.showOpenDialog(dono, opcoes) : await dialog.showOpenDialog(opcoes)
    if (escolha.canceled || !escolha.filePaths[0]) return null
    return arquivos!.prepararRestauracao(escolha.filePaths[0])
  })
  registrar('arquivos:restaurar', (_e, token) => arquivos!.restaurar(token))

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
      arquivos?.fechar()
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
