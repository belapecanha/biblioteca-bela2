import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent
} from 'react'
import { Link } from 'react-router-dom'
import type { LivroResumo, Status } from '@shared/api'
import { CapaDesenhada, Estado } from '../componentes/Capa'
import { Estrelas } from '../componentes/Estrelas'
import { coresDoLivro, NOME_STATUS, normalizar, numeroDoTexto, useAcoesLivro, useLivros } from '../dados'

function matiz(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  if (d < 0.06) return 400 + max
  return (max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60
}

// Cada ordem gera uma chave por livro antes de ordenar: o comparador não recalcula nada
// (antes, o matiz da cor era refeito a cada comparação).
const ORDENS: Record<string, (l: LivroResumo) => string | number> = {
  titulo: (l) => l.titulo,
  autor: (l) => l.autores[0]?.nome ?? '',
  ano: (l) => -(l.anoLido ?? 0),
  nota: (l) => -(l.nota ?? 0),
  paginas: (l) => -(l.paginas ?? 0),
  cor: (l) => matiz(coresDoLivro(l).fundo)
}
const collator = new Intl.Collator('pt-BR')
function ordenar(livros: LivroResumo[], ordem: string): LivroResumo[] {
  const chave = ORDENS[ordem] ?? ORDENS.titulo
  return livros
    .map((l) => ({ l, k: chave(l) }))
    .sort((a, b) => (typeof a.k === 'string' ? collator.compare(a.k, b.k as string) : a.k - (b.k as number)))
    .map((x) => x.l)
}

const LARGURA_CARTAO = 300
const ESCALA_CAPA = 1.2

function medidas(l: LivroResumo) {
  // Escala única: base de 8px e mais 5px a cada 100 páginas (400 → 28px, 700 → 43px).
  // Os limites só seguram dados absurdos; nenhum livro real chega neles.
  const largura = Math.max(10, Math.min(100, Math.round(8 + (l.paginas ?? 250) * 0.05)))
  // Volumes da mesma série têm a mesma altura; só a grossura muda com as páginas.
  const altura = 166 + (numeroDoTexto(l.serie ? `serie:${l.serie.id}` : l.titulo) % 42)
  return { largura, altura, larguraCapa: Math.round((altura * 2) / 3) }
}

const SEM_SIGLA =
  /^(editora|editorial|ediciones|edições|edicoes|publishing|publishers|books|press|livros|e|y|&|de|da|do|dos|das|the)$/i

// Monograma da editora, como o logotipo no pé da lombada: "Galera Record" vira GR.
function siglaEditora(nome: string): string {
  const palavras = nome
    .replace(/\(.*?\)|[|.,]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  const uteis = palavras.filter((p) => !SEM_SIGLA.test(p))
  return (uteis.length ? uteis : palavras)
    .slice(0, 2)
    .map((p) => [...p][0])
    .join('')
    .toUpperCase()
}

// Lombada não tem espaço para subtítulo: "Heartstopper: Volume One" fica Heartstopper.
// Com volume na série, o número vai à parte e sai do título.
function tituloCurto(titulo: string, comVolume: boolean): string {
  // O apóstrofo tipográfico fica em pé no texto vertical; o reto deita junto com as letras.
  let curto = titulo
    .replace(/[’‘]/g, "'")
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .split(/:\s| - | – /)[0]
    .trim()
  if (comVolume) curto = curto.replace(/[,.]?\s*(vol\.?|volume|volumen|v\.)\s*\d+([.,]\d+)?\s*$/i, '').trim()
  return curto.length >= 3 ? curto : titulo
}

// O título nunca leva reticências: primeiro sai o autor; depois vale o que der a maior letra,
// uma linha só ou o título quebrado em colunas; no limite saem também o número e o monograma.
interface Ajuste {
  fonte: number | null
  quebra: boolean
  semAutor: boolean
  semExtras: boolean
  semMoldura: boolean
}

function aplicar(caixa: HTMLElement, a: Ajuste): void {
  const titulo = caixa.querySelector<HTMLElement>('.lb-titulo')
  if (!titulo) return
  titulo.style.cssText = ''
  if (a.fonte !== null) titulo.style.fontSize = `${a.fonte}px`
  if (a.quebra) Object.assign(titulo.style, { whiteSpace: 'normal', lineHeight: '1.05' })
  if (a.semMoldura) Object.assign(titulo.style, { margin: '0', padding: '0', border: '0', background: 'none' })
  const mostrar = (seletor: string, sim: boolean) => {
    const el = caixa.querySelector<HTMLElement>(seletor)
    if (el) el.style.display = sim ? '' : 'none'
  }
  mostrar('.lb-autor', !a.semAutor)
  mostrar('.lb-volume', !a.semExtras)
  mostrar('.lb-editora', !a.semExtras)
}

// Mede no DOM. Cada teste de tamanho força um reflow, então a busca é binária (meio pixel
// de precisão) em vez de descer de 0,5 em 0,5, e o resultado vai para o cache abaixo.
function medir(caixa: HTMLElement): Ajuste {
  const titulo = caixa.querySelector<HTMLElement>('.lb-titulo')
  const a: Ajuste = { fonte: null, quebra: false, semAutor: false, semExtras: false, semMoldura: false }
  if (!titulo) return a
  aplicar(caixa, a)
  const autor = caixa.querySelector<HTMLElement>('.lb-autor')
  const cabe = () => titulo.scrollHeight <= titulo.clientHeight + 1 && titulo.scrollWidth <= titulo.clientWidth + 1
  // Sobrenome que não cabe inteiro também sai, em vez de aparecer cortado.
  if (autor && autor.scrollHeight > autor.clientHeight + 1) a.semAutor = true
  aplicar(caixa, a)
  if (cabe()) return a
  if (autor && !a.semAutor) {
    a.semAutor = true
    aplicar(caixa, a)
    if (cabe()) return a
  }
  const base = parseFloat(getComputedStyle(titulo).fontSize)
  const maiorQueCabe = (minimo: number): number | null => {
    const passos = Math.floor((base - minimo) * 2)
    if (passos < 0) return null
    const testar = (passo: number) => {
      titulo.style.fontSize = `${base - passo / 2}px`
      return cabe()
    }
    if (!testar(passos)) return null
    let lo = 0
    let hi = passos
    while (lo < hi) {
      const meio = (lo + hi) >> 1
      if (testar(meio)) hi = meio
      else lo = meio + 1
    }
    return base - lo / 2
  }
  const tentar = (mudanca: Partial<Ajuste>, minimo: number) => {
    Object.assign(a, mudanca, { fonte: null })
    aplicar(caixa, a)
    return maiorQueCabe(minimo)
  }
  const umaLinha = tentar({ quebra: false }, 8)
  const emColunas = tentar({ quebra: true }, 5)
  if (umaLinha !== null && (emColunas === null || emColunas <= umaLinha + 1.5))
    return { ...a, quebra: false, fonte: umaLinha }
  if (emColunas !== null) return { ...a, quebra: true, fonte: emColunas }
  const semExtras = tentar({ semExtras: true, quebra: true }, 5)
  if (semExtras !== null) return { ...a, fonte: semExtras }
  // Último recurso: o título ocupa a lombada inteira, sem moldura.
  const semMolduraLinha = tentar({ semMoldura: true, quebra: false }, 5)
  if (semMolduraLinha !== null) return { ...a, fonte: semMolduraLinha }
  return { ...a, quebra: true, fonte: tentar({ quebra: true }, 5) ?? 5 }
}

// A mesma lombada (mesmo texto e tamanho) nunca é medida duas vezes na sessão.
// Só guarda depois que as fontes carregaram, porque a medida muda com a fonte.
const cacheAjustes = new Map<string, Ajuste>()
function ajustarTitulo(caixa: HTMLElement, chave: string): void {
  const salvo = cacheAjustes.get(chave)
  if (salvo) {
    aplicar(caixa, salvo)
    return
  }
  const ajuste = medir(caixa)
  aplicar(caixa, ajuste)
  if (document.fonts.status === 'loaded') cacheAjustes.set(chave, ajuste)
}

// A lombada usa a beirada esquerda da capa, a que fica junto da lombada no livro de verdade.
const imagemLombada = (l: LivroResumo) => l.miniatura ?? l.capa

interface PropsLombada {
  titulo: string
  volume: number | null
  autor: string | undefined
  editora: string | null
  largura: number
  altura: number
}

// Só recebe textos e números: um refetch que recria os objetos do livro não refaz a lombada.
const Lombada = memo(function Lombada({ titulo, volume, autor, editora, largura, altura }: PropsLombada) {
  const caixa = useRef<HTMLSpanElement>(null)
  const curto = tituloCurto(titulo, volume !== null)
  const sigla = editora ? siglaEditora(editora) : null
  const chave = `${curto}|${volume ?? ''}|${autor ?? ''}|${sigla ?? ''}|${largura}|${altura}`
  useLayoutEffect(() => {
    const el = caixa.current
    if (!el) return
    ajustarTitulo(el, chave)
    let vivo = true
    // A fonte do título pode chegar depois; mede de novo quando ela carrega.
    if (document.fonts.status !== 'loaded') {
      void document.fonts.ready.then(() => {
        if (vivo) ajustarTitulo(el, chave)
      })
    }
    return () => {
      vivo = false
    }
  }, [chave])
  return (
    <span ref={caixa} className={`lb${largura >= 34 ? ' lb-larga' : ''}`} aria-hidden="true">
      {volume !== null && <span className="lb-volume">{String(volume).replace('.', ',')}</span>}
      <span className="lb-faixa">
        <span className="lb-titulo">{curto}</span>
        {autor && <span className="lb-autor">{autor}</span>}
      </span>
      {sigla && <span className="lb-editora">{sigla}</span>}
    </span>
  )
})

const sobrenome = (l: LivroResumo) => l.autores[0]?.nome.trim().split(/\s+/).pop()

interface Aberto {
  id: number
  fase: 'sai' | 'volta'
  deslocamento: number
}

export function Estante() {
  const consulta = useLivros()
  const acoes = useAcoesLivro()
  const [ordem, setOrdem] = useState('titulo')
  const [mostrar, setMostrar] = useState<Status | 'todos' | 'tenho'>('todos')
  const [filtro, setFiltro] = useState('')
  const [aberto, setAberto] = useState<Aberto | null>(null)
  const [areaCapa, setAreaCapa] = useState<CSSProperties | null>(null)
  const temporizador = useRef<number>(undefined)

  useEffect(() => () => clearTimeout(temporizador.current), [])
  // Só usa setters e a ref do temporizador, então é a mesma função a vida toda.
  const devolver = useCallback(() => {
    setAreaCapa(null)
    clearTimeout(temporizador.current)
    setAberto((a) => (a ? { ...a, fase: 'volta' } : a))
    temporizador.current = window.setTimeout(() => setAberto(null), 650)
  }, [])
  // Esc devolve o livro aberto, esteja o foco onde estiver.
  const aberta = aberto?.fase === 'sai'
  useEffect(() => {
    if (!aberta) return
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') devolver()
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [aberta, devolver])

  const livros = useMemo(() => {
    const termo = normalizar(filtro.trim())
    const visiveis = (consulta.data ?? []).filter(
      (l) =>
        (mostrar === 'todos' || (mostrar === 'tenho' ? l.posse === 'tenho' : l.status === mostrar)) &&
        (!termo || normalizar(`${l.titulo} ${l.autores.map((a) => a.nome).join(' ')}`).includes(termo))
    )
    return ordenar(visiveis, ordem)
  }, [consulta.data, ordem, mostrar, filtro])

  if (!consulta.data)
    return <Estado carregando={consulta.isLoading} erro={consulta.isError} aoTentar={() => void consulta.refetch()} />

  // O navegador não acerta o clique em faces 3D, então uma área plana cobre a capa depois de aberta.
  const medirCapa = (livro3d: HTMLElement) => {
    const capa = livro3d.querySelector('.capa3d')?.getBoundingClientRect()
    const vaga = livro3d.closest('.vaga')?.getBoundingClientRect()
    if (capa && vaga) {
      setAreaCapa({ left: capa.left - vaga.left, top: capa.top - vaga.top, width: capa.width, height: capa.height })
    }
  }

  const clicar = (livro: LivroResumo, e: MouseEvent<HTMLButtonElement>) => {
    if (aberto?.id === livro.id && aberto.fase === 'sai') {
      devolver()
      return
    }
    setAreaCapa(null)
    clearTimeout(temporizador.current)
    const moveis = e.currentTarget.closest('.moveis')!.getBoundingClientRect()
    const lombada = e.currentTarget.getBoundingClientRect()
    const precisa = medidas(livro).larguraCapa * ESCALA_CAPA + LARGURA_CARTAO + 24
    setAberto({
      id: livro.id,
      fase: 'sai',
      deslocamento: Math.min(0, Math.round(moveis.right - lombada.right - precisa))
    })
  }

  return (
    <main className="wrap pagina">
      <div className="cabeca">
        <h1>
          Sua estante, <em>{livros.length} livros</em>
        </h1>
        <div className="linha">
          <div>
            <label className="rot" htmlFor="e-filtro">
              Filtrar
            </label>
            <input
              id="e-filtro"
              className="campo"
              type="search"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
            />
          </div>
          <div>
            <label className="rot" htmlFor="e-ordem">
              Ordenar por
            </label>
            <select
              id="e-ordem"
              className="campo"
              value={ordem}
              onChange={(e) => {
                setOrdem(e.target.value)
                setAberto(null)
              }}
            >
              <option value="titulo">Título</option>
              <option value="autor">Autor</option>
              <option value="ano">Ano lido</option>
              <option value="nota">Nota</option>
              <option value="paginas">Páginas</option>
              <option value="cor">Cor</option>
            </select>
          </div>
          <div>
            <label className="rot" htmlFor="e-mostrar">
              Mostrar
            </label>
            <select
              id="e-mostrar"
              className="campo"
              value={mostrar}
              onChange={(e) => {
                setMostrar(e.target.value as typeof mostrar)
                setAberto(null)
              }}
            >
              <option value="todos">Todos</option>
              <option value="lido">Lidos</option>
              <option value="lendo">Lendo</option>
              <option value="quero_ler">Quero ler</option>
              <option value="tenho">Só os que tenho</option>
            </select>
          </div>
        </div>
      </div>
      <p className="muted sem-margem">Clique em uma lombada para tirar o livro da estante. Esc devolve.</p>
      {livros.length === 0 && <p className="muted">Nenhum livro aqui.</p>}
      <div className="moveis">
        {livros.map((l) => {
          const m = medidas(l)
          const cores = coresDoLivro(l)
          const estaAberto = aberto?.id === l.id
          return (
            <div key={l.id} className={estaAberto ? 'vaga on' : 'vaga'} style={{ width: m.largura }}>
              <div
                className="desl"
                style={estaAberto ? { transform: `translateX(${aberto.deslocamento}px)` } : undefined}
              >
                <div
                  className={estaAberto ? `livro3d ${aberto.fase}` : 'livro3d'}
                  style={{ width: m.largura, height: m.altura }}
                  onAnimationEnd={(e) => {
                    if (e.target === e.currentTarget && e.animationName === 'bb-sai') medirCapa(e.currentTarget)
                  }}
                >
                  <button
                    type="button"
                    className={imagemLombada(l) ? 'lombada com-capa' : 'lombada'}
                    title={l.titulo}
                    aria-label={`${l.titulo}, de ${l.autores.map((a) => a.nome).join(', ')}`}
                    aria-expanded={estaAberto}
                    onClick={(e) => clicar(l, e)}
                    style={
                      {
                        backgroundColor: cores.fundo,
                        color: cores.texto,
                        '--f': cores.fundo,
                        '--img': imagemLombada(l) ? `url("${imagemLombada(l)}")` : undefined
                      } as CSSProperties
                    }
                  >
                    <Lombada
                      titulo={l.titulo}
                      volume={l.volume}
                      autor={sobrenome(l)}
                      editora={l.editora?.nome ?? null}
                      largura={m.largura}
                      altura={m.altura}
                    />
                  </button>
                  {estaAberto &&
                    (l.capa ? (
                      <div
                        className="capa3d"
                        style={{ left: m.largura, width: m.larguraCapa, height: m.altura, background: cores.fundo }}
                      >
                        <img src={l.capa} alt="" />
                      </div>
                    ) : (
                      <CapaDesenhada
                        className="capa3d"
                        titulo={l.titulo}
                        cor={cores.fundo}
                        style={{ left: m.largura, width: m.larguraCapa, height: m.altura }}
                      />
                    ))}
                </div>
              </div>
              {estaAberto && aberto.fase === 'sai' && areaCapa && (
                <Link
                  className="capa-clique"
                  to={`/livro/${l.id}`}
                  aria-label={`Abrir ficha de ${l.titulo}`}
                  style={areaCapa}
                />
              )}
              {estaAberto && aberto.fase === 'sai' && (
                <aside
                  className="ficha3d"
                  aria-live="polite"
                  style={{ left: m.largura + m.larguraCapa * ESCALA_CAPA + 14 + aberto.deslocamento }}
                >
                  <h3>{l.titulo}</h3>
                  <p className="peq muted cartao-meta">
                    {l.autores.map((a, i) => (
                      <span key={a.id}>
                        {i > 0 && ', '}
                        <Link className="link" to={`/autor/${a.id}`}>
                          {a.nome}
                        </Link>
                      </span>
                    ))}
                    {l.paginas ? `, ${l.paginas} páginas` : ''}
                    {l.anoLido ? `, lido em ${l.anoLido}` : `, ${NOME_STATUS[l.status].toLowerCase()}`}
                  </p>
                  {l.status !== 'quero_ler' && (
                    <Estrelas nota={l.nota} aoMudar={(nota) => acoes.nota.mutate({ id: l.id, nota })} />
                  )}
                  {l.serie && (
                    <p className="peq sem-margem">
                      <Link className="link" to={`/serie/${l.serie.id}`}>
                        {l.serie.nome}
                      </Link>
                    </p>
                  )}
                  <div className="linha">
                    <Link className="btn" to={`/livro/${l.id}`}>
                      Abrir ficha
                    </Link>
                    <button type="button" className="btn btn2" onClick={devolver}>
                      Devolver
                    </button>
                  </div>
                </aside>
              )}
            </div>
          )
        })}
      </div>
      <p className="muted peq sem-margem">
        A cor vem da capa e a espessura segue o número de páginas. Livros sem capa têm cor provisória.
      </p>
    </main>
  )
}
