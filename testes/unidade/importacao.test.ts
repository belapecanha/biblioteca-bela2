import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { abrirBanco, type Banco } from '../../src/main/db/conexao'
import { datasDaLeitura, importar, normalizarNome, type LivroTratado } from '../../src/main/importacao/importar'

function livro(p: Partial<LivroTratado>): LivroTratado {
  return {
    goodreads_id: '1', titulo: 'Título (Série, #1)', titulo_original: null, serie: null, volume: null, autor: 'Autora', coautores: [],
    isbn: null, isbn13: null, editora: null, formato: 'fisico', paginas: 100, ano_edicao: null, ano_publicacao: null, status: 'lido',
    nota: 4.5, data_leitura: '2026-01-24', ano_leitura: 2026, precisao_data: 'dia', data_adicionado: '2026-01-01', tipo: 'livro',
    generos: ['Romance'], temas: ['Fake Dating'], moods: ['Cozy'], favorito: false, estantes_ano: [], resenha: null, ...p
  }
}

describe('importação', () => {
  let pasta: string
  let banco: Banco
  let entrada: Parameters<typeof importar>[1]
  const consultar = <T,>(sql: string, ...a: unknown[]) => banco.sqlite.prepare(sql).all(...a) as T[]

  beforeEach(async () => {
    pasta = mkdtempSync(join(tmpdir(), 'bela-imp-'))
    const capasAntigas = join(pasta, 'capas-antigas')
    for (const p of [capasAntigas, join(pasta, 'capas'), join(pasta, 'mini'), join(pasta, 'avulsas')]) mkdirSync(p)
    const imagem = sharp({ create: { width: 90, height: 135, channels: 3, background: '#B23A48' } }).png()
    await imagem.clone().toFile(join(capasAntigas, 'capa1.png'))
    await imagem.clone().toFile(join(pasta, 'avulsas', 'whiteblood1.png'))

    const antigo = new Database(join(pasta, 'antigo.db'))
    antigo.exec(`CREATE TABLE livros (id INTEGER PRIMARY KEY, goodreads_id TEXT, titulo TEXT, paginas INT, idioma TEXT, sinopse TEXT, isbn10 TEXT, capa_arquivo TEXT, status_atual TEXT, posse TEXT);
      CREATE TABLE editoras (id INTEGER PRIMARY KEY, nome TEXT, pais TEXT);
      CREATE TABLE autores (id INTEGER PRIMARY KEY, nome TEXT, pais TEXT);
      CREATE TABLE livro_autores (livro_id INT, autor_id INT, papel TEXT);
      CREATE TABLE estantes (id INTEGER PRIMARY KEY, nome TEXT, ordem INT);
      CREATE TABLE livro_estantes (livro_id INT, estante_id INT);
      INSERT INTO livros VALUES (1,'1','Título',NULL,'pt','Sinopse boa',NULL,'capa1.png','lido',NULL),
        (2,'2','Sem páginas',320,NULL,NULL,NULL,NULL,'lido',NULL),
        (3,'7','Coleção',NULL,NULL,NULL,NULL,'capa1.png','lido',NULL),
        (4,NULL,'A guerra dos tronos',884,NULL,NULL,NULL,NULL,'lendo','tenho'),
        (5,NULL,'Parceira',465,NULL,NULL,NULL,NULL,'lido','tenho');
      INSERT INTO estantes VALUES (1,'2026',0),(2,'a-favoritos',1);
      INSERT INTO livro_estantes VALUES (1,1),(1,2),(3,2);
      INSERT INTO autores VALUES (1,'Autora','Brasil');`)
    antigo.close()

    banco = abrirBanco(join(pasta, 'novo.db'), resolve('src/main/db/migracoes'))
    entrada = {
      livros: [],
      caminhoBancoAntigo: join(pasta, 'antigo.db'),
      pastaCapasAntigas: capasAntigas,
      pastaCapasAvulsas: join(pasta, 'avulsas'),
      pastaCapas: join(pasta, 'capas'),
      pastaMiniaturas: join(pasta, 'mini')
    }
  })

  afterEach(() => {
    banco.sqlite.close()
    rmSync(pasta, { recursive: true, force: true })
  })

  it('importa livro completo, com meia estrela, capa, miniatura e cores', async () => {
    const r = await importar(banco, { ...entrada, livros: [livro({})] })
    const [l] = consultar<Record<string, unknown>>('SELECT * FROM livros WHERE goodreads_id = ?', '1')
    expect(l.titulo).toBe('Título')
    expect(l.sinopse).toBe('Sinopse boa')
    expect(l.cor_principal).toBe('#B23A48')
    expect(existsSync(join(pasta, 'capas', l.capa_arquivo as string))).toBe(true)
    expect(existsSync(join(pasta, 'mini', l.miniatura_arquivo as string))).toBe(true)
    expect(consultar('SELECT nota, data_fim, precisao_fim FROM leituras')[0]).toEqual({ nota: 4.5, data_fim: '2026-01-24', precisao_fim: 'dia' })
    expect(consultar('SELECT COUNT(*) n FROM livro_classificacoes WHERE livro_id = ?', l.id)[0]).toEqual({ n: 3 })
    expect(consultar('SELECT pais FROM autores WHERE nome = ?', 'Autora')[0]).toEqual({ pais: 'Brasil' })
    expect(r.notaMedia).toBe(4.5)
  })

  it('traz páginas corrigidas no app antigo', async () => {
    const r = await importar(banco, { ...entrada, livros: [livro({ goodreads_id: '2', titulo: 'Sem páginas', paginas: null })] })
    expect(consultar('SELECT paginas FROM livros WHERE goodreads_id = ?', '2')[0]).toEqual({ paginas: 320 })
    expect(r.paginasDoBancoAntigo).toEqual(['Sem páginas: 320'])
  })

  it('não perde livros só do app antigo e une posse com o mesmo título', async () => {
    const r = await importar(banco, { ...entrada, livros: [livro({ goodreads_id: '9', titulo: 'Parceira' })] })
    expect(consultar('SELECT titulo, origem, status, posse, paginas FROM livros ORDER BY id')).toEqual([
      { titulo: 'Parceira', origem: 'goodreads', status: 'lido', posse: 'tenho', paginas: 100 },
      { titulo: 'A guerra dos tronos', origem: 'banco_antigo', status: 'lendo', posse: 'tenho', paginas: 884 }
    ])
    expect(r.apenasNoBancoAntigo).toEqual(['A guerra dos tronos (lendo)'])
  })

  it('transforma livro lendo com data em histórico e releitura', async () => {
    await importar(banco, { ...entrada, livros: [livro({ status: 'lendo', nota: 5, data_leitura: '2020-10-01' })] })
    expect(consultar("SELECT x.status, x.nota, x.data_fim FROM leituras x JOIN livros l ON l.id = x.livro_id WHERE l.goodreads_id = '1' ORDER BY x.id")).toEqual([
      { status: 'lido', nota: 5, data_fim: '2020-10-01' },
      { status: 'lendo', nota: null, data_fim: null }
    ])
  })

  it('usa capa da pasta avulsa só quando falta e não dá a capa da coleção aos volumes', async () => {
    const r = await importar(banco, {
      ...entrada,
      livros: [
        livro({ goodreads_id: '5', titulo: 'White Blood, vol. 1' }),
        livro({ goodreads_id: '7-1', titulo: 'Coleção, Vol. 1', paginas: 240 })
      ]
    })
    expect(r.capasDaPasta).toEqual(['White Blood, vol. 1'])
    expect(consultar('SELECT goodreads_id, capa_arquivo IS NOT NULL c, paginas_estimadas e FROM livros WHERE goodreads_id IS NOT NULL ORDER BY id')).toEqual([
      { goodreads_id: '5', c: 1, e: 0 },
      { goodreads_id: '7-1', c: 0, e: 1 }
    ])
  })

  it('leva listas para os volumes, sem as estantes de ano', async () => {
    await importar(banco, { ...entrada, livros: [livro({}), livro({ goodreads_id: '7-1', titulo: 'V1' }), livro({ goodreads_id: '7-2', titulo: 'V2' })] })
    expect(consultar('SELECT nome FROM listas')).toEqual([{ nome: 'Favoritos' }])
    expect(consultar('SELECT COUNT(*) n FROM lista_livros')[0]).toEqual({ n: 3 })
  })

  it('não guarda dia inventado e resolve conflito pela estante de ano', () => {
    expect(datasDaLeitura(livro({ precisao_data: 'ano_provavel', data_leitura: '2017-01-01', ano_leitura: 2017, estantes_ano: ['2021'] }))).toEqual({ dataFim: null, anoFim: 2021, precisaoFim: 'ano' })
    expect(datasDaLeitura(livro({ precisao_data: 'ano_da_estante', data_leitura: null, ano_leitura: 2023, estantes_ano: ['2023'] }))).toEqual({ dataFim: null, anoFim: 2023, precisaoFim: 'ano' })
  })

  it('compara nomes sem acento, pontuação e a palavra volume', () => {
    expect(normalizarNome('White Blood, vol. 1')).toBe('whiteblood1')
    expect(normalizarNome('Úrsula')).toBe('ursula')
  })
})
