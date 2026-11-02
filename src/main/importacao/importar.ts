import { copyFileSync, existsSync, readdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import Database from 'better-sqlite3'
import { criarMiniatura, extrairCores, type CoresCapa } from '../capas-imagem'
import type { Banco } from '../db/conexao'

export interface LivroTratado {
  goodreads_id: string
  titulo: string
  titulo_original: string | null
  serie: string | null
  volume: number | null
  autor: string
  coautores: string[]
  isbn: string | null
  isbn13: string | null
  editora: string | null
  formato: 'fisico' | 'ebook' | null
  paginas: number | null
  ano_edicao: number | null
  ano_publicacao: number | null
  status: 'quero_ler' | 'lendo' | 'lido' | 'pausado' | 'abandonado'
  nota: number | null
  data_leitura: string | null
  ano_leitura: number | null
  precisao_data: 'dia' | 'ano_provavel' | 'ano_da_estante' | null
  data_adicionado: string
  tipo: 'livro' | 'manhwa' | 'manga' | 'graphic_novel' | 'poesia'
  generos: string[]
  temas: string[]
  moods: string[]
  favorito: boolean
  estantes_ano: string[]
  resenha: string | null
}

export interface EntradaImportacao {
  livros: LivroTratado[]
  caminhoBancoAntigo: string
  pastaCapasAntigas: string
  pastaCapasAvulsas?: string
  pastaCapas: string
  pastaMiniaturas: string
}

export interface Relatorio {
  livros: number
  lidos: number
  leituras: number
  notaMedia: number
  paginasLidas: number
  capas: number
  capasDaPasta: string[]
  semCapa: string[]
  semSinopse: number
  sinopses: number
  paginasDoBancoAntigo: string[]
  anosCorrigidos: string[]
  apenasNoBancoAntigo: string[]
  statusDivergente: string[]
  posse: string[]
  favoritos: string[]
  listas: number
  ajustes: string[]
}

interface LinhaAntiga {
  id: number
  goodreads_id: string | null
  titulo: string
  paginas: number | null
  idioma: string | null
  sinopse: string | null
  isbn10: string | null
  capa_arquivo: string | null
  status_atual: string
  posse: string | null
}

// A edição cadastrada no Goodreads não indica onde o livro foi publicado de verdade.
const EDITORAS_SEM_PAIS = new Set(['Qanun Nəşriyyatı'])

// Livros só do app antigo não passam pelo tratamento do Goodreads.
const CLASSIFICACAO_APP_ANTIGO: Record<string, [string[], string[], string[]]> = {
  'A guerra dos tronos': [['Fantasia', 'Drama'], ['High Fantasy'], ['Épico', 'Dark', 'Tenso']]
}

function tituloLimpo(titulo: string): string {
  return titulo.split(' (')[0].trim()
}

function idBase(id: string): string {
  return id.split('-')[0]
}

export function normalizarNome(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\bvol(ume|umen)?\b/g, '')
    .replace(/[^a-z0-9]/g, '')
}

export function datasDaLeitura(l: LivroTratado): {
  dataFim: string | null
  anoFim: number | null
  precisaoFim: 'dia' | 'ano' | null
} {
  if (l.precisao_data === 'dia' && l.data_leitura) {
    return { dataFim: l.data_leitura, anoFim: Number(l.data_leitura.slice(0, 4)), precisaoFim: 'dia' }
  }
  // Data de 1º de janeiro é aproximada. Se a estante de ano discorda, ela é a informação escolhida.
  const estante = l.estantes_ano.length === 1 ? Number(l.estantes_ano[0]) : null
  const ano = estante ?? l.ano_leitura
  return ano ? { dataFim: null, anoFim: ano, precisaoFim: 'ano' } : { dataFim: null, anoFim: null, precisaoFim: null }
}

export async function importar(banco: Banco, e: EntradaImportacao): Promise<Relatorio> {
  const antigo = new Database(e.caminhoBancoAntigo, { readonly: true, fileMustExist: true })
  try {
    return await executar(banco, antigo, e)
  } finally {
    antigo.close()
  }
}

