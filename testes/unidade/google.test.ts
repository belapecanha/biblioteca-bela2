import { describe, expect, it, vi } from 'vitest'
import { chaveDoEnv, mapearVolume, priorizarVolumes, servicoGoogle, urlCapaGoogle } from '../../src/main/google'
import { filtrarPaises, PAISES, paisExato } from '../../src/shared/paises'

describe('Google Books', () => {
  it('lê a chave do .env com comentários, aspas e fim de linha do Windows', () => {
    expect(chaveDoEnv('# comentário\r\nOUTRA=1\r\nGOOGLE_BOOKS_API_KEY=chave-secreta-teste\r\n')).toBe('chave-secreta-teste')
    expect(chaveDoEnv('GOOGLE_BOOKS_API_KEY = "chave-secreta-teste"')).toBe('chave-secreta-teste')
    expect(chaveDoEnv('# GOOGLE_BOOKS_API_KEY=chave-secreta-teste')).toBeNull()
    expect(chaveDoEnv('GOOGLE_BOOKS_API_KEY=')).toBeNull()
    expect(chaveDoEnv('GOOGLE_BOOKS_API_KEY=com espaço inválido')).toBeNull()
  })
  it('não devolve a chave na configuração e usa a chave atual a cada busca', () => {
    let chave: string | null = 'chave-secreta-teste'
    const google = servicoGoogle(() => chave)
    expect(google.configuracao('C:/x/.env')).toEqual({ configurada: true, arquivo: 'C:/x/.env' })
    chave = null
    expect(google.configuracao('C:/x/.env').configurada).toBe(false)
  })
  it('busca por termo codificado no principal e retorna somente metadados', async () => {
    const solicitar = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ items: [{ id: '1', volumeInfo: { title: 'Livro', authors: ['Autora'], pageCount: 200, publishedDate: '2020-05-01' } }] })))
    const google = servicoGoogle(() => 'chave-secreta-teste', solicitar)
    expect(await google.buscar('livro & autora')).toMatchObject([{ titulo: 'Livro', autores: ['Autora'], anoEdicao: 2020 }])
    const url = new URL(solicitar.mock.calls[0][0] as string)
    expect(url.origin).toBe('https://www.googleapis.com')
    expect(url.searchParams.get('q')).toBe('livro & autora')
    expect(url.searchParams.get('key')).toBe('chave-secreta-teste')
  })
  it('busca o ISBN pelo campo próprio do Google', async () => {
    const solicitar = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ items: [] })))
    await servicoGoogle(() => 'chave-secreta-teste', solicitar).buscar('978-85-8235-667-8')
    expect(new URL(solicitar.mock.calls[0][0] as string).searchParams.get('q')).toBe('isbn:9788582356678')
  })
  it('usa a Open Library quando o Google falha ou não há chave, sem enviar a chave a ela', async () => {
    const obras = { docs: [
      { key: '/works/1', title: 'Caraval', author_name: ['Stephanie Garber'], language: ['fre'], readinglog_count: 9000, cover_i: 7 },
      { key: '/works/2', title: 'Caraval', author_name: ['Stephanie Garber'], language: ['eng', 'por'], readinglog_count: 1350 },
      { key: '/works/3', title: 'Caraval', language: ['eng'], readinglog_count: 4000 },
      { key: '/works/4', title: 'Outro', language: ['por'], readinglog_count: 99999 }
    ] }
    const solicitar = vi.fn<typeof fetch>().mockImplementation(async (url) => String(url).includes('openlibrary') ? new Response(JSON.stringify(obras)) : new Response('', { status: 503 }))
    const resultado = await servicoGoogle(() => 'chave-secreta-teste', solicitar).buscar('caraval')
    expect(resultado.map((r) => r.googleId)).toEqual(['openlibrary:/works/3', 'openlibrary:/works/2', 'openlibrary:/works/1', 'openlibrary:/works/4'])
    expect(resultado[1]).toMatchObject({ idioma: 'pt', fonte: 'openlibrary', editora: null, isbn13: null })
    expect(resultado[2].capaUrl).toBe('https://covers.openlibrary.org/b/id/7-L.jpg')
    expect(urlCapaGoogle(resultado[2].capaUrl!)).toBe(resultado[2].capaUrl)
    expect(solicitar).toHaveBeenCalledTimes(4)
    expect(solicitar.mock.calls.filter(([u]) => String(u).includes('openlibrary')).every(([u]) => !String(u).includes('chave-secreta-teste'))).toBe(true)

    solicitar.mockClear()
    await servicoGoogle(() => null, solicitar).buscar('978-85-8235-667-8')
    expect(solicitar).toHaveBeenCalledTimes(1)
    expect(new URL(String(solicitar.mock.calls[0][0])).searchParams.get('isbn')).toBe('9788582356678')
  })
  it('explica a falha quando as duas fontes falham, sem expor o segredo', async () => {
    const solicitar = vi.fn<typeof fetch>().mockRejectedValue(new Error('https://secret?key=chave-secreta-teste'))
    await expect(servicoGoogle(() => 'chave-secreta-teste', solicitar).buscar('livro')).rejects.toThrow(/^Não foi possível buscar\. Verifique sua conexão/)
    solicitar.mockImplementation(async (url) => new Response('', { status: String(url).includes('openlibrary') ? 500 : 403 }))
    await expect(servicoGoogle(() => 'chave-secreta-teste', solicitar).buscar('livro')).rejects.toThrow('recusou a chave')
    solicitar.mockResolvedValue(new Response('', { status: 503 }))
    await expect(servicoGoogle(() => 'chave-secreta-teste', solicitar).buscar('livro')).rejects.toThrow('fora do ar')
    await expect(servicoGoogle(() => null, solicitar).buscar('livro')).rejects.toThrow('GOOGLE_BOOKS_API_KEY')
  })
  it('prioriza o termo, português e inglês e depois os mais avaliados, sem perder resultados', () => {
    const v = (id: string, title: string, language: string, ratingsCount?: number) => ({ id, volumeInfo: { title, language, ratingsCount } })
    const lista = [v('fr', 'Caraval', 'fr', 900), v('outro', 'Outro livro', 'pt-BR', 500), v('pt', 'Caraval', 'pt-BR'), v('en', 'Caraval', 'en', 4), v('br', 'Caraval: edição', 'pt', 10)]
    expect(priorizarVolumes(lista, 'caraval').map((x) => x.id)).toEqual(['br', 'en', 'pt', 'fr', 'outro'])
    const isbn = { id: 'i', volumeInfo: { title: 'Título', language: 'fr', industryIdentifiers: [{ type: 'ISBN_13', identifier: '9788582356678' }] } }
    expect(priorizarVolumes([v('x', 'Outro', 'pt'), isbn], '978-85-8235-667-8')[0].id).toBe('i')
  })
  it('tenta de novo uma vez quando o Google falha e devolve no máximo 12', async () => {
    const itens = Array.from({ length: 20 }, (_, i) => ({ id: String(i), volumeInfo: { title: `Livro ${i}` } }))
    const solicitar = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(new Response(JSON.stringify({ items: itens })))
    const google = servicoGoogle(() => 'chave-secreta-teste', solicitar)
    expect(await google.buscar('livro')).toHaveLength(12)
    expect(solicitar).toHaveBeenCalledTimes(2)
  })
  it('lista os países e filtra ignorando acentos', () => {
    expect(PAISES.length).toBeGreaterThan(240)
    for (const p of ['Brasil', 'Estados Unidos', 'Coreia do Sul', 'Reino Unido', 'Portugal', 'Espanha', 'Argentina', 'Azerbaijão']) expect(PAISES).toContain(p)
    expect(filtrarPaises('bra')[0]).toBe('Brasil')
    expect(filtrarPaises('azerbaijao')).toEqual(['Azerbaijão'])
    expect(filtrarPaises('coreia')).toEqual(expect.arrayContaining(['Coreia do Sul', 'Coreia do Norte']))
    expect(filtrarPaises('xyzq')).toEqual([])
    expect(paisExato(' BRASIL ')).toBe('Brasil')
    expect(paisExato('Bras')).toBeUndefined()
  })
  it('filtra capas fora do Google e limpa HTML da descrição', () => {
    expect(() => urlCapaGoogle('https://localhost/imagem')).toThrow()
    expect(() => urlCapaGoogle('http://books.google.com/imagem')).toThrow()
    expect(mapearVolume({ id: '1', volumeInfo: { title: 'Livro', description: '<p>Texto</p>', imageLinks: { thumbnail: 'http://books.google.com/books?id=1' } } })).toMatchObject({ sinopse: 'Texto', capaUrl: 'https://books.google.com/books?id=1' })
  })
})
