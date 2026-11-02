import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { abrirBanco, type Banco } from '../../src/main/db/conexao'
import { definirClassificacoes, definirNota, definirPosse, definirStatus, listarLivros, obterLivro } from '../../src/main/livros'

describe('operações de livros', () => {
  let pasta: string
  let banco: Banco
  let id: number

  beforeEach(() => {
    pasta = mkdtempSync(join(tmpdir(), 'bela-livros-'))
    banco = abrirBanco(join(pasta, 't.db'), resolve('src/main/db/migracoes'))
    id = Number(banco.sqlite.prepare("INSERT INTO livros (titulo, status) VALUES ('Livro', 'quero_ler')").run().lastInsertRowid)
    const autor = banco.sqlite.prepare("INSERT INTO autores (nome) VALUES ('Autora')").run().lastInsertRowid
    banco.sqlite.prepare('INSERT INTO livro_autores (livro_id, autor_id) VALUES (?, ?)').run(id, autor)
  })

  afterEach(() => {
    banco.sqlite.close()
    rmSync(pasta, { recursive: true, force: true })
  })

  const leituras = () => obterLivro(banco, id)!.leituras

  it('lista com autor, nota e ano da leitura', () => {
    definirStatus(banco, id, 'lido')
    definirNota(banco, id, 4.5)
    banco.sqlite.prepare("UPDATE leituras SET ano_fim = 2021, precisao_fim = 'ano' WHERE livro_id = ?").run(id)
    expect(listarLivros(banco)[0]).toMatchObject({ autores: [{ nome: 'Autora' }], nota: 4.5, anoLido: 2021, status: 'lido' })
  })

  it('recusa nota inválida e nota sem leitura', () => {
    expect(() => definirNota(banco, id, 4)).toThrow('Registre uma leitura')
    definirStatus(banco, id, 'lido')
    expect(() => definirNota(banco, id, 4.2)).toThrow('Nota inválida')
    definirNota(banco, id, null)
  })

  it('terminar uma leitura aberta grava a data de hoje', () => {
    definirStatus(banco, id, 'lendo')
    definirStatus(banco, id, 'lido', '2026-11-01')
    expect(leituras()).toMatchObject([{ status: 'lido', dataFim: '2026-11-01', anoFim: 2026, precisaoFim: 'dia' }])
  })

  it('não duplica leitura nem apaga histórico ao voltar para quero ler', () => {
    definirStatus(banco, id, 'lido')
    definirNota(banco, id, 5)
    definirStatus(banco, id, 'lido')
    expect(leituras()).toHaveLength(1)
    definirStatus(banco, id, 'lendo')
    definirStatus(banco, id, 'quero_ler')
    expect(leituras()).toMatchObject([{ status: 'lido', nota: 5 }])
  })

  it('mantém a fila da meta em dia com o status', () => {
    const fila = () => banco.sqlite.prepare('SELECT COUNT(*) n FROM fila_meta').get()
    definirStatus(banco, id, 'quero_ler')
    expect(fila()).toEqual({ n: 1 })
    definirStatus(banco, id, 'lendo')
    expect(fila()).toEqual({ n: 0 })
  })

  it('define posse em lote e recusa valor inválido', () => {
    definirPosse(banco, [id], 'tenho')
    expect(listarLivros(banco)[0].posse).toBe('tenho')
    expect(() => definirPosse(banco, [id], 'x' as never)).toThrow()
  })

  it('troca só a classificação do tipo pedido e recusa nomes fora da lista', () => {
    definirClassificacoes(banco, id, 'genero', ['Romance', 'Fantasia'])
    definirClassificacoes(banco, id, 'mood', ['Cozy'])
    definirClassificacoes(banco, id, 'genero', ['Drama'])
    expect(listarLivros(banco)[0]).toMatchObject({ generos: ['Drama'], moods: ['Cozy'] })
    expect(() => definirClassificacoes(banco, id, 'genero', ['Poesia'])).toThrow()
  })
})
