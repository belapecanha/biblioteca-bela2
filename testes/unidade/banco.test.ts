import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { abrirBanco, type Banco } from '../../src/main/db/conexao'

const migracoes = resolve('src/main/db/migracoes')

describe('banco', () => {
  let pasta: string
  let banco: Banco

  beforeEach(() => {
    pasta = mkdtempSync(join(tmpdir(), 'bela-'))
    banco = abrirBanco(join(pasta, 'teste.db'), migracoes)
  })

  afterEach(() => {
    banco.sqlite.close()
    rmSync(pasta, { recursive: true, force: true })
  })

  const livro = () =>
    banco.sqlite.prepare("INSERT INTO livros (titulo) VALUES ('Teste')").run().lastInsertRowid
  const leitura = (livroId: number | bigint, nota: number) =>
    banco.sqlite
      .prepare("INSERT INTO leituras (livro_id, status, nota) VALUES (?, 'lido', ?)")
      .run(livroId, nota)

  it('cria as listas fixas e não duplica ao reabrir', () => {
    banco.sqlite.close()
    banco = abrirBanco(join(pasta, 'teste.db'), migracoes)
    const linhas = banco.sqlite
      .prepare('SELECT tipo, COUNT(*) AS n FROM classificacoes GROUP BY tipo ORDER BY tipo')
      .all()
    expect(linhas).toEqual([
      { tipo: 'genero', n: 20 },
      { tipo: 'mood', n: 20 },
      { tipo: 'tema', n: 17 }
    ])
  })

  it('aceita meia estrela e recusa notas inválidas', () => {
    const id = livro()
    expect(() => leitura(id, 4.5)).not.toThrow()
    expect(() => leitura(id, 4.3)).toThrow()
    expect(() => leitura(id, 0)).toThrow()
    expect(() => leitura(id, 5.5)).toThrow()
  })

  it('exige coerência na precisão da data', () => {
    const id = livro()
    const inserir = banco.sqlite.prepare(
      "INSERT INTO leituras (livro_id, status, data_fim, ano_fim, precisao_fim) VALUES (?, 'lido', ?, ?, ?)"
    )
    expect(() => inserir.run(id, '2026-01-24', 2026, 'dia')).not.toThrow()
    expect(() => inserir.run(id, null, 2021, 'ano')).not.toThrow()
    expect(() => inserir.run(id, '2021-01-01', 2021, 'ano')).toThrow()
    expect(() => inserir.run(id, null, 2021, 'dia')).toThrow()
  })

  it('apaga leituras junto com o livro', () => {
    const id = livro()
    leitura(id, 4)
    banco.sqlite.prepare('DELETE FROM livros WHERE id = ?').run(id)
    expect(banco.sqlite.prepare('SELECT COUNT(*) AS n FROM leituras').get()).toEqual({ n: 0 })
  })

  it('limita favoritos a quatro posições únicas', () => {
    const inserir = banco.sqlite.prepare("INSERT INTO livros (titulo, favorito_posicao) VALUES ('X', ?)")
    expect(() => inserir.run(1)).not.toThrow()
    expect(() => inserir.run(1)).toThrow()
    expect(() => inserir.run(5)).toThrow()
  })
})
