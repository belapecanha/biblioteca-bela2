import type { ConfiguracaoGoogle, ResultadoGoogle } from '@shared/api'
import { texto } from './validacao'

interface VolumeGoogle {
  id?: string
  volumeInfo?: {
    title?: string; subtitle?: string; authors?: string[]; publisher?: string; publishedDate?: string
    pageCount?: number; language?: string; description?: string; ratingsCount?: number
    industryIdentifiers?: { type: string; identifier: string }[]
    imageLinks?: { thumbnail?: string }
  }
}
export function urlCapaGoogle(valor: string): string {
  const url = new URL(valor)
  const hosts = ['books.google.com', 'books.googleusercontent.com', 'lh3.googleusercontent.com', 'covers.openlibrary.org']
  if (url.protocol !== 'https:' || !hosts.includes(url.hostname) || url.username || url.password || (url.port && url.port !== '443')) throw new Error('Endereço de capa inválido.')
  return url.href
}
export function mapearVolume(volume: VolumeGoogle): ResultadoGoogle | null {
  const v = volume.volumeInfo
  if (!v?.title || !volume.id) return null
  const ano = Number(v.publishedDate?.slice(0, 4))
  let capaUrl: string | null = null
  try { if (v.imageLinks?.thumbnail) capaUrl = urlCapaGoogle(v.imageLinks.thumbnail.replace(/^http:/, 'https:')) } catch { /* Sem capa se o provedor mudar para um endereço não permitido. */ }
  return {
    googleId: volume.id, titulo: v.title + (v.subtitle ? `: ${v.subtitle}` : ''), autores: v.authors ?? [],
    editora: v.publisher ?? null, anoEdicao: Number.isInteger(ano) && ano > 0 ? ano : null,
    paginas: Number.isInteger(v.pageCount) && v.pageCount! > 0 ? v.pageCount! : null,
    idioma: v.language ?? null, sinopse: v.description?.replace(/<[^>]*>/g, '') ?? null,
    isbn10: v.industryIdentifiers?.find((i) => i.type === 'ISBN_10')?.identifier ?? null,
    isbn13: v.industryIdentifiers?.find((i) => i.type === 'ISBN_13')?.identifier ?? null, capaUrl, fonte: 'google'
  }
}

const simples = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Ordem: o que corresponde ao termo, depois português e inglês, depois o mais avaliado.
// O Google não informa leituras; ratingsCount é o único sinal de popularidade que ele dá.
export function priorizarVolumes(volumes: VolumeGoogle[], termo: string): VolumeGoogle[] {
  const palavras = simples(termo).split(/[^\p{L}\p{N}]+/u).filter((p) => p.length > 1)
  const pontos = (volume: VolumeGoogle) => {
    const v = volume.volumeInfo
    const texto = simples(`${v?.title ?? ''} ${v?.subtitle ?? ''} ${(v?.authors ?? []).join(' ')}`)
    const isbn = v?.industryIdentifiers?.some((i) => simples(termo).replace(/[^0-9x]/g, '') === i.identifier.toLowerCase())
    return { corresponde: isbn || palavras.every((p) => texto.includes(p)) ? 1 : 0, idioma: /^(pt|en)\b/i.test(v?.language ?? '') ? 1 : 0, avaliacoes: v?.ratingsCount ?? 0 }
  }
  return volumes.map((volume) => ({ volume, p: pontos(volume) }))
    .sort((a, b) => b.p.corresponde - a.p.corresponde || b.p.idioma - a.p.idioma || b.p.avaliacoes - a.p.avaliacoes)
    .map((x) => x.volume)
}

