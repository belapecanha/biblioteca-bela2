import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell, type IpcMainInvokeEvent } from 'electron'
import { count } from 'drizzle-orm'
import { CANAL_ERRO } from '@shared/ipc'
import { COR_FUNDO } from '@shared/tema'
import { dataLocal } from '@shared/datas'
import { resolverCapa } from './capas'
import {
  definirClassificacoes,
  definirNota,
  definirPosse,
  definirStatus,
  excluirLivro,
  listarEditoras,
  listarLivros,
  obterLivro
} from './livros'
import { abrirBanco, type Banco } from './db/conexao'
import { bloquearBiblioteca } from './db/bloqueio'
import { backupAoAbrir } from './db/backup-automatico'
import { classificacoes, livros } from './db/esquema'
import { encontrarDuplicados, salvarNotas } from './registro'
import { salvarRegistro, trocarCapa } from './registro-capas'
import {
  diario,
  excluirLeitura,
  removerCitacao,
  removerProgresso,
  salvarCitacao,
  salvarLeitura,
  salvarProgresso
} from './leituras'
import { chaveDoEnv, servicoGoogle } from './google'
import { baseAnalise, definirFavoritosDoAno, definirMeta } from './analise'
import { salvarImagemRetrospectiva } from './imagem-retrospectiva'
import { dadosPerfil, definirFavoritos, definirFila, painelPerfil, pendenciasDados, salvarPerfil } from './organizacao'
import {
  adicionarNaLista,
  excluirLista,
  listarListas,
  obterLista,
  ordenarLista,
  removerDaLista,
  salvarLista
} from './listas'
import { servicoArquivos } from './arquivos'
import { editarEntidade, obterEntidade } from './entidades'
import { manutencao } from './manutencao'
import { iniciarLog, registrarLog } from './log'
import { registrarIpc } from './ipc'

// Os testes usam uma pasta temporária para nunca tocar nos dados reais.
// A pasta é fixa porque o Electron usaria "Biblioteca Bela", do nome de exibição.
app.setPath('userData', process.env.BELA_PASTA_DADOS ?? join(app.getPath('appData'), 'biblioteca-bela'))

// Antes de qualquer outra coisa, para que até uma falha ao abrir o banco fique registrada.
iniciarLog(app.getPath('userData'))
process.on('uncaughtException', (erro) => registrarLog('erro', 'Exceção não tratada no processo principal', erro))
process.on('unhandledRejection', (motivo) =>
  registrarLog('erro', 'Promessa rejeitada sem tratamento no processo principal', motivo)
)

