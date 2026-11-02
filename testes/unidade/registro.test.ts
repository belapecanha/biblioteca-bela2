import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DadosLeitura, DadosLivro } from '../../src/shared/api'
import { abrirBanco, type Banco } from '../../src/main/db/conexao'
import { encontrarDuplicados, salvarDadosLivro } from '../../src/main/registro'
import { diario, removerCitacao, removerProgresso, salvarCitacao, salvarLeitura, salvarProgresso } from '../../src/main/leituras'
import { definirNota, obterLivro } from '../../src/main/livros'
import { salvarRegistro } from '../../src/main/registro-capas'
import { anosDoDiario, eventosDoMes, resumoDoMes } from '../../src/shared/diario'

const dadosLivro = (extras: Partial<DadosLivro> = {}): DadosLivro => ({
  titulo: 'Um livro', tituloOriginal: null, colaboradores: [{ nome: 'Autora', pais: 'Brasil', papel: 'autor' }],
  isbn10: null, isbn13: '9788535914849', editora: 'Editora', paisEditora: 'Brasil', serie: null, volume: null,
  tipo: 'livro', formato: 'fisico', paginas: 200, paginasEstimadas: false, anoEdicao: 2020, anoPublicacao: 2010,
  idioma: 'pt', sinopse: 'Sinopse', posse: 'tenho', status: 'quero_ler', generos: ['Fantasia'], temas: [], moods: ['Cozy'], notasPrivadas: 'Minha nota', ...extras
})
const leitura = (livroId: number, extras: Partial<DadosLeitura> = {}): DadosLeitura => ({
  livroId, status: 'lido', formato: 'fisico', dataInicio: '2026-01-01', dataFim: '2026-01-20', anoFim: 2026, precisaoFim: 'dia', nota: 4.5, resenha: 'Minha resenha', ...extras
})
describe('registro e leituras', () => {
  let pasta: string
  let banco: Banco
  beforeEach(() => { pasta = mkdtempSync(join(tmpdir(), 'bela-registro-')); banco = abrirBanco(join(pasta, 'b.db'), resolve('src/main/db/migracoes')) })
  afterEach(() => { banco.sqlite.close(); rmSync(pasta, { recursive: true, force: true }) })

  it('salva e edita obra, colaboradores, edição e classificação sem perder o histórico', () => {
    const id = salvarDadosLivro(banco, dadosLivro())
    const l = salvarLeitura(banco, leitura(id))
    salvarDadosLivro(banco, dadosLivro({ id, titulo: 'Outro título', status: 'lido', colaboradores: [{ nome: 'Autora', pais: 'Brasil', papel: 'autor' }, { nome: 'Tradutora', pais: null, papel: 'tradutor' }], moods: ['Dark'] }))
    expect(obterLivro(banco, id)).toMatchObject({ titulo: 'Outro título', paisEditora: 'Brasil', notasPrivadas: 'Minha nota', autores: [{ nome: 'Autora' }], colaboradores: [{ nome: 'Autora' }, { nome: 'Tradutora' }], leituras: [{ id: l, nota: 4.5 }], moods: ['Dark'] })
  })
  it('avisa sobre ISBN ou título e autor equivalentes antes de criar um duplicado', async () => {
    salvarDadosLivro(banco, dadosLivro())
    const repetido = await salvarRegistro(banco, pasta, dadosLivro({ titulo: 'Outra edição' }))
    expect(repetido.duplicados).toHaveLength(1)
    expect(banco.sqlite.prepare('SELECT COUNT(*) n FROM livros').get()).toEqual({ n: 1 })
    expect(encontrarDuplicados(banco, dadosLivro({ titulo: 'UM LÍVRO', isbn13: null }))).toHaveLength(1)
    expect(await salvarRegistro(banco, pasta, dadosLivro(), true)).toHaveProperty('id')
  })
  it('não grava um livro se a capa ou a classificação forem inválidas', async () => {
    await expect(salvarRegistro(banco, pasta, dadosLivro(), false, { bytes: [1, 2, 3] })).rejects.toThrow('Imagem inválida')
    expect(() => salvarDadosLivro(banco, dadosLivro({ generos: ['Inventado'] }))).toThrow('Classificação inválida')
    expect(banco.sqlite.prepare('SELECT COUNT(*) n FROM livros').get()).toEqual({ n: 0 })
  })
  it('salva a primeira leitura junto com o livro e reverte tudo se a data for inválida', async () => {
    const primeira = { status: 'lido' as const, formato: 'fisico' as const, dataInicio: null, dataFim: '2025-05-30', anoFim: 2025, precisaoFim: 'dia' as const, nota: 4, resenha: 'Primeira impressão' }
    await expect(salvarRegistro(banco, pasta, dadosLivro({ status: 'lido', leituraInicial: { ...primeira, dataFim: '2025-02-30' } }))).rejects.toThrow('Data inválida')
    expect(banco.sqlite.prepare('SELECT COUNT(*) n FROM livros').get()).toEqual({ n: 0 })
    const resultado = await salvarRegistro(banco, pasta, dadosLivro({ status: 'lido', leituraInicial: primeira }))
    expect(obterLivro(banco, resultado.id!)).toMatchObject({ leituras: [{ nota: 4, dataFim: '2025-05-30', resenha: 'Primeira impressão' }] })
    expect(obterLivro(banco, resultado.id!)?.leituras).toHaveLength(1)
  })
  it('preserva notas independentes nas releituras e corrige datas anteriores', () => {
    const id = salvarDadosLivro(banco, dadosLivro())
    const primeira = salvarLeitura(banco, leitura(id))
    const segunda = salvarLeitura(banco, leitura(id, { status: 'lendo', dataInicio: '2026-03-01', dataFim: null, anoFim: null, precisaoFim: null, nota: null, resenha: null }))
    expect(obterLivro(banco, id)?.nota).toBeNull()
    definirNota(banco, id, 3)
    salvarLeitura(banco, leitura(id, { id: primeira, dataFim: null, precisaoFim: 'ano', anoFim: 2025, dataInicio: null }))
    expect(obterLivro(banco, id)).toMatchObject({ status: 'lendo', nota: 3, leituras: [{ id: segunda, nota: 3 }, { id: primeira, nota: 4.5, anoFim: 2025, dataFim: null }] })
    expect(() => salvarLeitura(banco, leitura(id))).toThrow('leitura em andamento')
  })
  it('valida datas reais, ordem, nota e vínculo da leitura com o livro', () => {
    const id = salvarDadosLivro(banco, dadosLivro())
    expect(() => salvarLeitura(banco, leitura(id, { dataFim: '2026-02-30' }))).toThrow('Data inválida')
    expect(() => salvarLeitura(banco, leitura(id, { dataInicio: '2026-02-01' }))).toThrow('antes do início')
    expect(() => salvarLeitura(banco, leitura(id, { nota: 4.2 }))).toThrow('meia estrela')
    const lid = salvarLeitura(banco, leitura(id))
    const outro = salvarDadosLivro(banco, dadosLivro({ titulo: 'Outro', isbn13: null }))
    expect(() => salvarLeitura(banco, leitura(outro, { id: lid }))).toThrow('neste livro')
  })
  it('corrige o progresso na mesma data sem duplicar e valida página e período', () => {
    const id = salvarDadosLivro(banco, dadosLivro())
    const lid = salvarLeitura(banco, leitura(id))
    salvarProgresso(banco, id, lid, '2026-01-10', 60)
    salvarProgresso(banco, id, lid, '2026-01-10', 70)
    expect(obterLivro(banco, id)?.progresso).toMatchObject([{ pagina: 70 }])
    expect(() => salvarProgresso(banco, id, lid, '2026-01-10', 201)).toThrow('ultrapassa')
    expect(() => salvarProgresso(banco, id, lid, '2026-01-21', 100)).toThrow('entre o início e o fim')
    expect(() => salvarLeitura(banco, leitura(id, { id: lid, dataFim: '2026-01-05' }))).toThrow('progresso fora dessas datas')
    removerProgresso(banco, id, obterLivro(banco, id)!.progresso[0].id)
    expect(obterLivro(banco, id)?.progresso).toEqual([])
  })
  it('edita citações sem permitir alterar as de outro livro', () => {
    const id = salvarDadosLivro(banco, dadosLivro())
    const outro = salvarDadosLivro(banco, dadosLivro({ titulo: 'Outro', isbn13: null }))
    salvarCitacao(banco, id, { texto: 'Trecho', pagina: 10 })
    const cid = obterLivro(banco, id)!.citacoes[0].id
    expect(() => removerCitacao(banco, outro, cid)).toThrow('neste livro')
    salvarCitacao(banco, id, { id: cid, texto: 'Trecho corrigido', pagina: null })
    expect(obterLivro(banco, id)?.citacoes).toMatchObject([{ texto: 'Trecho corrigido', pagina: null }])
    removerCitacao(banco, id, cid)
    expect(obterLivro(banco, id)?.citacoes).toEqual([])
  })
  it('não inventa dia ou mês para leituras com somente o ano e calcula páginas sem duplicar', () => {
    const id = salvarDadosLivro(banco, dadosLivro())
    salvarLeitura(banco, leitura(id, { dataInicio: null, dataFim: null, precisaoFim: 'ano', anoFim: 2022 }))
    const lid = salvarLeitura(banco, leitura(id, { dataInicio: '2026-01-01', dataFim: '2026-02-05' }))
    salvarProgresso(banco, id, lid, '2026-01-20', 50)
    salvarProgresso(banco, id, lid, '2026-02-03', 120)
    const dados = diario(banco)
    expect(anosDoDiario(dados, 2026)).toEqual([2022, 2026])
    expect(eventosDoMes(dados, 2022, 1)).toEqual([])
    expect(resumoDoMes(dados, 2026, 1)).toMatchObject({ concluidas: 0, paginas: 50 })
    expect(resumoDoMes(dados, 2026, 2)).toMatchObject({ concluidas: 1, paginas: 150, notaMedia: 4.5 })
  })
})