async function executar(banco: Banco, antigo: Database.Database, e: EntradaImportacao): Promise<Relatorio> {
  const { sqlite } = banco
  const linhas = antigo.prepare('SELECT * FROM livros').all() as LinhaAntiga[]
  const porGoodreads = new Map(linhas.filter((l) => l.goodreads_id).map((l) => [l.goodreads_id!, l]))
  const manuais = linhas.filter((l) => !l.goodreads_id)
  const paisEditora = new Map(
    (antigo.prepare('SELECT nome, pais FROM editoras').all() as { nome: string; pais: string | null }[]).map((x) => [x.nome, x.pais])
  )
  const paisAutor = new Map(
    (antigo.prepare('SELECT nome, pais FROM autores').all() as { nome: string; pais: string | null }[]).map((x) => [x.nome, x.pais])
  )
  const papeis = antigo.prepare(
    'SELECT a.nome, x.papel FROM livro_autores x JOIN autores a ON a.id = x.autor_id WHERE x.livro_id = ?'
  )

  const r: Relatorio = {
    livros: 0, lidos: 0, leituras: 0, notaMedia: 0, paginasLidas: 0, capas: 0, capasDaPasta: [], semCapa: [],
    semSinopse: 0, sinopses: 0, paginasDoBancoAntigo: [], anosCorrigidos: [], apenasNoBancoAntigo: [],
    statusDivergente: [], posse: [], favoritos: [], listas: 0, ajustes: []
  }

  // As capas são preparadas antes da transação, porque o processamento é assíncrono.
  const avulsas = new Map<string, string>()
  if (e.pastaCapasAvulsas && existsSync(e.pastaCapasAvulsas)) {
    for (const arquivo of readdirSync(e.pastaCapasAvulsas)) {
      if (/\.(avif|webp|jpe?g|png)$/i.test(arquivo)) {
        avulsas.set(normalizarNome(arquivo.replace(/\.[^.]+$/, '')), join(e.pastaCapasAvulsas, arquivo))
      }
    }
  }

  interface CapaPronta {
    arquivo: string
    miniatura: string
    cores: CoresCapa
  }
  const prepararCapa = async (chave: string, origem: string): Promise<CapaPronta | null> => {
    const arquivo = `${chave}${extname(origem).toLowerCase()}`
    const miniatura = `${chave}.webp`
    try {
      const cores = await extrairCores(origem)
      copyFileSync(origem, join(e.pastaCapas, arquivo))
      await criarMiniatura(origem, join(e.pastaMiniaturas, miniatura))
      return { arquivo, miniatura, cores }
    } catch {
      r.ajustes.push(`Capa ilegível ignorada: ${origem}`)
      return null
    }
  }
  const capaAntiga = (l: LinhaAntiga | undefined): string | null => {
    if (!l?.capa_arquivo) return null
    const caminho = join(e.pastaCapasAntigas, l.capa_arquivo)
    return existsSync(caminho) ? caminho : null
  }

  const capas = new Map<string, CapaPronta>()
  for (const l of e.livros) {
    const antiga = porGoodreads.get(l.goodreads_id) // volumes separados não herdam a capa da coleção
    let origem = capaAntiga(antiga)
    if (!origem) {
      const avulsa = avulsas.get(normalizarNome(tituloLimpo(l.titulo)))
      if (avulsa) {
        origem = avulsa
        r.capasDaPasta.push(tituloLimpo(l.titulo))
      }
    }
    if (origem) {
      const pronta = await prepararCapa(l.goodreads_id, origem)
      if (pronta) capas.set(l.goodreads_id, pronta)
    }
  }
  for (const m of manuais.filter((x) => !e.livros.some((l) => normalizarNome(tituloLimpo(l.titulo)) === normalizarNome(x.titulo)))) {
    const origem = capaAntiga(m)
    if (origem) {
      const pronta = await prepararCapa(`antigo-${m.id}`, origem)
      if (pronta) capas.set(`antigo-${m.id}`, pronta)
    }
  }

  const q = {
    editora: sqlite.prepare('INSERT INTO editoras (nome, pais) VALUES (?, ?) ON CONFLICT(nome) DO UPDATE SET nome = nome RETURNING id'),
    autor: sqlite.prepare('INSERT INTO autores (nome, pais) VALUES (?, ?) ON CONFLICT(nome) DO UPDATE SET nome = nome RETURNING id'),
    serie: sqlite.prepare('INSERT INTO series (nome) VALUES (?) ON CONFLICT(nome) DO UPDATE SET nome = nome RETURNING id'),
    livro: sqlite.prepare(`INSERT INTO livros (goodreads_id, origem, titulo, titulo_original, isbn10, isbn13, editora_id, serie_id, volume, tipo, formato,
      paginas, paginas_estimadas, ano_edicao, ano_publicacao, idioma, sinopse, capa_arquivo, miniatura_arquivo, cor_principal, cor_destaque_1, cor_destaque_2,
      cor_texto, status, posse, favorito_posicao, criado_em) VALUES (@goodreads, @origem, @titulo, @original, @isbn10, @isbn13, @editora, @serie, @volume, @tipo, @formato,
      @paginas, @estimadas, @anoEdicao, @anoPublicacao, @idioma, @sinopse, @capa, @miniatura, @cor, @d1, @d2, @texto, @status, @posse, @favorito, @criado)`),
    livroAutor: sqlite.prepare('INSERT OR IGNORE INTO livro_autores (livro_id, autor_id, papel, ordem) VALUES (?, ?, ?, ?)'),
    classificacao: sqlite.prepare('SELECT id FROM classificacoes WHERE tipo = ? AND nome = ?'),
    livroClasse: sqlite.prepare('INSERT INTO livro_classificacoes (livro_id, classificacao_id, ordem) VALUES (?, ?, ?)'),
    leitura: sqlite.prepare(`INSERT INTO leituras (livro_id, status, formato, data_fim, ano_fim, precisao_fim, nota, resenha)
      VALUES (@livro, @status, @formato, @dataFim, @anoFim, @precisao, @nota, @resenha)`),
    lista: sqlite.prepare('INSERT INTO listas (nome, ordenada) VALUES (?, 0) RETURNING id'),
    listaLivro: sqlite.prepare('INSERT OR IGNORE INTO lista_livros (lista_id, livro_id, posicao) VALUES (?, ?, ?)'),
    fila: sqlite.prepare('INSERT INTO fila_meta (livro_id, posicao) VALUES (?, ?)')
  }
  const idDe = (st: Database.Statement, ...args: unknown[]) => (st.get(...args) as { id: number }).id

  const paraIdLocal = new Map<string, number>()
  const paraIdBase = new Map<string, number[]>()

  const candidatosFavoritos = e.livros
    .filter((l) => l.favorito)
    .sort((a, b) => Number(capas.has(b.goodreads_id)) - Number(capas.has(a.goodreads_id)) || a.titulo.localeCompare(b.titulo, 'pt-BR'))
    .slice(0, 4)
    .map((l) => l.goodreads_id)

  const inserirAutores = (livroId: number, nomes: string[], antigoId?: number) => {
    const papelPor = new Map(
      antigoId ? (papeis.all(antigoId) as { nome: string; papel: string }[]).map((x) => [x.nome, x.papel]) : []
    )
    nomes.forEach((nome, i) => {
      const id = idDe(q.autor, nome, paisAutor.get(nome) ?? null)
      q.livroAutor.run(livroId, id, papelPor.get(nome) ?? 'autor', i)
    })
  }

  sqlite.transaction(() => {
    for (const l of e.livros) {
      const dono = porGoodreads.get(l.goodreads_id)
      const parteDeColecao = l.goodreads_id !== idBase(l.goodreads_id)
      const capa = capas.get(l.goodreads_id)

      let paginas = l.paginas
      if (!paginas && dono?.paginas) {
        paginas = dono.paginas
        r.paginasDoBancoAntigo.push(`${tituloLimpo(l.titulo)}: ${paginas}`)
      }
      if (!parteDeColecao && dono && dono.status_atual !== l.status) {
        r.statusDivergente.push(`${tituloLimpo(l.titulo)}: ${l.status} no Goodreads, ${dono.status_atual} no app antigo`)
      }

      const manual = manuais.find((m) => normalizarNome(m.titulo) === normalizarNome(tituloLimpo(l.titulo)))
      const posse = manual?.posse === 'tenho' || dono?.posse === 'tenho' ? 'tenho' : null
      if (posse) r.posse.push(tituloLimpo(l.titulo))

      const pais = l.editora && !EDITORAS_SEM_PAIS.has(l.editora) ? (paisEditora.get(l.editora) ?? null) : null
      const favorito = candidatosFavoritos.indexOf(l.goodreads_id)
      if (favorito >= 0) r.favoritos.push(tituloLimpo(l.titulo))
      const sinopse = dono?.sinopse?.trim() || null
      if (sinopse) r.sinopses++
      else r.semSinopse++
      if (!capa) r.semCapa.push(tituloLimpo(l.titulo))

      const livroId = Number(
        q.livro.run({
          goodreads: l.goodreads_id, origem: 'goodreads', titulo: tituloLimpo(l.titulo), original: l.titulo_original,
          isbn10: l.isbn ?? dono?.isbn10 ?? null, isbn13: l.isbn13,
          editora: l.editora ? idDe(q.editora, l.editora, pais) : null,
          serie: l.serie ? idDe(q.serie, l.serie) : null, volume: l.volume, tipo: l.tipo, formato: l.formato,
          paginas, estimadas: parteDeColecao && paginas ? 1 : 0, anoEdicao: l.ano_edicao, anoPublicacao: l.ano_publicacao,
          idioma: dono?.idioma ?? null, sinopse, capa: capa?.arquivo ?? null, miniatura: capa?.miniatura ?? null,
          cor: capa?.cores.principal ?? null, d1: capa?.cores.destaque1 ?? null, d2: capa?.cores.destaque2 ?? null, texto: capa?.cores.texto ?? null,
          status: l.status, posse, favorito: favorito >= 0 ? favorito + 1 : null, criado: l.data_adicionado
        }).lastInsertRowid
      )
      paraIdLocal.set(l.goodreads_id, livroId)
      paraIdBase.set(idBase(l.goodreads_id), [...(paraIdBase.get(idBase(l.goodreads_id)) ?? []), livroId])

      inserirAutores(livroId, [l.autor, ...l.coautores.filter((a) => a !== l.autor)], dono?.id)
      const grupos: ['genero' | 'tema' | 'mood', string[]][] = [['genero', l.generos], ['tema', l.temas], ['mood', l.moods]]
      for (const [tipo, nomes] of grupos) {
        nomes.forEach((nome, i) => q.livroClasse.run(livroId, idDe(q.classificacao, tipo, nome), i))
      }

      const datas = datasDaLeitura(l)
      if (datas.precisaoFim === 'ano' && l.data_leitura && Number(l.data_leitura.slice(0, 4)) !== datas.anoFim) {
        r.anosCorrigidos.push(`${tituloLimpo(l.titulo)}: ${l.data_leitura.slice(0, 4)} para ${datas.anoFim}`)
      }
      const leitura = (status: string, comDatas: boolean, nota: number | null) => {
        q.leitura.run({
          livro: livroId, status, formato: l.formato, dataFim: comDatas ? datas.dataFim : null, anoFim: comDatas ? datas.anoFim : null,
          precisao: comDatas ? datas.precisaoFim : null, nota, resenha: comDatas ? l.resenha : null
        })
        r.leituras++
      }
      if (l.status === 'lido') {
        leitura('lido', true, l.nota)
      } else if (l.status === 'lendo') {
        // Um livro "lendo" que já tem data e nota é uma releitura: a leitura anterior fica no histórico.
        if (datas.precisaoFim) {
          leitura('lido', true, l.nota)
          r.ajustes.push(`${tituloLimpo(l.titulo)}: leitura de ${datas.anoFim} mantida no histórico, e a atual aberta como releitura`)
        }
        leitura('lendo', false, null)
      }
    }

    // Registros feitos só no app antigo não podem se perder.
    for (const m of manuais) {
      if (normalizarNome(m.titulo) && e.livros.some((l) => normalizarNome(tituloLimpo(l.titulo)) === normalizarNome(m.titulo))) continue
      const capa = capas.get(`antigo-${m.id}`)
      const status = m.status_atual as LivroTratado['status']
      const livroId = Number(
        q.livro.run({
          goodreads: null, origem: 'banco_antigo', titulo: m.titulo, original: null, isbn10: m.isbn10, isbn13: null, editora: null, serie: null,
          volume: null, tipo: 'livro', formato: null, paginas: m.paginas, estimadas: 0, anoEdicao: null, anoPublicacao: null, idioma: m.idioma,
          sinopse: m.sinopse, capa: capa?.arquivo ?? null, miniatura: capa?.miniatura ?? null, cor: capa?.cores.principal ?? null,
          d1: capa?.cores.destaque1 ?? null, d2: capa?.cores.destaque2 ?? null, texto: capa?.cores.texto ?? null, status,
          posse: m.posse === 'tenho' ? 'tenho' : null, favorito: null, criado: new Date().toISOString().slice(0, 10)
        }).lastInsertRowid
      )
      const nomes = (papeis.all(m.id) as { nome: string }[]).map((x) => x.nome)
      inserirAutores(livroId, nomes, m.id)
      const [generos, temas, moods] = CLASSIFICACAO_APP_ANTIGO[m.titulo] ?? [[], [], []]
      const classes: ['genero' | 'tema' | 'mood', string[]][] = [['genero', generos], ['tema', temas], ['mood', moods]]
      for (const [tipo, nomes2] of classes) {
        nomes2.forEach((nome, i) => q.livroClasse.run(livroId, idDe(q.classificacao, tipo, nome), i))
      }
      if (status === 'lendo') {
        q.leitura.run({ livro: livroId, status: 'lendo', formato: null, dataFim: null, anoFim: null, precisao: null, nota: null, resenha: null })
        r.leituras++
      }
      r.apenasNoBancoAntigo.push(`${m.titulo} (${status})`)
      if (m.posse === 'tenho') r.posse.push(m.titulo)
      if (!capa) r.semCapa.push(m.titulo)
    }

    const estantes = antigo.prepare('SELECT id, nome FROM estantes ORDER BY ordem, id').all() as { id: number; nome: string }[]
    const membros = antigo.prepare(
      'SELECT l.goodreads_id AS gid FROM livro_estantes x JOIN livros l ON l.id = x.livro_id WHERE x.estante_id = ? AND l.goodreads_id IS NOT NULL'
    )
    for (const estante of estantes) {
      if (/^\d{4}$/.test(estante.nome)) continue
      const listaId = idDe(q.lista, nomeLista(estante.nome))
      let posicao = 0
      for (const { gid } of membros.all(estante.id) as { gid: string }[]) {
        for (const livroId of paraIdBase.get(gid) ?? []) q.listaLivro.run(listaId, livroId, posicao++)
      }
      r.listas++
    }

    e.livros
      .filter((l) => l.status === 'quero_ler')
      .forEach((l, i) => q.fila.run(paraIdLocal.get(l.goodreads_id), i))
  })()

  const uma = <T>(sql: string) => sqlite.prepare(sql).get() as T
  r.livros = uma<{ n: number }>('SELECT COUNT(*) n FROM livros').n
  r.lidos = uma<{ n: number }>("SELECT COUNT(*) n FROM livros WHERE status = 'lido'").n
  r.notaMedia = uma<{ m: number }>("SELECT AVG(nota) m FROM leituras WHERE status = 'lido' AND nota IS NOT NULL").m
  r.paginasLidas = uma<{ n: number }>("SELECT COALESCE(SUM(l.paginas), 0) n FROM livros l WHERE l.id IN (SELECT livro_id FROM leituras WHERE status = 'lido')").n
  r.capas = uma<{ n: number }>('SELECT COUNT(*) n FROM livros WHERE capa_arquivo IS NOT NULL').n
  return r
}

function nomeLista(nome: string): string {
  const texto = nome
    .replace(/^a-/, '')
    .replace(/-/g, ' ')
    .replace('grafic novel', 'graphic novel')
    .replace('realismo magico', 'realismo mágico')
    .replace('manga', 'mangá')
    .replace('poema', 'poesia')
  return texto[0].toUpperCase() + texto.slice(1)
}