protocol.registerSchemesAsPrivileged([
  { scheme: 'capa', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

let banco: Banco | undefined
let liberarBiblioteca: (() => void) | undefined
let arquivos: ReturnType<typeof servicoArquivos> | undefined
const PRELOAD = join(__dirname, '../preload/index.js')

function criarJanela(): void {
  const janela = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: COR_FUNDO,
    autoHideMenuBar: true,
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  janela.once('ready-to-show', () => janela.show())

  const urlDev = process.env.ELECTRON_RENDERER_URL
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  janela.webContents.on('render-process-gone', (_e, detalhes) =>
    registrarLog('erro', `A janela fechou inesperadamente (${detalhes.reason}, código ${detalhes.exitCode})`)
  )
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

const dono = (evento: IpcMainInvokeEvent) => BrowserWindow.fromWebContents(evento.sender)

function iniciar(): void {
  const pastaDados = app.getPath('userData')
  liberarBiblioteca = bloquearBiblioteca(pastaDados)
  const pastaCapas = join(pastaDados, 'capas')
  const pastaMiniaturas = join(pastaDados, 'miniaturas')
  for (const pasta of [pastaDados, pastaCapas, pastaMiniaturas]) mkdirSync(pasta, { recursive: true })

  registrarLog('info', `Abrindo a biblioteca (versão ${app.getVersion()}) em ${pastaDados}`)
  // A cópia vem antes das migrações: se uma atualização mudar o banco, a versão anterior fica guardada.
  const copia = backupAoAbrir(pastaDados, app.getVersion())
  if (copia) registrarLog('info', `Cópia automática do banco: ${copia}`)
  const pastaMigracoes = join(__dirname, 'migracoes')
  const b = abrirBanco(join(pastaDados, 'biblioteca.db'), pastaMigracoes)
  banco = b
  registrarLog('info', 'Banco aberto e migrações aplicadas.')
  // Corrige status incoerentes, nomes sem livros e configurações obsoletas (como a antiga chave do Google no banco).
  const ajustes = manutencao(b.sqlite)
  if (ajustes.status || ajustes.orfaos || ajustes.obsoletas) {
    registrarLog(
      'info',
      `Manutenção ao abrir: ${ajustes.status} status corrigidos, ${ajustes.orfaos} nomes sem livros removidos, ${ajustes.obsoletas} configurações obsoletas apagadas.`
    )
  }
  const servico = servicoArquivos(b, pastaDados, pastaMigracoes)
  arquivos = servico

  protocol.handle('capa', (pedido) => {
    const caminho = resolverCapa(pastaCapas, pastaMiniaturas, pedido.url)
    if (!caminho) return new Response(null, { status: 404 })
    return net.fetch(pathToFileURL(caminho).toString())
  })

  // A chave do Google Books vem só do arquivo .env: em desenvolvimento, o da raiz do projeto;
  // no app instalado, o da pasta de dados. Lido a cada busca, para uma chave nova valer sem reiniciar.
  const arquivoEnv = process.env.BELA_ARQUIVO_ENV ?? join(app.isPackaged ? pastaDados : app.getAppPath(), '.env')
  const google = servicoGoogle(() => (existsSync(arquivoEnv) ? chaveDoEnv(readFileSync(arquivoEnv, 'utf8')) : null))

  async function escolherDestino(evento: IpcMainInvokeEvent, tipo: 'csv' | 'bela'): Promise<string | null> {
    const opcoes = {
      defaultPath: `biblioteca-bela-${dataLocal()}.${tipo}`,
      filters: [{ name: tipo === 'csv' ? 'Planilha CSV' : 'Backup da Biblioteca Bela', extensions: [tipo] }]
    }
    const janela = dono(evento)
    const escolha = janela ? await dialog.showSaveDialog(janela, opcoes) : await dialog.showSaveDialog(opcoes)
    return escolha.canceled || !escolha.filePath ? null : escolha.filePath
  }

  ipcMain.on(CANAL_ERRO, (_e, mensagem: unknown, detalhe: unknown) => {
    registrarLog(
      'erro',
      `Interface: ${String(mensagem).slice(0, 2000)}`,
      typeof detalhe === 'string' ? detalhe.slice(0, 20000) : undefined
    )
  })

  // Um handler por função da API (src/shared/ipc.ts); faltar um é erro de compilação.
  registrarIpc({
    estado: () => {
      const total = (tabela: typeof livros | typeof classificacoes) =>
        b.db.select({ n: count() }).from(tabela).get()?.n ?? 0
      return { versao: app.getVersion(), livros: total(livros), classificacoes: total(classificacoes), pastaDados }
    },
    livros: {
      listar: () => listarLivros(b),
      obter: (_e, id) => obterLivro(b, id),
      definirNota: (_e, id, nota) => definirNota(b, id, nota),
      definirStatus: (_e, id, status) => definirStatus(b, id, status),
      definirPosse: (_e, ids, posse) => definirPosse(b, ids, posse),
      definirClassificacoes: (_e, id, tipo, nomes) => definirClassificacoes(b, id, tipo, nomes),
      salvar: (_e, dados, confirmar, capa) => salvarRegistro(b, pastaDados, dados, confirmar, capa),
      duplicados: (_e, dados) => encontrarDuplicados(b, dados),
      trocarCapa: (_e, id, capa) => trocarCapa(b, pastaDados, id, capa),
      salvarNotas: (_e, id, texto) => salvarNotas(b, id, texto),
      editoras: () => listarEditoras(b),
      excluir: (_e, id) => {
        excluirLivro(b, pastaDados, id)
        registrarLog('info', `Livro ${id} excluído.`)
      }
    },
    autoria: {
      obter: (_e, tipo, id) => obterEntidade(b, tipo, id),
      editar: (_e, tipo, id, dados, mesclar) => editarEntidade(b, tipo, id, dados, mesclar)
    },
    leituras: {
      salvar: (_e, dados) => salvarLeitura(b, dados),
      progresso: (_e, livroId, leituraId, data, pagina) => salvarProgresso(b, livroId, leituraId, data, pagina),
      removerProgresso: (_e, livroId, id) => removerProgresso(b, livroId, id),
      salvarCitacao: (_e, livroId, citacao) => salvarCitacao(b, livroId, citacao),
      removerCitacao: (_e, livroId, id) => removerCitacao(b, livroId, id),
      diario: () => diario(b),
      excluir: (_e, livroId, id) => excluirLeitura(b, livroId, id)
    },
    google: {
      configuracao: () => google.configuracao(arquivoEnv),
      buscar: (_e, termo) => google.buscar(termo)
    },
    analise: {
      base: () => baseAnalise(b),
      definirMeta: (_e, ano, quantidade) => definirMeta(b, ano, quantidade),
      definirFavoritosDoAno: (_e, ano, ids) => definirFavoritosDoAno(b, ano, ids),
      salvarImagem: (e, ano) => salvarImagemRetrospectiva(ano, dono(e), PRELOAD, carregarRota)
    },
    perfil: {
      dados: () => dadosPerfil(b),
      painel: (_e, ano) => painelPerfil(b, ano),
      salvar: (_e, dados) => salvarPerfil(b, pastaDados, dados),
      favoritos: (_e, ids) => definirFavoritos(b, ids),
      fila: (_e, ids) => definirFila(b, ids),
      pendencias: () => pendenciasDados(b, pastaDados)
    },
    listas: {
      listar: () => listarListas(b),
      obter: (_e, id) => obterLista(b, id),
      salvar: (_e, dados) => salvarLista(b, dados),
      adicionar: (_e, id, ids) => adicionarNaLista(b, id, ids),
      removerLivro: (_e, id, livroId) => removerDaLista(b, id, livroId),
      ordenar: (_e, id, ids) => ordenarLista(b, id, ids),
      excluir: (_e, id) => excluirLista(b, id)
    },
    arquivos: {
      prepararCsv: (_e, csv) => servico.prepararCsv(csv),
      importarCsv: (_e, token) => servico.importarCsv(token),
      exportarCsv: async (e) => {
        const destino = await escolherDestino(e, 'csv')
        if (destino) servico.exportarCsv(destino)
        return destino
      },
      backup: async (e) => {
        const destino = await escolherDestino(e, 'bela')
        if (destino) await servico.backup(destino)
        return destino
      },
      prepararRestauracao: async (e) => {
        const opcoes = {
          properties: ['openFile'] as ['openFile'],
          filters: [{ name: 'Backup da Biblioteca Bela', extensions: ['bela'] }]
        }
        const janela = dono(e)
        const escolha = janela ? await dialog.showOpenDialog(janela, opcoes) : await dialog.showOpenDialog(opcoes)
        if (escolha.canceled || !escolha.filePaths[0]) return null
        return servico.prepararRestauracao(escolha.filePaths[0])
      },
      restaurar: (_e, token) => servico.restaurar(token),
      imagensOrfas: () => servico.imagensOrfas(),
      limparImagens: () => servico.limparImagens()
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
  app.on('will-quit', () => {
    try {
      arquivos?.fechar()
      banco?.sqlite.close()
    } finally {
      liberarBiblioteca?.()
    }
  })
  void app
    .whenReady()
    .then(iniciar)
    .catch((erro: unknown) => {
      registrarLog('erro', 'Não foi possível abrir a biblioteca', erro)
      dialog.showErrorBox('Não foi possível abrir a biblioteca', erro instanceof Error ? erro.message : String(erro))
      app.quit()
    })
}
