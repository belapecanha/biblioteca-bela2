import type { DadosLivro } from '@shared/api'
import type { Banco } from './db/conexao'
import { encontrarDuplicados, validarLivro } from './registro'
import { dataValida, notaValida } from './validacao'

export function lerCsv(csv: string): string[][] {
  if (typeof csv !== 'string' || Buffer.byteLength(csv) > 10 * 1024 * 1024) throw new Error('Envie um CSV de até 10 MB.')
  const linhas: string[][] = []
  let linha: string[] = [], campo = '', aspas = false
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i]
    if (c === '"') {
      if (aspas && csv[i + 1] === '"') { campo += '"'; i++ } else if (aspas || campo === '') aspas = !aspas
      else campo += c
    } else if (!aspas && (c === ',' || c === ';')) {
      // O Goodreads usa vírgula; ponto e vírgula dentro de um campo não é separador.
      if (c === ',') { linha.push(campo); campo = '' } else campo += c
    } else if (!aspas && (c === '\n' || c === '\r')) {
      if (c === '\r' && csv[i + 1] === '\n') i++
      linha.push(campo); if (linha.some((s) => s.trim())) linhas.push(linha)
      linha = []; campo = ''
      if (linhas.length > 10001) throw new Error('Importe no máximo 10.000 livros de cada vez.')
    } else campo += c
  }
  if (aspas) throw new Error('O CSV tem aspas sem fechamento.')
  linha.push(campo); if (linha.some((s) => s.trim())) linhas.push(linha)
  if (linhas.length > 10001) throw new Error('Importe no máximo 10.000 livros de cada vez.')
  if (linhas[0]?.[0]) linhas[0][0] = linhas[0][0].replace(/^\uFEFF/, '')
  return linhas
}
function limpar(v: string): string { return v.trim().replace(/^="(.*)"$/, '$1') }
export interface PlanoCsv { dados: DadosLivro[]; total: number; repetidos: number; invalidos: number; avisos: string[] }
export function prepararCsv(banco: Banco, csv: string): PlanoCsv {
  const [cabecalho, ...linhas] = lerCsv(csv)
  if (!cabecalho?.includes('Title') || !cabecalho.includes('Author')) throw new Error('Escolha o CSV exportado pelo Goodreads, com as colunas Title e Author.')
  const dados: DadosLivro[] = [], vistos = new Set<string>(), avisos: string[] = []
  let repetidos = 0, invalidos = 0
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]
    const valor = (nome: string) => limpar(linha[cabecalho.indexOf(nome)] ?? '')
    try {
      if (linha.length !== cabecalho.length) throw new Error('A quantidade de colunas está incorreta.')
      const data = (nome: string) => dataValida(valor(nome).replace(/\//g, '-') || null)
      const inteiro = (nome: string) => valor(nome) ? Number(valor(nome)) || null : null
      const estante = valor('Exclusive Shelf')
      const status = estante === 'read' ? 'lido' : estante === 'currently-reading' ? 'lendo' : 'quero_ler'
      const fim = status === 'lido' ? data('Date Read') : null
      const nota = notaValida(Number(valor('My Rating')) || null)
      const anoEstante = [...valor('Bookshelves').matchAll(/(?:^|[,\s])((?:19|20)\d{2})(?=$|[,\s])/g)].map((m) => Number(m[1]))
      const ano = fim ? Number(fim.slice(0, 4)) : status === 'lido' && anoEstante.length === 1 ? anoEstante[0] : null
      const livro = validarLivro({
        titulo: valor('Title'), tituloOriginal: null, colaboradores: [valor('Author'), ...valor('Additional Authors').split(',')].filter(Boolean).map((nome) => ({ nome: nome.trim(), pais: null, papel: 'autor' })),
        isbn10: valor('ISBN') || null, isbn13: valor('ISBN13') || null, editora: valor('Publisher') || null, paisEditora: null,
        serie: null, volume: null, tipo: 'livro', formato: null, paginas: inteiro('Number of Pages'), paginasEstimadas: false,
        anoEdicao: inteiro('Year Published'), anoPublicacao: inteiro('Original Publication Year'), idioma: null, sinopse: null,
        posse: null, status, generos: [], temas: [], moods: [], notasPrivadas: null,
        leituraInicial: status === 'quero_ler' ? undefined : { status, formato: null, dataInicio: null, dataFim: fim, anoFim: ano, precisaoFim: fim ? 'dia' : ano ? 'ano' : null, nota, resenha: valor('My Review') || null }
      })
      const chave = livro.isbn13 || livro.isbn10 || `${livro.titulo.toLocaleLowerCase()}|${livro.colaboradores[0].nome.toLocaleLowerCase()}`
      if (vistos.has(chave) || encontrarDuplicados(banco, livro).length) { repetidos++; continue }
      vistos.add(chave); dados.push(livro)
    } catch (erro) { invalidos++; if (avisos.length < 20) avisos.push(`Linha ${i + 2}: ${erro instanceof Error ? erro.message : 'Dados inválidos.'}`) }
  }
  return { dados, total: linhas.length, repetidos, invalidos, avisos }
}
function celula(valor: unknown): string {
  let s = valor === null || valor === undefined ? '' : String(valor)
  if (/^[=+@\-\t\r]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}
export function exportarCsv(banco: Banco): string {
  const linhas = banco.sqlite.prepare(`SELECT l.*, e.nome editora,
    (SELECT group_concat(nome, ', ') FROM (SELECT a.nome FROM livro_autores x JOIN autores a ON a.id = x.autor_id WHERE x.livro_id = l.id AND x.papel = 'autor' ORDER BY x.ordem)) autores,
    x.status status_leitura, x.data_inicio, x.data_fim, x.ano_fim, x.precisao_fim, x.nota, x.resenha
    FROM livros l LEFT JOIN editoras e ON e.id = l.editora_id LEFT JOIN leituras x ON x.livro_id = l.id ORDER BY l.titulo, x.id`).all() as Record<string, unknown>[]
  const colunas = ['titulo', 'autores', 'isbn10', 'isbn13', 'editora', 'paginas', 'status', 'formato', 'posse', 'status_leitura', 'data_inicio', 'data_fim', 'ano_fim', 'precisao_fim', 'nota', 'resenha', 'notas_privadas']
  return '\uFEFF' + [colunas.map(celula).join(','), ...linhas.map((l) => colunas.map((c) => celula(l[c])).join(','))].join('\r\n')
}
