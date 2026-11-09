import { mkdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import type { DadosLivro, EntradaCapa, ResultadoSalvarLivro } from '@shared/api'
import type { Banco } from './db/conexao'
import { LIMITE_IMAGEM } from '@shared/dominio'
import { criarMiniatura, extrairCores, type CoresCapa } from './capas-imagem'
import { urlCapaGoogle } from './google'
import { encontrarDuplicados, salvarDadosLivro, validarLivro } from './registro'
import { bytesImagem, idValido, objeto } from './validacao'
import { ultimaLeitura } from './status'
import { salvarLeitura } from './leituras'
import { apagarSeOrfas, type ImagemArquivo } from './imagens'

interface CapaPreparada {
  original: string
  miniatura: string
  cores: CoresCapa
  caminhos: string[]
}
const LIMITE = LIMITE_IMAGEM
async function preparar(pasta: string, entrada: EntradaCapa): Promise<CapaPreparada> {
  objeto(entrada)
  let bytes: Buffer
  if ('bytes' in entrada) {
    bytes = bytesImagem(entrada.bytes)
  } else if ('url' in entrada && typeof entrada.url === 'string') {
    const url = urlCapaGoogle(entrada.url)
    const resposta = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: 'error' }).catch(() => {
      throw new Error('Não foi possível baixar a capa. Tente novamente ou escolha uma imagem local.')
    })
    if (!resposta.ok || Number(resposta.headers.get('content-length') ?? 0) > LIMITE || !resposta.body)
      throw new Error('Não foi possível baixar a capa do Google Books.')
    const leitor = resposta.body.getReader()
    const partes: Uint8Array[] = []
    let tamanho = 0
    try {
      for (;;) {
        const { done, value } = await leitor.read()
        if (done) break
        tamanho += value.length
        if (tamanho > LIMITE) throw new Error('A capa ultrapassa o limite de 15 MB.')
        partes.push(value)
      }
    } finally {
      await leitor.cancel()
    }
    bytes = Buffer.concat(partes)
  } else throw new Error('Capa inválida.')
  let imagem: Buffer
  try {
    imagem = await sharp(bytes, { limitInputPixels: 40000000 })
      .rotate()
      .resize({ width: 2000, height: 3000, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer()
  } catch {
    throw new Error('Imagem inválida. Escolha um arquivo JPG, PNG ou WebP.')
  }
  const nome = `registro-${randomUUID()}.webp`
  const caminhos = [join(pasta, 'capas', nome), join(pasta, 'miniaturas', nome)]
  mkdirSync(join(pasta, 'capas'), { recursive: true })
  mkdirSync(join(pasta, 'miniaturas'), { recursive: true })
  try {
    const cores = await extrairCores(imagem)
    await sharp(imagem).toFile(caminhos[0])
    await criarMiniatura(imagem, caminhos[1])
    return { original: nome, miniatura: nome, cores, caminhos }
  } catch (erro) {
    limpar(caminhos)
    throw erro
  }
}
function limpar(caminhos: string[]): void {
  for (const caminho of caminhos) {
    try {
      unlinkSync(caminho)
    } catch {
      /* Apenas arquivos novos, que podem não ter sido escritos. */
    }
  }
}
// Devolve as imagens anteriores, que são apagadas depois do commit.
function aplicar({ sqlite }: Banco, id: number, capa: CapaPreparada): ImagemArquivo[] {
  const antes = sqlite
    .prepare('SELECT capa_arquivo capa, miniatura_arquivo miniatura FROM livros WHERE id = ?')
    .get(id) as { capa: string | null; miniatura: string | null } | undefined
  if (
    !sqlite
      .prepare(
        `UPDATE livros SET capa_arquivo = ?, miniatura_arquivo = ?, cor_principal = ?, cor_destaque_1 = ?, cor_destaque_2 = ?, cor_texto = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`
      )
      .run(
        capa.original,
        capa.miniatura,
        capa.cores.principal,
        capa.cores.destaque1,
        capa.cores.destaque2,
        capa.cores.texto,
        id
      ).changes
  )
    throw new Error('Livro não encontrado.')
  return [
    { pasta: 'capas', nome: antes?.capa ?? '' },
    { pasta: 'miniaturas', nome: antes?.miniatura ?? '' }
  ]
}
export async function salvarRegistro(
  banco: Banco,
  pasta: string,
  entrada: DadosLivro,
  confirmar = false,
  imagem?: EntradaCapa
): Promise<ResultadoSalvarLivro> {
  const dados = validarLivro(entrada)
  if (dados.id && dados.leituraInicial) throw new Error('Edite as leituras pelo histórico da ficha.')
  if (dados.leituraInicial && dados.leituraInicial.status !== dados.status)
    throw new Error('O status do livro e da primeira leitura devem ser iguais.')
  if (typeof confirmar !== 'boolean') throw new Error('Confirmação inválida.')
  const duplicados = encontrarDuplicados(banco, dados)
  if (duplicados.length && !confirmar) return { duplicados }
  const capa = imagem ? await preparar(pasta, imagem) : undefined
  let anteriores: ImagemArquivo[] = []
  try {
    const resultado: ResultadoSalvarLivro = banco.sqlite.transaction((): ResultadoSalvarLivro => {
      // O processamento da capa é assíncrono: outro cadastro pode ter terminado enquanto isso.
      const atuais = encontrarDuplicados(banco, dados)
      if (atuais.length && !confirmar) return { duplicados: atuais }
      const salvo = salvarDadosLivro(banco, dados)
      if (dados.leituraInicial) {
        salvarLeitura(banco, { ...dados.leituraInicial, livroId: salvo, id: ultimaLeitura(banco.sqlite, salvo)?.id })
      }
      if (capa) anteriores = aplicar(banco, salvo, capa)
      return { id: salvo }
    })()
    if (resultado.duplicados && capa) limpar(capa.caminhos)
    apagarSeOrfas(banco.sqlite, pasta, anteriores)
    return resultado
  } catch (erro) {
    if (capa) limpar(capa.caminhos)
    throw erro
  }
}
export async function trocarCapa(banco: Banco, pasta: string, id: number, imagem: EntradaCapa): Promise<void> {
  idValido(id)
  if (!banco.sqlite.prepare('SELECT 1 FROM livros WHERE id = ?').get(id)) throw new Error('Livro não encontrado.')
  const capa = await preparar(pasta, imagem)
  let anteriores: ImagemArquivo[]
  try {
    anteriores = aplicar(banco, id, capa)
  } catch (erro) {
    limpar(capa.caminhos)
    throw erro
  }
  apagarSeOrfas(banco.sqlite, pasta, anteriores)
}
