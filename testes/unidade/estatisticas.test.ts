import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { LeituraAnalise, LivroAnalise } from '../../src/shared/api'
import { calcular, cartoesRetrospectiva, filtrar, metaDoAno, mudeiDeIdeia, tempoNaFila, variarSeries } from '../../src/shared/estatisticas'
import { abrirBanco, type Banco } from '../../src/main/db/conexao'
import { baseAnalise, definirMeta } from '../../src/main/analise'

let proximo = 1
function leitura(campos: Partial<LeituraAnalise> = {}): LeituraAnalise {
  return { id: proximo++, formato: null, ano: 2025, data: '2025-03-10', precisao: 'dia', nota: 4, temResenha: false, ...campos }
}
function livro(campos: Partial<LivroAnalise> = {}): LivroAnalise {
  const id = proximo++
  return {
    id, titulo: `Livro ${id}`, tituloOriginal: null, autores: [{ id: 1, nome: 'Autora' }], editora: null, paisEditora: 'Brasil', serie: null, volume: null, tipo: 'livro', formato: 'fisico', paginas: 100, paginasEstimadas: false,
    status: 'lido', posse: null, favorito: false, nota: 4, anoLido: 2025, dataLida: null, capa: null, miniatura: null, corPrincipal: null, corTexto: null, generos: ['Romance'], temas: [], moods: ['Leve'],
    anoPublicacao: 2015, pais: 'Brasil', cor1: null, cor2: null, origem: 'goodreads', criadoEm: '2020-01-01 00:00:00', primeiroInicio: null, leituras: [leitura()], ...campos
  }
}
const hoje = new Date(2026, 10, 2)

describe('estatísticas', () => {
  it('conta a releitura nas páginas do ano dela, mas o livro uma vez só', () => {
    const relido = livro({ leituras: [leitura({ ano: 2024, data: '2024-01-05', nota: 3 }), leitura({ ano: 2025, nota: 5 })] })
    const S = calcular(filtrar([relido, livro()], {}), null, hoje)
    expect(S.n).toBe(2)
    expect(S.leituras).toBe(3)
    expect(S.paginas).toBe(300)
    expect(S.porAno.get(2024)).toEqual({ livros: 1, paginas: 100 })
    expect(S.porAno.get(2025)).toEqual({ livros: 2, paginas: 200 })
    expect(S.cinco).toEqual([relido])
    expect(calcular(filtrar([relido], {}), 2024, hoje).media).toBe(3)
    expect(mudeiDeIdeia([relido, livro()])).toEqual([relido])
  })

  it('mantém datas aproximadas no ano, fora dos meses e do ritmo sem ano', () => {
    const S = calcular(filtrar([livro({ leituras: [leitura({ data: null, precisao: 'ano' })] }), livro({ leituras: [leitura({ ano: null, data: null, precisao: null })] })], {}), null, hoje)
    expect(S.n).toBe(2)
    expect(S.exatos).toBe(0)
    expect(S.livrosPorAno).toBe(1)
  })

  it('combina filtros de livro e de leitura', () => {
    const fisico = livro({ generos: ['Fantasia'] })
    const ebook = livro({ leituras: [leitura({ formato: 'ebook', data: '2025-07-01', nota: 2 })] })
    const semStatus = livro({ status: 'quero_ler', leituras: [] })
    const todos = [fisico, ebook, semStatus]
    expect(filtrar(todos, { genero: 'Fantasia' }).livros).toEqual([fisico])
    expect(filtrar(todos, { formato: 'ebook' }).livros).toEqual([ebook])
    expect(filtrar(todos, { mes: '7', nota: '2' }).entradas.map((e) => e.livro)).toEqual([ebook])
    expect(filtrar(todos, { mes: '7', genero: 'Fantasia' }).entradas).toEqual([])
    expect(filtrar(todos, { status: 'quero_ler' }).livros).toEqual([semStatus])
    expect(filtrar(todos, { classe: 'sim' }).livros.length).toBe(3)
    expect(filtrar(todos, { decada: '2010' }).livros.length).toBe(3)
  })

  it('usa os dias passados no ano atual e o ano inteiro nos anteriores', () => {
    const atual = calcular(filtrar([livro({ leituras: [leitura({ ano: 2026, data: '2026-01-10' })] })], {}), 2026, hoje)
    expect(atual.dias).toBe(306)
    expect(calcular(filtrar([livro()], {}), 2024, hoje).dias).toBe(366)
    expect(metaDoAno([livro({ leituras: [leitura({ ano: 2026 })] })], 2026, hoje)).toEqual({ lidos: 1, previsao: 1, diasRestantes: 59 })
  })

  it('junta coautores da mesma obra e não repete a série no ranking', () => {
    const serie = (id: number, nome: string) => ({ serie: { id, nome } })
    const arte = { id: 2, nome: 'Arte' }
    const roteiro = { id: 3, nome: 'Roteiro' }
    const outra = { id: 4, nome: 'Outra' }
    const a = [livro({ ...serie(1, 'A'), autores: [roteiro, arte] }), livro({ ...serie(1, 'A'), autores: [roteiro, arte] })]
    const parcial = livro({ ...serie(1, 'A'), autores: [outra] })
    const solta = livro({ autores: [{ id: 5, nome: 'Solta' }] })
    const S = calcular(filtrar([...a, parcial, solta], {}), null, hoje)
    expect(S.autoresTotal).toBe(4)
    expect(S.autores[0].nome).toBe('Roteiro e Arte')
    expect(S.autores[0].notas).toHaveLength(2)
    expect(S.autoresVariados.map((x) => x.nome)).toEqual(['Roteiro e Arte', 'Solta'])
    expect(variarSeries([...a, solta]).map((l) => l.id)).toEqual([a[0].id, solta.id, a[1].id])
  })

  it('só mede a fila dos livros cadastrados à mão', () => {
    expect(tempoNaFila([livro({ primeiroInicio: '2025-01-01' })])).toBeNull()
    const manuais = [livro({ origem: 'manual', criadoEm: '2025-01-01 10:00:00', primeiroInicio: '2025-01-11' }), livro({ origem: 'manual', criadoEm: '2025-01-01 10:00:00', primeiroInicio: '2025-01-31' })]
    expect(tempoNaFila(manuais)).toEqual({ n: 2, media: 20, menor: 10, maior: 30 })
  })

  it('não inventa conteúdo em um ano sem notas, datas ou páginas', () => {
    const S = calcular(filtrar([livro({ paginas: null, generos: [], autores: [], moods: [], leituras: [leitura({ data: null, precisao: 'ano', nota: null })] })], {}), 2025, hoje)
    const c = cartoesRetrospectiva(S, calcular(filtrar([], {}), 2024, hoje), 2025)
    expect(c).toHaveLength(10)
    expect(c.map((x) => x.grande)).toEqual(['1 livro', '0', 'Sem data', 'Sem notas', 'Sem gênero', 'Sem tema', 'Sem mood', 'Sem autoria', '0 com 5 estrelas', 'Sem páginas'])
  })
})

