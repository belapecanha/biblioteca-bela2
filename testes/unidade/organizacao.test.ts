import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import sharp from 'sharp'
import type { DadosLivro } from '../../src/shared/api'
import { abrirBanco, type Banco } from '../../src/main/db/conexao'
import { salvarDadosLivro } from '../../src/main/registro'
import { salvarLeitura } from '../../src/main/leituras'
import { obterLivro } from '../../src/main/livros'
import { adicionarNaLista, dadosPerfil, definirFavoritos, definirFila, excluirLista, obterLista, ordenarLista, painelPerfil, pendenciasDados, salvarLista, salvarPerfil } from '../../src/main/organizacao'
import { criarBackup, prepararBackup, restaurarBackup } from '../../src/main/backup'
import { exportarCsv, lerCsv, prepararCsv } from '../../src/main/csv'
import { servicoArquivos } from '../../src/main/arquivos'

function livro(titulo: string, extras: Partial<DadosLivro> = {}): DadosLivro {
  return { titulo, tituloOriginal: null, colaboradores: [{ nome: 'Autora', pais: null, papel: 'autor' }], isbn10: null, isbn13: null, editora: null, paisEditora: null, serie: null, volume: null, tipo: 'livro', formato: null, paginas: 200, paginasEstimadas: false, anoEdicao: null, anoPublicacao: null, idioma: null, sinopse: null, posse: null, status: 'quero_ler', generos: [], temas: [], moods: [], notasPrivadas: null, ...extras }
}
describe('organização da biblioteca', () => {
  let raiz: string, pasta: string, banco: Banco
  beforeEach(() => { raiz = mkdtempSync(join(tmpdir(), 'bela-organizacao-')); pasta = join(raiz, 'dados'); mkdirSync(pasta); banco = abrirBanco(join(pasta, 'biblioteca.db'), resolve('src/main/db/migracoes')) })
  afterEach(() => { banco.sqlite.close(); rmSync(raiz, { recursive: true, force: true, maxRetries: 3 }) })
  const criar = (nome: string, extras: Partial<DadosLivro> = {}) => salvarDadosLivro(banco, livro(nome, extras))

  it('limita os favoritos a quatro, preserva a ordem e desfaz uma seleção inválida', () => {
    const ids = ['A', 'B', 'C', 'D', 'E'].map((n) => criar(n))
    definirFavoritos(banco, [ids[2], ids[0], ids[1], ids[3]])
    expect(painelPerfil(banco, 2026).favoritos.map((l) => l.titulo)).toEqual(['C', 'A', 'B', 'D'])
    expect(() => definirFavoritos(banco, ids)).toThrow('Seleção inválida')
    expect(() => definirFavoritos(banco, [ids[0], ids[0]])).toThrow('repetidos')
    expect(() => definirFavoritos(banco, [9999])).toThrow('não existe')
    expect(painelPerfil(banco, 2026).favoritos).toHaveLength(4)
  })
  it('organiza a fila e recusa livros que já estão em andamento', () => {
    const a = criar('A'), b = criar('B'), c = criar('C', { status: 'lendo' })
    definirFila(banco, [b, a])
    expect(painelPerfil(banco, 2026).fila.map((l) => l.id)).toEqual([b, a])
    expect(() => definirFila(banco, [c])).toThrow('Quero ler')
    expect(painelPerfil(banco, 2026).fila.map((l) => l.id)).toEqual([b, a])
  })
  it('reordena listas sem duplicar membros e exclui somente a lista', () => {
    const a = criar('A'), b = criar('B')
    const id = salvarLista(banco, { nome: 'Minha ordem', descricao: 'Descrição', ordenada: true })
    adicionarNaLista(banco, id, [a, b]); adicionarNaLista(banco, id, [a])
    ordenarLista(banco, id, [b, a])
    expect(obterLista(banco, id)?.livros.map((l) => l.id)).toEqual([b, a])
    expect(() => ordenarLista(banco, id, [a])).toThrow('A lista mudou')
    salvarLista(banco, { id, nome: 'Minha ordem', descricao: null, ordenada: false })
    expect(obterLista(banco, id)?.livros.map((l) => l.id)).toEqual([a, b])
    expect(() => ordenarLista(banco, id, [b, a])).toThrow('Ordenada')
    excluirLista(banco, id)
    expect(obterLista(banco, id)).toBeNull(); expect(obterLivro(banco, a)).not.toBeNull()
  })
  it('não grava o perfil parcialmente quando uma imagem é inválida', async () => {
    await salvarPerfil(banco, pasta, { nome: 'Bela', frase: 'Leitora' })
    await expect(salvarPerfil(banco, pasta, { nome: 'Novo', frase: '', foto: [1, 2, 3] })).rejects.toThrow('Imagem inválida')
    expect(dadosPerfil(banco)).toMatchObject({ nome: 'Bela', frase: 'Leitora', foto: null })
  })
  it('inclui livros sendo relidos nos lidos e distingue as leituras de cada ano', () => {
    const id = criar('Relido')
    salvarLeitura(banco, { livroId: id, status: 'lido', formato: null, dataInicio: null, dataFim: null, anoFim: 2025, precisaoFim: 'ano', nota: 4, resenha: null })
    salvarLeitura(banco, { livroId: id, status: 'lendo', formato: null, dataInicio: '2026-01-01', dataFim: null, anoFim: null, precisaoFim: null, nota: null, resenha: null })
    const painel = painelPerfil(banco, 2026)
    expect(painel.numeros).toMatchObject({ lidos: 1, noAno: 0, paginas: 200 })
    expect(painel.lendo).toHaveLength(1); expect(painel.atividade[0]).toMatchObject({ data: null, ano: 2025, nota: 4 })
  })
  it('mostra pendências verdadeiras e percebe imagens ausentes no disco', () => {
    const id = criar('Sem dados', { paginas: null })
    banco.sqlite.prepare("UPDATE livros SET capa_arquivo = 'ausente.webp' WHERE id = ?").run(id)
    const pendencias = pendenciasDados(banco, pasta)
    expect(pendencias.find((p) => p.codigo === 'capa')?.livros.map((l) => l.id)).toEqual([id])
    expect(pendencias.find((p) => p.codigo === 'paginas')?.livros).toHaveLength(1)
  })
  it('separa séries iniciadas das que ainda estão somente em Quero ler', () => {
    const id = criar('Volume 1', { serie: 'Trilogia', volume: 1 })
    criar('Volume 2', { serie: 'Trilogia', volume: 2 })
    expect(painelPerfil(banco, 2026).series).toEqual([])
    salvarLeitura(banco, { livroId: id, status: 'lido', formato: null, dataInicio: null, dataFim: null, anoFim: 2025, precisaoFim: 'ano', nota: 4, resenha: null })
    expect(painelPerfil(banco, 2026).series).toMatchObject([{ nome: 'Trilogia', lidos: 1, cadastrados: 2 }])
  })
  it('lê CSV com vírgulas, aspas, quebras de linha e meia estrela, sem gravar na prévia', () => {
    const csv = 'Title,Author,Exclusive Shelf,My Rating,Date Read,My Review\r\n"Livro, novo",Autora,read,4.5,2025/02/10,"Uma frase\ncom ""aspas""."'
    const plano = prepararCsv(banco, csv)
    expect(plano.dados).toHaveLength(1)
    expect(plano.dados[0].leituraInicial).toMatchObject({ nota: 4.5, dataFim: '2025-02-10', resenha: 'Uma frase\ncom "aspas".' })
    expect(painelPerfil(banco, 2026).numeros.lidos).toBe(0)
    expect(() => lerCsv('Title,Author\n"Sem fim')).toThrow('aspas')
  })
  it('importa novos livros com backup e não altera resenha ou notas dos repetidos', async () => {
    const id = criar('Existente', { notasPrivadas: 'Não sobrescrever' })
    const servico = servicoArquivos(banco, pasta)
    try {
      const plano = servico.prepararCsv('Title,Author,Exclusive Shelf,My Rating,Date Read\nExistente,Autora,read,1,2020/01/01\nNovo,Autora,read,4.5,2025/01/02\n,Autora,read,4,2025/01/01')
      expect(plano).toMatchObject({ novos: 1, repetidos: 1, invalidos: 1 })
      const resultado = await servico.importarCsv(plano.token)
      expect(resultado).toMatchObject({ adicionados: 1, ignorados: 2 }); expect(existsSync(resultado.backup)).toBe(true)
      expect(obterLivro(banco, id)).toMatchObject({ notasPrivadas: 'Não sobrescrever', leituras: [] })
      await expect(servico.importarCsv(plano.token)).rejects.toThrow('expirou')
    } finally { servico.fechar() }
  })
  it('exporta releituras em linhas separadas e neutraliza fórmulas de planilha', () => {
    const id = criar('=SUM(1)', { notasPrivadas: '@nota' })
    salvarLeitura(banco, { livroId: id, status: 'lido', formato: null, dataInicio: null, dataFim: null, anoFim: 2025, precisaoFim: 'ano', nota: 4.5, resenha: 'Texto' })
    const linhas = lerCsv(exportarCsv(banco))
    expect(linhas[1][0]).toBe("'=SUM(1)"); expect(linhas[1].at(-1)).toBe("'@nota")
  })
  it('restaura banco com WAL, perfil, listas e imagens na conexão atual e preserva o .env', async () => {
    banco.sqlite.pragma('wal_autocheckpoint = 0')
    const id = criar('Original', { notasPrivadas: 'Nota privada' })
    const lista = salvarLista(banco, { nome: 'Lista', descricao: null, ordenada: true }); adicionarNaLista(banco, lista, [id]); definirFavoritos(banco, [id])
    const foto = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#345678' } }).png().toBuffer()
    await salvarPerfil(banco, pasta, { nome: 'Original', frase: 'Frase', foto: Array.from(foto) })
    writeFileSync(join(pasta, '.env'), 'GOOGLE_BOOKS_API_KEY=local-nunca-exportar')
    const destino = join(raiz, 'copia.bela'); await criarBackup(banco, pasta, destino)
    expect(gunzipSync(readFileSync(destino)).toString()).not.toContain('local-nunca-exportar')
    await salvarPerfil(banco, pasta, { nome: 'Alterado', frase: '' }); criar('Depois do backup')
    const plano = prepararBackup(banco, destino)
    expect(plano).toMatchObject({ livros: 1, leituras: 0 })
    const anterior = await restaurarBackup(banco, pasta, plano)
    expect(existsSync(anterior)).toBe(true)
    expect(painelPerfil(banco, 2026).favoritos.map((l) => l.titulo)).toEqual(['Original'])
    expect(obterLista(banco, lista)?.total).toBe(1)
    expect(dadosPerfil(banco)).toMatchObject({ nome: 'Original', frase: 'Frase' })
    const nomeFoto = decodeURIComponent(new URL(dadosPerfil(banco).foto!).pathname.slice(1))
    expect(existsSync(join(pasta, 'capas', nomeFoto))).toBe(true)
    expect(readFileSync(join(pasta, '.env'), 'utf8')).toContain('local-nunca-exportar')
    expect(banco.sqlite.pragma('quick_check', { simple: true })).toBe('ok')
  })
  it('recusa arquivo corrompido ou caminho de imagem malicioso sem alterar a biblioteca', async () => {
    criar('Preservar')
    const destino = join(raiz, 'copia.bela'); await criarBackup(banco, pasta, destino)
    const conteudo = JSON.parse(gunzipSync(readFileSync(destino)).toString())
    conteudo.arquivos = [{ pasta: 'capas', nome: '../fora.png', dados: Buffer.from('teste').toString('base64') }]
    writeFileSync(destino, gzipSync(JSON.stringify(conteudo)))
    expect(() => prepararBackup(banco, destino)).toThrow('arquivos inválidos')
    expect(obterLivro(banco, 1)?.titulo).toBe('Preservar')
    writeFileSync(destino, 'corrompido')
    expect(() => prepararBackup(banco, destino)).toThrow('backup válido')
  })
})
