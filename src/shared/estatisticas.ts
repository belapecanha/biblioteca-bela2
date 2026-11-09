import { contar } from './texto'
import type { LeituraAnalise, LivroAnalise } from './api'

export const FILTROS = [
  'genero',
  'tema',
  'mood',
  'tipo',
  'formato',
  'pais',
  'status',
  'autor',
  'mes',
  'decada',
  'nota',
  'classe'
] as const
export type ChaveFiltro = (typeof FILTROS)[number]
export type Filtros = Partial<Record<ChaveFiltro, string>>

export interface Entrada {
  livro: LivroAnalise
  leitura: LeituraAnalise
}
export type Contagem = [string, number]

export const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
export const MESES_LONGOS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro'
]
const NAO_FICCAO = [
  'Biografia e autobiografia',
  'Desenvolvimento pessoal',
  'Filosofia',
  'História',
  'Política',
  'Economia e finanças',
  'Divulgação científica'
]

export const fmt = (n: number): string => n.toLocaleString('pt-BR')
export const dec = (n: number, casas = 1): string => n.toFixed(casas).replace('.', ',')
export const media = (v: number[]): number => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0)
export const naoFiccao = (l: Pick<LivroAnalise, 'generos'>): boolean => NAO_FICCAO.includes(l.generos[0] ?? '')

export function formatoDe({ livro, leitura }: Entrada): string {
  return leitura.formato ?? livro.formato ?? 'sem'
}

const conta = (lista: string[]): Contagem[] => contar(lista)

function passaLivro(l: LivroAnalise, f: Filtros): boolean {
  return (
    (!f.genero || l.generos.includes(f.genero)) &&
    (!f.tema || l.temas.includes(f.tema)) &&
    (!f.mood || l.moods.includes(f.mood)) &&
    (!f.tipo || l.tipo === f.tipo) &&
    (!f.pais || l.pais === f.pais) &&
    (!f.status || l.status === f.status) &&
    (!f.autor || l.autores.some((a) => String(a.id) === f.autor)) &&
    (!f.decada || (l.anoPublicacao !== null && Math.floor(l.anoPublicacao / 10) * 10 === Number(f.decada))) &&
    (!f.classe ||
      (f.classe === 'sem'
        ? !l.generos.length
        : f.classe === 'nao'
          ? naoFiccao(l)
          : l.generos.length > 0 && !naoFiccao(l)))
  )
}

function passaEntrada(e: Entrada, f: Filtros): boolean {
  return (
    (!f.formato || formatoDe(e) === f.formato) &&
    (!f.nota || e.leitura.nota === Number(f.nota)) &&
    (!f.mes ||
      (e.leitura.precisao === 'dia' && e.leitura.data !== null && Number(e.leitura.data.slice(5, 7)) === Number(f.mes)))
  )
}

export interface Recorte {
  livros: LivroAnalise[]
  entradas: Entrada[]
}

export function filtrar(todos: LivroAnalise[], f: Filtros): Recorte {
  const livros = todos.filter((l) => passaLivro(l, f))
  const entradas = livros
    .flatMap((livro) => livro.leituras.map((leitura) => ({ livro, leitura })))
    .filter((e) => passaEntrada(e, f))
  // Com filtro de leitura, só ficam os livros que têm uma leitura correspondente.
  const porLeitura = f.formato || f.nota || f.mes
  const comEntrada = new Set(entradas.map((e) => e.livro.id))
  return { livros: porLeitura ? livros.filter((l) => comEntrada.has(l.id)) : livros, entradas }
}

function diasNoAno(ano: number, hoje: Date): number {
  const inicio = Date.UTC(ano, 0, 1)
  if (ano === hoje.getFullYear())
    return Math.max(1, Math.floor((Date.UTC(ano, hoje.getMonth(), hoje.getDate()) - inicio) / 864e5) + 1)
  return (Date.UTC(ano + 1, 0, 1) - inicio) / 864e5
}

export function diasEntre(inicio: string, fim: string): number {
  return Math.round((Date.parse(fim.slice(0, 10)) - Date.parse(inicio.slice(0, 10))) / 864e5)
}

