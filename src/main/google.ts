import type { ConfiguracaoGoogle, ResultadoGoogle } from '@shared/api'
import { texto } from './validacao'
import { simples } from '@shared/texto'

interface VolumeGoogle {
  id?: string
  volumeInfo?: {
    title?: string
    subtitle?: string
    authors?: string[]
    publisher?: string
    publishedDate?: string
    pageCount?: number
    language?: string
    description?: string
    ratingsCount?: number
    industryIdentifiers?: { type: string; identifier: string }[]
    imageLinks?: { thumbnail?: string }
  }
}
export function urlCapaGoogle(valor: string): string {
  const url = new URL(valor)
  const hosts = ['books.google.com', 'books.googleusercontent.com', 'lh3.googleusercontent.com']
  if (
    url.protocol !== 'https:' ||
    !hosts.includes(url.hostname) ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443')
  )
    throw new Error('Endereço de capa inválido.')
  return url.href
}
export function mapearVolume(volume: VolumeGoogle): ResultadoGoogle | null {
  const v = volume.volumeInfo
  if (!v?.title || !volume.id) return null
  const ano = Number(v.publishedDate?.slice(0, 4))
  let capaUrl: string | null = null
  try {
    if (v.imageLinks?.thumbnail) capaUrl = urlCapaGoogle(v.imageLinks.thumbnail.replace(/^http:/, 'https:'))
  } catch {
    /* Sem capa se o provedor mudar para um endereço não permitido. */
  }
  return {
    googleId: volume.id,
    titulo: v.title + (v.subtitle ? `: ${v.subtitle}` : ''),
    autores: v.authors ?? [],
    editora: v.publisher ?? null,
    anoEdicao: Number.isInteger(ano) && ano > 0 ? ano : null,
    paginas: Number.isInteger(v.pageCount) && v.pageCount! > 0 ? v.pageCount! : null,
    idioma: v.language ?? null,
    sinopse: v.description?.replace(/<[^>]*>/g, '') ?? null,
    isbn10: v.industryIdentifiers?.find((i) => i.type === 'ISBN_10')?.identifier ?? null,
    isbn13: v.industryIdentifiers?.find((i) => i.type === 'ISBN_13')?.identifier ?? null,
    capaUrl
  }
}

// Ordem: o que corresponde ao termo, depois português e inglês, depois o mais avaliado.
// O Google não informa leituras; ratingsCount é o único sinal de popularidade que ele dá.
export function priorizarVolumes(volumes: VolumeGoogle[], termo: string): VolumeGoogle[] {
  const palavras = simples(termo)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((p) => p.length > 1)
  const pontos = (volume: VolumeGoogle) => {
    const v = volume.volumeInfo
    const texto = simples(`${v?.title ?? ''} ${v?.subtitle ?? ''} ${(v?.authors ?? []).join(' ')}`)
    const isbn = v?.industryIdentifiers?.some(
      (i) => simples(termo).replace(/[^0-9x]/g, '') === i.identifier.toLowerCase()
    )
    return {
      corresponde: isbn || palavras.every((p) => texto.includes(p)) ? 1 : 0,
      idioma: /^(pt|en)\b/i.test(v?.language ?? '') ? 1 : 0,
      avaliacoes: v?.ratingsCount ?? 0
    }
  }
  return volumes
    .map((volume) => ({ volume, p: pontos(volume) }))
    .sort((a, b) => b.p.corresponde - a.p.corresponde || b.p.idioma - a.p.idioma || b.p.avaliacoes - a.p.avaliacoes)
    .map((x) => x.volume)
}

export function chaveDoEnv(conteudo: string): string | null {
  const valor = conteudo
    .match(/^\s*(?:export\s+)?GOOGLE_BOOKS_API_KEY\s*=\s*(.*)$/m)?.[1]
    .trim()
    .replace(/^['"]|['"]$/g, '')
  return valor && /^[A-Za-z0-9_-]{10,256}$/.test(valor) ? valor : null
}

class FalhaGoogle extends Error {}

export function servicoGoogle(lerChave: () => string | null, solicitar: typeof fetch = fetch) {
  const configuracao = (arquivo: string): ConfiguracaoGoogle => ({ configurada: !!lerChave(), arquivo })
  const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms))

  async function google(termo: string, isbn: string | null, chave: string): Promise<ResultadoGoogle[]> {
    const url = new URL('https://www.googleapis.com/books/v1/volumes')
    // Sem o prefixo, o Google trata o ISBN como texto e devolve outros livros.
    url.search = new URLSearchParams({
      q: isbn ? `isbn:${isbn}` : termo,
      key: chave,
      maxResults: '40',
      printType: 'books'
    }).toString()
    let resposta: Response
    try {
      resposta = await solicitar(url.href, { signal: AbortSignal.timeout(20000) })
      // O Google responde 503 em boa parte das buscas, mesmo com a chave certa.
      for (const espera of [400, 1000]) {
        if (resposta.status < 500) break
        await esperar(espera)
        resposta = await solicitar(url.href, { signal: AbortSignal.timeout(20000) })
      }
    } catch {
      throw new FalhaGoogle('conexão')
    }
    if (resposta.status === 400 || resposta.status === 403) throw new FalhaGoogle('chave')
    if (!resposta.ok) throw new FalhaGoogle('instável')
    const dados = (await resposta.json().catch(() => {
      throw new FalhaGoogle('resposta')
    })) as { items?: VolumeGoogle[] }
    if (!Array.isArray(dados.items)) return []
    return priorizarVolumes(dados.items, termo)
      .map(mapearVolume)
      .filter((v): v is ResultadoGoogle => v !== null)
      .slice(0, 12)
  }

  // Só o Google Books, com a chave do .env. Sem chave válida, a busca nem sai do computador.
  async function buscar(entrada: string): Promise<ResultadoGoogle[]> {
    const termo = texto(entrada, 'o título, autor ou ISBN', 300, true)!
    const semSeparador = termo.replace(/[\s-]/g, '')
    const isbn = /^(\d{9}[\dXx]|\d{13})$/.test(semSeparador) ? semSeparador.toUpperCase() : null
    const chave = lerChave()
    if (!chave)
      throw new Error(
        'Não há uma GOOGLE_BOOKS_API_KEY válida no arquivo .env. Veja o caminho do arquivo em Configurações ou cadastre o livro manualmente.'
      )
    try {
      return await google(termo, isbn, chave)
    } catch (erro) {
      if (!(erro instanceof FalhaGoogle)) throw erro
      if (erro.message === 'conexão')
        throw new Error('Não foi possível buscar. Verifique sua conexão e tente novamente.')
      if (erro.message === 'chave')
        throw new Error(
          'O Google Books recusou a chave do .env. Confira a chave e se a Books API está ativada no Google Cloud.'
        )
      throw new Error('O Google Books não respondeu agora. Tente de novo em instantes ou cadastre manualmente.')
    }
  }
  return { configuracao, buscar }
}