describe('base de análise no banco', () => {
  let pasta: string
  let banco: Banco
  beforeEach(() => {
    pasta = mkdtempSync(join(tmpdir(), 'bela-analise-'))
    banco = abrirBanco(join(pasta, 't.db'), resolve('src/main/db/migracoes'))
  })
  afterEach(() => {
    banco.sqlite.close()
    rmSync(pasta, { recursive: true, force: true })
  })

  it('traz só leituras concluídas, com o ano vindo da data quando preciso', () => {
    const id = Number(banco.sqlite.prepare("INSERT INTO livros (titulo, status, ano_publicacao) VALUES ('Livro', 'lido', 1999)").run().lastInsertRowid)
    banco.sqlite.prepare("INSERT INTO leituras (livro_id, status, data_fim, precisao_fim, nota, resenha) VALUES (?, 'lido', '2024-05-02', 'dia', 4.5, 'Boa')").run(id)
    banco.sqlite.prepare("INSERT INTO leituras (livro_id, status, data_inicio) VALUES (?, 'lendo', '2025-01-01')").run(id)
    const [l] = baseAnalise(banco).livros
    expect(l.leituras).toHaveLength(1)
    expect(l.leituras[0]).toMatchObject({ ano: 2024, nota: 4.5, temResenha: true })
    expect(l.primeiroInicio).toBe('2025-01-01')
  })

  it('grava, troca e remove a meta do ano', () => {
    definirMeta(banco, 2026, 20)
    definirMeta(banco, 2026, 30)
    expect(baseAnalise(banco).metas).toEqual({ 2026: 30 })
    expect(() => definirMeta(banco, 2026, 0)).toThrow('número inválido')
    definirMeta(banco, 2026, null)
    expect(baseAnalise(banco).metas).toEqual({})
  })
})

const real = join(process.env.APPDATA ?? '', 'biblioteca-bela', 'biblioteca.db')
describe.skipIf(!existsSync(real))('com uma cópia da biblioteca real', () => {
  let pasta: string
  let banco: Banco
  beforeEach(() => {
    pasta = mkdtempSync(join(tmpdir(), 'bela-analise-real-'))
    for (const sufixo of ['', '-wal']) if (existsSync(real + sufixo)) copyFileSync(real + sufixo, join(pasta, `t.db${sufixo}`))
    banco = abrirBanco(join(pasta, 't.db'), resolve('src/main/db/migracoes'))
  })
  afterEach(() => {
    banco.sqlite.close()
    rmSync(pasta, { recursive: true, force: true })
  })

  it('confere os totais contra consultas diretas ao banco', () => {
    const { sqlite } = banco
    const valor = (consulta: string) => (sqlite.prepare(consulta).get() as { v: number }).v
    const S = calcular(filtrar(baseAnalise(banco).livros, {}), null)
    expect(S.n).toBe(valor("SELECT COUNT(DISTINCT livro_id) AS v FROM leituras WHERE status = 'lido'"))
    expect(valor("SELECT COUNT(*) AS v FROM livros l WHERE l.status = 'lido' AND NOT EXISTS (SELECT 1 FROM leituras x WHERE x.livro_id = l.id AND x.status = 'lido')")).toBe(0)
    expect(S.paginas).toBe(valor("SELECT COALESCE(SUM(l.paginas), 0) AS v FROM leituras x JOIN livros l ON l.id = x.livro_id WHERE x.status = 'lido'"))
    expect(S.media).toBeCloseTo(valor("SELECT AVG(nota) AS v FROM leituras WHERE status = 'lido' AND nota IS NOT NULL"), 8)
    expect(S.autoresTotal).toBe(valor("SELECT COUNT(DISTINCT a.autor_id) AS v FROM livro_autores a JOIN leituras x ON x.livro_id = a.livro_id WHERE a.papel = 'autor' AND x.status = 'lido'"))
    expect(S.exatos).toBe(valor("SELECT COUNT(*) AS v FROM leituras WHERE status = 'lido' AND precisao_fim = 'dia'"))
    const anos = [...S.porAno.values()].reduce((s, a) => s + a.livros, 0)
    expect(anos).toBe(valor("SELECT COUNT(*) AS v FROM leituras WHERE status = 'lido' AND precisao_fim IS NOT NULL"))
  })
})