export function calcular(base: { livros: LivroAnalise[]; entradas: Entrada[] }, ano: number | null, hoje = new Date()) {
  const E = base.entradas.filter((e) => !ano || e.leitura.ano === ano)
  // Uma releitura conta nas páginas e no ano dela, mas o livro só conta uma vez em cada ranking.
  const R = [...new Map(E.map((e) => [e.livro.id, e.livro])).values()]
  const datadas = E.filter((e) => e.leitura.ano !== null)

  const porAno = new Map<number, { livros: number; paginas: number }>()
  for (const { livro, leitura } of base.entradas) {
    if (leitura.ano === null) continue
    const a = porAno.get(leitura.ano) ?? { livros: 0, paginas: 0 }
    a.livros++
    a.paginas += livro.paginas ?? 0
    porAno.set(leitura.ano, a)
  }
  const anosDados = datadas.map((e) => e.leitura.ano as number)
  const primeiro = ano ?? (anosDados.length ? Math.min(...anosDados) : hoje.getFullYear())
  const ultimo = ano ?? (anosDados.length ? Math.max(...anosDados) : hoje.getFullYear())
  let dias = 0
  for (let a = primeiro; a <= ultimo; a++) dias += diasNoAno(a, hoje)
  const anosPeriodo = ultimo - primeiro + 1

  const paginas = E.reduce((s, e) => s + (e.livro.paginas ?? 0), 0)
  const paginasDatadas = datadas.reduce((s, e) => s + (e.livro.paginas ?? 0), 0)
  const notas = E.flatMap((e) => (e.leitura.nota === null ? [] : [e.leitura.nota]))

  const meses = MESES_CURTOS.map((m, i) => ({ m, i, q: 0 }))
  for (const { leitura } of E)
    if (leitura.precisao === 'dia' && leitura.data) meses[Number(leitura.data.slice(5, 7)) - 1].q++

  const decadas = new Map<number, number>()
  for (const l of R)
    if (l.anoPublicacao) {
      const d = Math.floor(l.anoPublicacao / 10) * 10
      decadas.set(d, (decadas.get(d) ?? 0) + 1)
    }

  const porAutor = new Map<number, { id: number; nome: string; livros: LivroAnalise[]; notas: number[] }>()
  for (const l of R)
    for (const a of l.autores) {
      const x = porAutor.get(a.id) ?? { id: a.id, nome: a.nome, livros: [], notas: [] }
      x.livros.push(l)
      porAutor.set(a.id, x)
    }
  for (const { livro, leitura } of E)
    if (leitura.nota !== null) for (const a of livro.autores) porAutor.get(a.id)?.notas.push(leitura.nota)
  // Quem escreveu exatamente os mesmos livros (roteiro e arte, por exemplo) ocupa uma linha só.
  const porObra = new Map<
    string,
    { id: number; nome: string; membros: { id: number; nome: string }[]; livros: LivroAnalise[]; notas: number[] }
  >()
  for (const x of porAutor.values()) {
    const chave = x.livros
      .map((l) => l.id)
      .sort((a, b) => a - b)
      .join(',')
    const obra = porObra.get(chave)
    if (obra) {
      obra.membros.push({ id: x.id, nome: x.nome })
      obra.nome = obra.membros.map((m) => m.nome).join(' e ')
    } else porObra.set(chave, { ...x, membros: [{ id: x.id, nome: x.nome }] })
  }
  const autores = [...porObra.values()].sort(
    (a, b) => b.livros.length - a.livros.length || a.nome.localeCompare(b.nome, 'pt-BR')
  )
  // Uma série só aparece uma vez no ranking, para ele mostrar autorias variadas.
  const seriesVistas = new Set<string>()
  const autoresVariados = autores.filter((x) => {
    const serie = x.livros[0].serie?.nome
    if (!serie || x.livros.some((l) => l.serie?.nome !== serie)) return true
    if (seriesVistas.has(serie)) return false
    seriesVistas.add(serie)
    return true
  })

  const porSerie = new Map<string, { nome: string; total: number; lidos: number; paginas: number }>()
  for (const l of base.livros) {
    if (!l.serie) continue
    const s = porSerie.get(l.serie.nome) ?? { nome: l.serie.nome, total: 0, lidos: 0, paginas: 0 }
    s.total++
    if (l.leituras.length) {
      s.lidos++
      s.paginas += l.paginas ?? 0
    }
    porSerie.set(l.serie.nome, s)
  }

  const calor = new Map<string, number[]>()
  for (const { livro, leitura } of E) {
    if (leitura.nota === null) continue
    for (const g of livro.generos)
      for (const h of livro.moods) calor.set(`${g}|${h}`, [...(calor.get(`${g}|${h}`) ?? []), leitura.nota])
  }

  const comPaginas = R.filter((l) => l.paginas && !l.paginasEstimadas).sort(
    (a, b) => (b.paginas ?? 0) - (a.paginas ?? 0)
  )
  const cinco = [...new Map(E.filter((e) => e.leitura.nota === 5).map((e) => [e.livro.id, e.livro])).values()]
  const baixas = [
    ...new Map(
      E.filter((e) => e.leitura.nota !== null)
        .sort((a, b) => (a.leitura.nota ?? 0) - (b.leitura.nota ?? 0))
        .map((e) => [e.livro.id, e.livro])
    ).values()
  ].slice(0, 5)

  return {
    R,
    E,
    n: R.length,
    leituras: E.length,
    paginas,
    media: media(notas),
    porAno,
    dias,
    semPaginas: R.filter((l) => !l.paginas).length,
    autoresTotal: porAutor.size,
    resenhas: E.filter((e) => e.leitura.temResenha).length,
    livrosPorAno: datadas.length / anosPeriodo,
    paginasPorAno: paginasDatadas / anosPeriodo,
    livrosPorDia: datadas.length / dias,
    paginasPorDia: paginasDatadas / dias,
    diasPorLivro: datadas.length ? dias / datadas.length : 0,
    meses,
    exatos: meses.reduce((s, m) => s + m.q, 0),
    decadas: [...decadas.entries()].sort((a, b) => a[0] - b[0]),
    notasDist: [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map((v): [number, number] => [
      v,
      notas.filter((x) => x === v).length
    ]),
    generos: conta(R.flatMap((l) => l.generos)),
    temas: conta(R.flatMap((l) => l.temas)),
    moods: conta(R.flatMap((l) => l.moods)),
    tipos: conta(R.map((l) => l.tipo)),
    formatos: conta(E.map(formatoDe)),
    paises: conta(R.flatMap((l) => (l.pais ? [l.pais] : []))),
    ficcao: R.filter((l) => l.generos.length && !naoFiccao(l)).length,
    naoFiccao: R.filter(naoFiccao).length,
    semClasse: R.filter((l) => !l.generos.length).length,
    autores,
    autoresVariados,
    series: [...porSerie.values()].filter((s) => s.total > 1),
    calor,
    maior: comPaginas[0] ?? null,
    menor: comPaginas.at(-1) ?? null,
    cinco,
    baixas
  }
}
export type Estatisticas = ReturnType<typeof calcular>

export function tempoNaFila(livros: LivroAnalise[]): { n: number; media: number; menor: number; maior: number } | null {
  // Livros importados entraram de uma vez, então a data de cadastro deles não diz nada sobre a espera.
  const dias = livros.flatMap((l) =>
    l.origem === 'manual' && l.primeiroInicio ? [Math.max(0, diasEntre(l.criadoEm, l.primeiroInicio))] : []
  )
  return dias.length ? { n: dias.length, media: media(dias), menor: Math.min(...dias), maior: Math.max(...dias) } : null
}

export function filaMaisAntiga(livros: LivroAnalise[]): LivroAnalise[] {
  return livros
    .filter((l) => l.status === 'quero_ler')
    .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm) || a.titulo.localeCompare(b.titulo, 'pt-BR'))
}

