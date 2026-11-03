import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'
import Database from 'better-sqlite3'
import type { Banco } from './db/conexao'

const TABELAS = ['editoras', 'autores', 'series', 'classificacoes', 'livros', 'livro_autores', 'livro_classificacoes', 'leituras', 'progresso', 'citacoes', 'listas', 'lista_livros', 'fila_meta', 'metas', 'configuracoes']
interface ArquivoBackup { pasta: 'capas' | 'miniaturas'; nome: string; dados: string }
interface ConteudoBackup { formato: 'biblioteca-bela'; versao: 1; criado: string; banco: string; arquivos: ArquivoBackup[] }
export interface BackupPreparado { pasta: string; banco: string; arquivos: ArquivoBackup[]; livros: number; leituras: number; nome: string }
const MAXIMO = 512 * 1024 * 1024
function nomeSeguro(nome: unknown): nome is string { return typeof nome === 'string' && nome.length < 250 && /^[\w.-]+\.(?:webp|jpe?g|png|avif|gif)$/i.test(nome) && !nome.includes('..') }
function base64(valor: unknown): valor is string { return typeof valor === 'string' && valor.length > 0 && valor.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(valor) }
export function protegerDestino(pasta: string, destino: string): void {
  const raiz = resolve(pasta).toLowerCase() + sep
  const alvo = resolve(destino).toLowerCase()
  if (alvo.startsWith(raiz) && !alvo.startsWith(join(raiz, 'backups').toLowerCase() + sep)) throw new Error('Escolha uma pasta fora dos arquivos internos da biblioteca.')
}
export function gravarArquivo(destino: string, dados: Buffer | string): void {
  const temporario = join(dirname(destino), `.bela-${randomUUID()}.tmp`)
  try { writeFileSync(temporario, dados, { flag: 'wx' }); renameSync(temporario, destino) } finally { if (existsSync(temporario)) unlinkSync(temporario) }
}
export async function criarBackup(banco: Banco, pasta: string, destino: string): Promise<void> {
  protegerDestino(pasta, destino)
  const temporaria = mkdtempSync(join(tmpdir(), 'bela-backup-'))
  try {
    const copia = join(temporaria, 'biblioteca.db')
    await banco.sqlite.backup(copia)
    const arquivos: ArquivoBackup[] = []
    let tamanho = statSync(copia).size
    for (const tipo of ['capas', 'miniaturas'] as const) {
      const origem = join(pasta, tipo)
      if (!existsSync(origem)) continue
      for (const item of readdirSync(origem, { withFileTypes: true })) {
        if (!item.isFile() || item.isSymbolicLink() || !nomeSeguro(item.name)) continue
        const caminho = join(origem, item.name)
        tamanho += statSync(caminho).size
        if (tamanho > MAXIMO / 1.5) throw new Error('As imagens ultrapassam o limite deste formato de backup (340 MB).')
        arquivos.push({ pasta: tipo, nome: item.name, dados: readFileSync(caminho).toString('base64') })
      }
    }
    const conteudo: ConteudoBackup = { formato: 'biblioteca-bela', versao: 1, criado: new Date().toISOString(), banco: readFileSync(copia).toString('base64'), arquivos }
    gravarArquivo(destino, gzipSync(JSON.stringify(conteudo)))
  } finally { rmSync(temporaria, { recursive: true, force: true }) }
}
export function prepararBackup(banco: Banco, caminho: string): BackupPreparado {
  if (statSync(caminho).size > 256 * 1024 * 1024) throw new Error('O backup ultrapassa o limite de 256 MB compactados.')
  let dados: ConteudoBackup
  try { dados = JSON.parse(gunzipSync(readFileSync(caminho), { maxOutputLength: MAXIMO }).toString('utf8')) as ConteudoBackup } catch { throw new Error('O arquivo não é um backup válido da Biblioteca Bela.') }
  if (!dados || dados.formato !== 'biblioteca-bela' || dados.versao !== 1 || !base64(dados.banco) || !Array.isArray(dados.arquivos) || dados.arquivos.length > 50000) throw new Error('Formato de backup incompatível.')
  const nomes = new Set<string>()
  for (const a of dados.arquivos) {
    if (!a || !['capas', 'miniaturas'].includes(a.pasta) || !nomeSeguro(a.nome) || !base64(a.dados) || nomes.has(`${a.pasta}/${a.nome}`)) throw new Error('O backup contém arquivos inválidos ou repetidos.')
    nomes.add(`${a.pasta}/${a.nome}`)
  }
  const pasta = mkdtempSync(join(tmpdir(), 'bela-restaurar-'))
  const copia = join(pasta, 'biblioteca.db')
  let origem: Database.Database | undefined
  try {
    writeFileSync(copia, Buffer.from(dados.banco, 'base64'))
    origem = new Database(copia, { readonly: true, fileMustExist: true })
    if (origem.pragma('quick_check', { simple: true }) !== 'ok' || (origem.pragma('foreign_key_check') as unknown[]).length) throw new Error('O banco do backup está danificado.')
    const estrutura = origem.prepare("SELECT name, type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all() as { name: string; type: string }[]
    if (estrutura.some((s) => s.type === 'trigger' || s.type === 'view' || (s.type === 'table' && ![...TABELAS, '__drizzle_migrations'].includes(s.name)))) throw new Error('O backup contém uma estrutura desconhecida.')
    for (const tabela of TABELAS) {
      const colunas = (db: Database.Database) => (db.prepare(`PRAGMA table_info("${tabela}")`).all() as { name: string }[]).map((c) => c.name).join(',')
      if (!estrutura.some((s) => s.name === tabela && s.type === 'table') || colunas(origem) !== colunas(banco.sqlite)) throw new Error('O backup pertence a uma versão incompatível do aplicativo.')
    }
    return { pasta, banco: copia, arquivos: dados.arquivos, livros: (origem.prepare('SELECT COUNT(*) n FROM livros').get() as { n: number }).n, leituras: (origem.prepare('SELECT COUNT(*) n FROM leituras').get() as { n: number }).n, nome: basename(caminho) }
  } catch (erro) { origem?.close(); origem = undefined; rmSync(pasta, { recursive: true, force: true }); throw erro } finally { origem?.close() }
}
export async function restaurarBackup(banco: Banco, pasta: string, preparado: BackupPreparado): Promise<string> {
  const pastaBackups = join(pasta, 'backups'); mkdirSync(pastaBackups, { recursive: true })
  const anterior = join(pastaBackups, `antes-restaurar-${Date.now()}-${randomUUID()}.bela`)
  await criarBackup(banco, pasta, anterior)
  const novos: string[] = []
  const nomes = new Map<string, string>()
  const lote = randomUUID()
  let anexado = false
  try {
    preparado.arquivos.forEach((a, i) => {
      const nome = `restaurado-${lote}-${i}.${a.nome.split('.').at(-1)!.toLowerCase()}`
      const destino = join(pasta, a.pasta, nome)
      mkdirSync(dirname(destino), { recursive: true }); novos.push(destino)
      writeFileSync(destino, Buffer.from(a.dados, 'base64'), { flag: 'wx' }); nomes.set(`${a.pasta}/${a.nome}`, nome)
    })
    banco.sqlite.prepare('ATTACH DATABASE ? AS restauracao').run(preparado.banco); anexado = true
    banco.sqlite.transaction(() => {
      for (const tabela of [...TABELAS].reverse()) banco.sqlite.prepare(`DELETE FROM main."${tabela}"`).run()
      for (const tabela of TABELAS) banco.sqlite.prepare(`INSERT INTO main."${tabela}" SELECT * FROM restauracao."${tabela}"`).run()
      const livros = banco.sqlite.prepare('SELECT id, capa_arquivo capa, miniatura_arquivo miniatura FROM livros').all() as { id: number; capa: string | null; miniatura: string | null }[]
      const atualizar = banco.sqlite.prepare('UPDATE livros SET capa_arquivo = ?, miniatura_arquivo = ? WHERE id = ?')
      livros.forEach((l) => atualizar.run(l.capa ? nomes.get(`capas/${l.capa}`) ?? null : null, l.miniatura ? nomes.get(`miniaturas/${l.miniatura}`) ?? null : null, l.id))
      for (const chave of ['perfil.foto', 'perfil.topo']) {
        const original = (banco.sqlite.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get(chave) as { valor: string } | undefined)?.valor
        if (original) banco.sqlite.prepare('UPDATE configuracoes SET valor = ? WHERE chave = ?').run(nomes.get(`capas/${original}`) ?? null, chave)
      }
      if ((banco.sqlite.pragma('foreign_key_check') as unknown[]).length) throw new Error('O backup contém referências inválidas. A biblioteca anterior foi preservada.')
    })()
    return anterior
  } catch (erro) { for (const caminho of novos) { try { unlinkSync(caminho) } catch { /* Arquivo não criado. */ } }; throw erro } finally { if (anexado) banco.sqlite.prepare('DETACH DATABASE restauracao').run(); rmSync(preparado.pasta, { recursive: true, force: true }) }
}
