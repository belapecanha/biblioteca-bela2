import {
  constants,
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readSync,
  closeSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import { gunzip } from 'node:zlib'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import yauzl from 'yauzl'
import yazl from 'yazl'
import { semearClassificacoes, type Banco } from './db/conexao'
import * as esquema from './db/esquema'
import { imagensReferenciadas, limparImagensOrfas, rotacionarBackupsDeSeguranca, type PastaImagem } from './imagens'
import { registrarLog } from './log'
import { manutencao } from './manutencao'

// Formato .bela, versão 2: um arquivo ZIP com
//   biblioteca-bela.json            { formato: 'biblioteca-bela', versao: 2, criado }
//   biblioteca.db                   comprimido
//   capas/<nome>, miniaturas/<nome> guardados sem compressão (já são WebP)
// É gravado e lido em streaming, sem montar a biblioteca inteira na memória.
// A versão 1 (JSON com as imagens em base64, dentro de um gzip) continua sendo lida.

const TABELAS = [
  'editoras',
  'autores',
  'series',
  'classificacoes',
  'livros',
  'livro_autores',
  'livro_classificacoes',
  'leituras',
  'progresso',
  'citacoes',
  'listas',
  'lista_livros',
  'fila_meta',
  'metas',
  'configuracoes'
]
const MANIFESTO = 'biblioteca-bela.json'
const BANCO = 'biblioteca.db'
const MAXIMO_ARQUIVOS = 50000
const MAXIMO_DESCOMPACTADO = 4 * 1024 * 1024 * 1024
const MAXIMO_V1 = 512 * 1024 * 1024

interface ArquivoBackup {
  pasta: PastaImagem
  nome: string
  caminho: string
}
interface Manifesto {
  formato: 'biblioteca-bela'
  versao: number
  criado: string
}
export interface BackupPreparado {
  pasta: string
  banco: string
  arquivos: ArquivoBackup[]
  livros: number
  leituras: number
  nome: string
}

function nomeSeguro(nome: unknown): nome is string {
  return (
    typeof nome === 'string' &&
    nome.length < 250 &&
    /^[\w.-]+\.(?:webp|jpe?g|png|avif|gif)$/i.test(nome) &&
    !nome.includes('..')
  )
}
function base64(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.length > 0 && valor.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(valor)
}
const invalido = () => new Error('O backup contém arquivos inválidos ou repetidos.')

export function protegerDestino(pasta: string, destino: string): void {
  const raiz = resolve(pasta).toLowerCase() + sep
  const alvo = resolve(destino).toLowerCase()
  if (alvo.startsWith(raiz) && !alvo.startsWith(join(raiz, 'backups').toLowerCase() + sep))
    throw new Error('Escolha uma pasta fora dos arquivos internos da biblioteca.')
}

// Grava num temporário ao lado e renomeia: um backup interrompido nunca substitui um bom.
function temporarioAoLado(destino: string): string {
  return join(dirname(destino), `.bela-${randomUUID()}.tmp`)
}
export function gravarArquivo(destino: string, dados: Buffer | string): void {
  const temporario = temporarioAoLado(destino)
  try {
    writeFileSync(temporario, dados, { flag: 'wx' })
    renameSync(temporario, destino)
  } finally {
    if (existsSync(temporario)) unlinkSync(temporario)
  }
}

export async function criarBackup(banco: Banco, pasta: string, destino: string): Promise<void> {
  protegerDestino(pasta, destino)
  const temporaria = mkdtempSync(join(tmpdir(), 'bela-backup-'))
  const temporario = temporarioAoLado(destino)
  try {
    const copia = join(temporaria, BANCO)
    await banco.sqlite.backup(copia)
    const zip = new yazl.ZipFile()
    const manifesto: Manifesto = { formato: 'biblioteca-bela', versao: 2, criado: new Date().toISOString() }
    zip.addBuffer(Buffer.from(JSON.stringify(manifesto)), MANIFESTO)
    zip.addFile(copia, BANCO, { compress: true })
    // Só entram as imagens que o banco usa; sobras de capas trocadas ficam de fora.
    const usadas = imagensReferenciadas(banco.sqlite)
    let imagens = 0
    for (const tipo of ['capas', 'miniaturas'] as const) {
      const origem = join(pasta, tipo)
      if (!existsSync(origem)) continue
      for (const item of readdirSync(origem, { withFileTypes: true })) {
        if (!item.isFile() || item.isSymbolicLink() || !nomeSeguro(item.name) || !usadas[tipo].has(item.name)) continue
        zip.addFile(join(origem, item.name), `${tipo}/${item.name}`, { compress: false })
        imagens++
      }
    }
    zip.end()
    await pipeline(zip.outputStream, createWriteStream(temporario, { flags: 'wx' }))
    renameSync(temporario, destino)
    registrarLog('info', `Backup criado: ${destino} (${imagens} imagens)`)
  } finally {
    if (existsSync(temporario)) unlinkSync(temporario)
    rmSync(temporaria, { recursive: true, force: true })
  }
}

function inicioDoArquivo(caminho: string): Buffer {
  const arquivo = openSync(caminho, 'r')
  try {
    const bytes = Buffer.alloc(4)
    readSync(arquivo, bytes, 0, 4, 0)
    return bytes
  } finally {
    closeSync(arquivo)
  }
}

// Extrai o ZIP para `destino`, conferindo cada nome antes de gravar.
async function extrairZip(
  caminho: string,
  destino: string
): Promise<{ manifesto: Manifesto; arquivos: ArquivoBackup[] }> {
  const zip = await promisify<string, yauzl.Options, yauzl.ZipFile>(yauzl.open)(caminho, {
    lazyEntries: true,
    autoClose: true,
    validateEntrySizes: true,
    strictFileNames: true
  })
  const arquivos: ArquivoBackup[] = []
  const vistos = new Set<string>()
  let manifesto: Manifesto | undefined
  let total = 0
  const abrir = promisify<yauzl.Entry, NodeJS.ReadableStream>(zip.openReadStream.bind(zip))
  try {
    await new Promise<void>((concluir, falhar) => {
      zip.on('error', falhar)
      zip.on('end', () => concluir())
      zip.on('entry', (entrada: yauzl.Entry) => {
        void (async () => {
          const nome = entrada.fileName
          if (vistos.has(nome) || vistos.size >= MAXIMO_ARQUIVOS + 2) throw invalido()
          vistos.add(nome)
          total += entrada.uncompressedSize
          if (total > MAXIMO_DESCOMPACTADO) throw new Error('O backup é grande demais para ser restaurado.')
          if (nome === MANIFESTO) {
            if (entrada.uncompressedSize > 64 * 1024) throw invalido()
            const partes: Buffer[] = []
            for await (const parte of await abrir(entrada)) partes.push(parte as Buffer)
            manifesto = JSON.parse(Buffer.concat(partes).toString('utf8')) as Manifesto
          } else {
            const [pasta, arquivo, ...resto] = nome.split('/')
            const imagem =
              (pasta === 'capas' || pasta === 'miniaturas') &&
              arquivo !== undefined &&
              !resto.length &&
              nomeSeguro(arquivo)
            if (nome !== BANCO && !imagem) throw invalido()
            const alvo = nome === BANCO ? join(destino, BANCO) : join(destino, 'arquivos', pasta, arquivo)
            mkdirSync(dirname(alvo), { recursive: true })
            await pipeline(await abrir(entrada), createWriteStream(alvo, { flags: 'wx' }))
            if (imagem) arquivos.push({ pasta: pasta as PastaImagem, nome: arquivo, caminho: alvo })
          }
          zip.readEntry()
        })().catch(falhar)
      })
      zip.readEntry()
    })
  } finally {
    if (zip.isOpen) zip.close()
  }
  if (!manifesto || manifesto.formato !== 'biblioteca-bela' || manifesto.versao !== 2 || !vistos.has(BANCO))
    throw new Error('Formato de backup incompatível.')
  return { manifesto, arquivos }
}

// Versão 1: só para backups criados antes da versão 0.2.0 do app.
async function extrairV1(caminho: string, destino: string): Promise<ArquivoBackup[]> {
  let dados: {
    formato?: string
    versao?: number
    banco?: unknown
    arquivos?: { pasta?: unknown; nome?: unknown; dados?: unknown }[]
  }
  try {
    dados = JSON.parse(
      (await promisify(gunzip)(await readFile(caminho), { maxOutputLength: MAXIMO_V1 })).toString('utf8')
    )
  } catch {
    throw new Error('O arquivo não é um backup válido da Biblioteca Bela.')
  }
  if (
    !dados ||
    dados.formato !== 'biblioteca-bela' ||
    dados.versao !== 1 ||
    !base64(dados.banco) ||
    !Array.isArray(dados.arquivos) ||
    dados.arquivos.length > MAXIMO_ARQUIVOS
  )
    throw new Error('Formato de backup incompatível.')
  const vistos = new Set<string>()
  for (const a of dados.arquivos) {
    if (
      !a ||
      (a.pasta !== 'capas' && a.pasta !== 'miniaturas') ||
      !nomeSeguro(a.nome) ||
      !base64(a.dados) ||
      vistos.has(`${a.pasta}/${a.nome}`)
    )
      throw invalido()
    vistos.add(`${a.pasta}/${a.nome}`)
  }
  writeFileSync(join(destino, BANCO), Buffer.from(dados.banco, 'base64'))
  return dados.arquivos.map((a) => {
    const alvo = join(destino, 'arquivos', a.pasta as string, a.nome as string)
    mkdirSync(dirname(alvo), { recursive: true })
    writeFileSync(alvo, Buffer.from(a.dados as string, 'base64'), { flag: 'wx' })
    return { pasta: a.pasta as PastaImagem, nome: a.nome as string, caminho: alvo }
  })
}

// Um backup de uma versão anterior recebe as migrações que faltam antes da comparação,
// numa cópia temporária. Só um backup de versão mais nova (ou de outro app) é recusado.
export async function prepararBackup(banco: Banco, caminho: string, pastaMigracoes: string): Promise<BackupPreparado> {
  const pasta = mkdtempSync(join(tmpdir(), 'bela-restaurar-'))
  const copia = join(pasta, BANCO)
  let origem: Database.Database | undefined
  try {
    const inicio = inicioDoArquivo(caminho)
    let arquivos: ArquivoBackup[]
    if (inicio.readUInt32LE(0) === 0x04034b50) arquivos = (await extrairZip(caminho, pasta)).arquivos
    else if (inicio[0] === 0x1f && inicio[1] === 0x8b) arquivos = await extrairV1(caminho, pasta)
    else throw new Error('O arquivo não é um backup válido da Biblioteca Bela.')
    origem = new Database(copia, { fileMustExist: true })
    if (
      origem.pragma('quick_check', { simple: true }) !== 'ok' ||
      (origem.pragma('foreign_key_check') as unknown[]).length
    )
      throw new Error('O banco do backup está danificado.')
    const lerEstrutura = () =>
      origem!.prepare("SELECT name, type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all() as {
        name: string
        type: string
      }[]
    if (
      lerEstrutura().some(
        (s) =>
          s.type === 'trigger' ||
          s.type === 'view' ||
          (s.type === 'table' && ![...TABELAS, '__drizzle_migrations'].includes(s.name))
      )
    )
      throw new Error('O backup contém uma estrutura desconhecida.')
    try {
      const db = drizzle(origem, { schema: esquema })
      migrate(db, { migrationsFolder: pastaMigracoes })
      semearClassificacoes(db)
    } catch (erro) {
      registrarLog('aviso', `Não foi possível atualizar o backup ${caminho}`, erro)
      throw new Error('O backup pertence a uma versão incompatível do aplicativo.', { cause: erro })
    }
    const estrutura = lerEstrutura()
    for (const tabela of TABELAS) {
      const colunas = (db: Database.Database) =>
        (db.prepare(`PRAGMA table_info("${tabela}")`).all() as { name: string }[]).map((c) => c.name).join(',')
      if (!estrutura.some((s) => s.name === tabela && s.type === 'table') || colunas(origem) !== colunas(banco.sqlite))
        throw new Error('O backup pertence a uma versão incompatível do aplicativo.')
    }
    const contar = (tabela: string) => (origem!.prepare(`SELECT COUNT(*) n FROM ${tabela}`).get() as { n: number }).n
    return {
      pasta,
      banco: copia,
      arquivos,
      livros: contar('livros'),
      leituras: contar('leituras'),
      nome: basename(caminho)
    }
  } catch (erro) {
    origem?.close()
    origem = undefined
    rmSync(pasta, { recursive: true, force: true })
    throw erro
  } finally {
    origem?.close()
  }
}

export async function restaurarBackup(banco: Banco, pasta: string, preparado: BackupPreparado): Promise<string> {
  const pastaBackups = join(pasta, 'backups')
  mkdirSync(pastaBackups, { recursive: true })
  const anterior = join(pastaBackups, `antes-restaurar-${Date.now()}-${randomUUID()}.bela`)
  await criarBackup(banco, pasta, anterior)
  rotacionarBackupsDeSeguranca(pasta)
  const novos: string[] = []
  const nomes = new Map<string, string>()
  const lote = randomUUID()
  let anexado = false
  try {
    preparado.arquivos.forEach((a, i) => {
      // Nomes novos: uma imagem do backup nunca sobrescreve uma da biblioteca atual.
      const nome = `restaurado-${lote}-${i}.${a.nome.split('.').at(-1)!.toLowerCase()}`
      const destino = join(pasta, a.pasta, nome)
      mkdirSync(dirname(destino), { recursive: true })
      novos.push(destino)
      copyFileSync(a.caminho, destino, constants.COPYFILE_EXCL)
      nomes.set(`${a.pasta}/${a.nome}`, nome)
    })
    banco.sqlite.prepare('ATTACH DATABASE ? AS restauracao').run(preparado.banco)
    anexado = true
    banco.sqlite.transaction(() => {
      for (const tabela of [...TABELAS].reverse()) banco.sqlite.prepare(`DELETE FROM main."${tabela}"`).run()
      for (const tabela of TABELAS)
        banco.sqlite.prepare(`INSERT INTO main."${tabela}" SELECT * FROM restauracao."${tabela}"`).run()
      const livros = banco.sqlite
        .prepare('SELECT id, capa_arquivo capa, miniatura_arquivo miniatura FROM livros')
        .all() as { id: number; capa: string | null; miniatura: string | null }[]
      const atualizar = banco.sqlite.prepare('UPDATE livros SET capa_arquivo = ?, miniatura_arquivo = ? WHERE id = ?')
      livros.forEach((l) =>
        atualizar.run(
          l.capa ? (nomes.get(`capas/${l.capa}`) ?? null) : null,
          l.miniatura ? (nomes.get(`miniaturas/${l.miniatura}`) ?? null) : null,
          l.id
        )
      )
      for (const chave of ['perfil.foto', 'perfil.topo']) {
        const original = (
          banco.sqlite.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get(chave) as
            { valor: string } | undefined
        )?.valor
        if (original)
          banco.sqlite
            .prepare('UPDATE configuracoes SET valor = ? WHERE chave = ?')
            .run(nomes.get(`capas/${original}`) ?? null, chave)
      }
      if ((banco.sqlite.pragma('foreign_key_check') as unknown[]).length)
        throw new Error('O backup contém referências inválidas. A biblioteca anterior foi preservada.')
    })()
    // Um backup antigo pode trazer status incoerentes ou configurações obsoletas.
    manutencao(banco.sqlite)
    // As imagens da biblioteca substituída estão no backup "antes-restaurar"; aqui só ocupariam espaço.
    const limpeza = limparImagensOrfas(banco.sqlite, pasta)
    registrarLog(
      'info',
      `Backup restaurado: ${preparado.nome}. Anterior guardado em ${anterior}. ${limpeza.arquivos} imagens antigas removidas.`
    )
    return anterior
  } catch (erro) {
    for (const caminho of novos) {
      try {
        unlinkSync(caminho)
      } catch {
        /* Arquivo não criado. */
      }
    }
    throw erro
  } finally {
    if (anexado) banco.sqlite.prepare('DETACH DATABASE restauracao').run()
    rmSync(preparado.pasta, { recursive: true, force: true })
  }
}

/** Nomes das entradas de um .bela versão 2 (para conferência e testes). */
export async function listarEntradasBackup(caminho: string): Promise<string[]> {
  const zip = await promisify<string, yauzl.Options, yauzl.ZipFile>(yauzl.open)(caminho, {
    lazyEntries: true,
    autoClose: true
  })
  const nomes: string[] = []
  await new Promise<void>((concluir, falhar) => {
    zip.on('error', falhar)
    zip.on('end', () => concluir())
    zip.on('entry', (e: yauzl.Entry) => {
      nomes.push(e.fileName)
      zip.readEntry()
    })
    zip.readEntry()
  })
  return nomes
}