export function chaveDoEnv(conteudo: string): string | null {
  const valor = conteudo.match(/^\s*(?:export\s+)?GOOGLE_BOOKS_API_KEY\s*=\s*(.*)$/m)?.[1].trim().replace(/^['"]|['"]$/g, '')
  return valor && /^[A-Za-z0-9_-]{10,256}$/.test(valor) ? valor : null
}

// O renderer recebe apenas o estado da configuração. A chave fica no processo principal.
interface ObraOpenLibrary {
  key?: string; title?: string; subtitle?: string; author_name?: string[]; language?: string[]; cover_i?: number; readinglog_count?: number
}
const IDIOMAS: Record<string, string> = { por: 'pt', eng: 'en', spa: 'es', fre: 'fr', ger: 'de', ita: 'it', jpn: 'ja', kor: 'ko' }

// A Open Library informa quantas pessoas marcaram a obra, um sinal melhor de "mais lidos" que o do Google.
// Os dados são da obra, não de uma edição: editora, ano e ISBN ficam para a revisão.
export function mapearOpenLibrary(docs: ObraOpenLibrary[], termo: string, isbn: string | null): ResultadoGoogle[] {
  const palavras = simples(termo).split(/[^\p{L}\p{N}]+/u).filter((p) => p.length > 1)
  const pontos = (d: ObraOpenLibrary) => ({
    corresponde: isbn || palavras.every((p) => simples(`${d.title ?? ''} ${d.subtitle ?? ''} ${(d.author_name ?? []).join(' ')}`).includes(p)) ? 1 : 0,
    idioma: d.language?.some((l) => l === 'por' || l === 'eng') ? 1 : 0,
    lidos: d.readinglog_count ?? 0
  })
  return docs.filter((d) => d.title && d.key).map((d) => ({ d, p: pontos(d) }))
    .sort((a, b) => b.p.corresponde - a.p.corresponde || b.p.idioma - a.p.idioma || b.p.lidos - a.p.lidos)
    .slice(0, 12)
    .map(({ d }) => {
      const idioma = d.language?.includes('por') ? 'por' : d.language?.includes('eng') ? 'eng' : d.language?.[0]
      return {
        googleId: `openlibrary:${d.key}`, titulo: d.title! + (d.subtitle ? `: ${d.subtitle}` : ''), autores: d.author_name ?? [],
        editora: null, anoEdicao: null, paginas: null, idioma: idioma ? (IDIOMAS[idioma] ?? idioma) : null, sinopse: null,
        isbn10: isbn?.length === 10 ? isbn : null, isbn13: isbn?.length === 13 ? isbn : null,
        capaUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : null, fonte: 'openlibrary'
      }
    })
}

class FalhaGoogle extends Error {}

export function servicoGoogle(lerChave: () => string | null, solicitar: typeof fetch = fetch) {
  const configuracao = (arquivo: string): ConfiguracaoGoogle => ({ configurada: !!lerChave(), arquivo })
  const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms))

  async function google(termo: string, isbn: string | null, chave: string): Promise<ResultadoGoogle[]> {
    const url = new URL('https://www.googleapis.com/books/v1/volumes')
    // Sem o prefixo, o Google trata o ISBN como texto e devolve outros livros.
    url.search = new URLSearchParams({ q: isbn ? `isbn:${isbn}` : termo, key: chave, maxResults: '40', printType: 'books' }).toString()
    let resposta: Response
    try {
      resposta = await solicitar(url.href, { signal: AbortSignal.timeout(20000) })
      // O Google responde 503 em boa parte das buscas, mesmo com a chave certa.
      for (const espera of [400, 1000]) {
        if (resposta.status < 500) break
        await esperar(espera)
        resposta = await solicitar(url.href, { signal: AbortSignal.timeout(20000) })
      }
    } catch { throw new FalhaGoogle('conexão') }
    if (resposta.status === 400 || resposta.status === 403) throw new FalhaGoogle('chave')
    if (!resposta.ok) throw new FalhaGoogle('instável')
    const dados = await resposta.json().catch(() => { throw new FalhaGoogle('resposta') }) as { items?: VolumeGoogle[] }
    if (!Array.isArray(dados.items)) return []
    return priorizarVolumes(dados.items, termo).map(mapearVolume).filter((v): v is ResultadoGoogle => v !== null).slice(0, 12)
  }

  async function openLibrary(termo: string, isbn: string | null): Promise<ResultadoGoogle[]> {
    const url = new URL('https://openlibrary.org/search.json')
    url.search = new URLSearchParams({ ...(isbn ? { isbn } : { q: termo }), limit: '40', fields: 'key,title,subtitle,author_name,language,cover_i,readinglog_count' }).toString()
    const resposta = await solicitar(url.href, { signal: AbortSignal.timeout(20000) })
    if (!resposta.ok) throw new Error(`Open Library ${resposta.status}`)
    const dados = await resposta.json() as { docs?: ObraOpenLibrary[] }
    return mapearOpenLibrary(Array.isArray(dados.docs) ? dados.docs : [], termo, isbn)
  }

  async function buscar(entrada: string): Promise<ResultadoGoogle[]> {
    const termo = texto(entrada, 'o título, autor ou ISBN', 300, true)!
    const semSeparador = termo.replace(/[\s-]/g, '')
    const isbn = /^(\d{9}[\dXx]|\d{13})$/.test(semSeparador) ? semSeparador.toUpperCase() : null
    const chave = lerChave()
    let falha = chave ? '' : 'sem chave'
    if (chave) {
      try { return await google(termo, isbn, chave) } catch (erro) {
        if (!(erro instanceof FalhaGoogle)) throw erro
        falha = erro.message
      }
    }
    try { return await openLibrary(termo, isbn) } catch {
      if (falha === 'conexão') throw new Error('Não foi possível buscar. Verifique sua conexão e tente novamente.')
      if (falha === 'chave') throw new Error('O Google Books recusou a chave do .env e a Open Library não respondeu. Confira a chave e a ativação da Books API.')
      if (falha === 'sem chave') throw new Error('A Open Library não respondeu, e não há GOOGLE_BOOKS_API_KEY no .env para usar o Google Books. Tente de novo ou cadastre manualmente.')
      throw new Error('O Google Books e a Open Library estão fora do ar agora. Tente de novo em instantes ou cadastre manualmente.')
    }
  }
  return { configuracao, buscar }
}