export function mudeiDeIdeia(livros: LivroAnalise[]): LivroAnalise[] {
  return livros.filter((l) => new Set(l.leituras.flatMap((x) => (x.nota === null ? [] : [x.nota]))).size > 1)
}

export function metaDoAno(
  livros: LivroAnalise[],
  ano: number,
  hoje = new Date()
): { lidos: number; previsao: number; diasRestantes: number } {
  const lidos = new Set(livros.filter((l) => l.leituras.some((x) => x.ano === ano)).map((l) => l.id)).size
  const total = diasNoAno(ano, new Date(ano + 1, 0, 1))
  const passados = diasNoAno(ano, hoje)
  return { lidos, previsao: Math.round((lidos / passados) * total), diasRestantes: Math.max(0, total - passados) }
}

// Mostra um livro de cada série antes de repetir volumes da mesma.
export function variarSeries(livros: LivroAnalise[]): LivroAnalise[] {
  const vistas = new Set<string>()
  const primeiros: LivroAnalise[] = []
  const resto: LivroAnalise[] = []
  for (const l of livros) {
    const chave = l.serie?.nome ?? `livro-${l.id}`
    if (vistas.has(chave)) resto.push(l)
    else {
      vistas.add(chave)
      primeiros.push(l)
    }
  }
  return [...primeiros, ...resto]
}

export const comCapaPrimeiro = (ls: LivroAnalise[]): LivroAnalise[] =>
  [...ls].sort((a, b) => Number(!!b.miniatura) - Number(!!a.miniatura))

export interface Cartao {
  sobre: string
  grande: string
  texto: string
  nota?: string
  livros: LivroAnalise[]
}

export function cartoesRetrospectiva(S: Estatisticas, P: Estatisticas, ano: number): Cartao[] {
  const cap = (ls: LivroAnalise[]) => comCapaPrimeiro(ls).slice(0, 6)
  const diff = S.n - P.n
  const melhor = [...S.meses].sort((a, b) => b.q - a.q)[0]
  const moda = [...S.notasDist].sort((a, b) => b[1] - a[1])[0]
  const aut = S.autores[0]
  const doMes = S.E.filter(
    (e) => e.leitura.precisao === 'dia' && e.leitura.data && Number(e.leitura.data.slice(5, 7)) === melhor.i + 1
  ).map((e) => e.livro)
  const classe = (
    sobre: string,
    vazio: string,
    frase: string,
    top: Contagem | undefined,
    campo: 'generos' | 'temas' | 'moods'
  ): Cartao => ({
    sobre,
    grande: top ? top[0] : `Sem ${vazio}`,
    texto: top ? `${top[1]} ${top[1] === 1 ? 'livro' : 'livros'} ${frase}.` : `Nenhum livro com ${vazio} neste ano.`,
    livros: top ? cap(S.R.filter((l) => l[campo].includes(top[0]))) : []
  })
  return [
    {
      sobre: `Sua retrospectiva de ${ano}`,
      grande: `${S.n} ${S.n === 1 ? 'livro' : 'livros'}`,
      texto: !P.n
        ? 'Sem livros registrados no ano anterior.'
        : diff === 0
          ? 'O mesmo total do ano anterior.'
          : `${Math.abs(diff)} a ${diff > 0 ? 'mais' : 'menos'} que no ano anterior.`,
      livros: cap(S.R)
    },
    {
      sobre: 'Páginas viradas',
      grande: fmt(S.paginas),
      texto: `Cerca de ${Math.round(S.paginasPorDia)} páginas por dia.${P.n ? ` No ano anterior foram ${fmt(P.paginas)}.` : ''}`,
      nota: S.semPaginas
        ? `${S.semPaginas} ${S.semPaginas === 1 ? 'livro está' : 'livros estão'} sem número de páginas.`
        : undefined,
      livros: cap([...S.R].filter((l) => l.paginas).sort((a, b) => (b.paginas ?? 0) - (a.paginas ?? 0)))
    },
    {
      sobre: 'Seu melhor mês',
      grande: melhor.q ? MESES_LONGOS[melhor.i] : 'Sem data',
      texto: melhor.q
        ? `${melhor.q} ${melhor.q === 1 ? 'livro terminado' : 'livros terminados'}.`
        : 'Este ano só tem datas aproximadas.',
      nota: `Considera ${S.exatos} de ${S.leituras} leituras com data exata.`,
      livros: melhor.q ? cap(doMes) : []
    },
    {
      sobre: 'Sua nota mais comum',
      grande: moda[1] ? `${dec(moda[0]).replace(',0', '')} ★` : 'Sem notas',
      texto: moda[1]
        ? `Média do ano: ${dec(S.media)}.${P.media ? ` No ano anterior foi ${dec(P.media)}.` : ''}`
        : 'Nenhuma leitura com nota neste ano.',
      livros: moda[1] ? cap(S.E.filter((e) => e.leitura.nota === moda[0]).map((e) => e.livro)) : []
    },
    classe('Gênero do ano', 'gênero', 'marcados', S.generos[0], 'generos'),
    classe('Tema do ano', 'tema', 'com esse tema', S.temas[0], 'temas'),
    classe('Mood do ano', 'mood', 'com esse clima', S.moods[0], 'moods'),
    {
      sobre: 'Autoria mais lida do ano',
      grande: aut ? aut.nome : 'Sem autoria',
      texto: aut
        ? `${aut.livros.length} ${aut.livros.length === 1 ? 'livro' : 'livros'}${aut.notas.length ? `, nota média ${dec(media(aut.notas))}` : ''}.`
        : 'Nenhuma autoria registrada neste ano.',
      livros: aut ? cap(aut.livros) : []
    },
    {
      sobre: 'Os favoritos do ano',
      grande: `${S.cinco.length} com 5 estrelas`,
      texto: 'Os livros que mais ficaram.',
      livros: cap(S.cinco)
    },
    {
      sobre: 'Os extremos',
      grande: S.maior ? `${fmt(S.maior.paginas ?? 0)} páginas` : 'Sem páginas',
      texto:
        S.maior && S.menor
          ? `O mais longo foi ${S.maior.titulo}. O mais curto, ${S.menor.titulo}, com ${fmt(S.menor.paginas ?? 0)}.`
          : 'Nenhum livro com número de páginas neste ano.',
      livros: S.maior && S.menor ? [...new Set([S.maior, S.menor])] : []
    }
  ]
}
