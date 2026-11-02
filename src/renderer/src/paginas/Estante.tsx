import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import type { LivroResumo, Status } from '@shared/api'
import { Estado } from '../componentes/Capa'
import { Estrelas } from '../componentes/Estrelas'
import { coresDoLivro, NOME_STATUS, normalizar, numeroDoTexto, useAcoesLivro, useLivros } from '../dados'

function matiz(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  if (d < 0.06) return 400 + max
  return (max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60
}

const ORDENS: Record<string, (a: LivroResumo, b: LivroResumo) => number> = {
  titulo: (a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'),
  autor: (a, b) => (a.autores[0]?.nome ?? '').localeCompare(b.autores[0]?.nome ?? '', 'pt-BR'),
  ano: (a, b) => (b.anoLido ?? 0) - (a.anoLido ?? 0),
  nota: (a, b) => (b.nota ?? 0) - (a.nota ?? 0),
  paginas: (a, b) => (b.paginas ?? 0) - (a.paginas ?? 0),
  cor: (a, b) => matiz(coresDoLivro(a).fundo) - matiz(coresDoLivro(b).fundo)
}

const LARGURA_CARTAO = 300
const ESCALA_CAPA = 1.2

function medidas(l: LivroResumo) {
  const largura = Math.max(20, Math.min(52, Math.round(13 + (l.paginas ?? 250) / 30)))
  const altura = 166 + (numeroDoTexto(l.titulo) % 42)
  return { largura, altura, larguraCapa: Math.round((altura * 2) / 3) }
}

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

  const livros = useMemo(() => {
    const termo = normalizar(filtro.trim())
    return (consulta.data ?? [])
      .filter(
        (l) =>
          (mostrar === 'todos' || (mostrar === 'tenho' ? l.posse === 'tenho' : l.status === mostrar)) &&
          (!termo || normalizar(`${l.titulo} ${l.autores.map((a) => a.nome).join(' ')}`).includes(termo))
      )
      .sort(ORDENS[ordem])
  }, [consulta.data, ordem, mostrar, filtro])

  if (!consulta.data) return <Estado carregando={consulta.isLoading} erro={consulta.isError} aoTentar={() => void consulta.refetch()} />

  // O navegador não acerta o clique em faces 3D, então uma área plana cobre a capa depois de aberta.
  const medirCapa = (livro3d: HTMLElement) => {
    const capa = livro3d.querySelector('.capa3d')?.getBoundingClientRect()
    const vaga = livro3d.closest('.vaga')?.getBoundingClientRect()
    if (capa && vaga) {
      setAreaCapa({ left: capa.left - vaga.left, top: capa.top - vaga.top, width: capa.width, height: capa.height })
    }
  }

  const devolver = () => {
    setAreaCapa(null)
    clearTimeout(temporizador.current)
    setAberto((a) => (a ? { ...a, fase: 'volta' } : a))
    temporizador.current = window.setTimeout(() => setAberto(null), 650)
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
    setAberto({ id: livro.id, fase: 'sai', deslocamento: Math.min(0, Math.round(moveis.right - lombada.right - precisa)) })
  }

  return (
    <main className="wrap pagina">
      <div className="cabeca">
        <h1>Sua estante, <em>{livros.length} livros</em></h1>
        <div className="linha">
          <div>
            <label className="rot" htmlFor="e-filtro">Filtrar</label>
            <input id="e-filtro" className="campo" type="search" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
          </div>
          <div>
            <label className="rot" htmlFor="e-ordem">Ordenar por</label>
            <select id="e-ordem" className="campo" value={ordem} onChange={(e) => { setOrdem(e.target.value); setAberto(null) }}>
              <option value="titulo">Título</option>
              <option value="autor">Autor</option>
              <option value="ano">Ano lido</option>
              <option value="nota">Nota</option>
              <option value="paginas">Páginas</option>
              <option value="cor">Cor</option>
            </select>
          </div>
          <div>
            <label className="rot" htmlFor="e-mostrar">Mostrar</label>
            <select id="e-mostrar" className="campo" value={mostrar} onChange={(e) => { setMostrar(e.target.value as typeof mostrar); setAberto(null) }}>
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
      <div
        className="moveis"
        onKeyDown={(e) => {
          if (e.key === 'Escape' && aberto) devolver()
        }}
      >
        {livros.map((l) => {
          const m = medidas(l)
          const cores = coresDoLivro(l)
          const estaAberto = aberto?.id === l.id
          return (
            <div key={l.id} className={estaAberto ? 'vaga on' : 'vaga'} style={{ width: m.largura }}>
              <div className="desl" style={estaAberto ? { transform: `translateX(${aberto.deslocamento}px)` } : undefined}>
                <div
                  className={estaAberto ? `livro3d ${aberto.fase}` : 'livro3d'}
                  style={{ width: m.largura, height: m.altura }}
                  onAnimationEnd={(e) => {
                    if (e.target === e.currentTarget && e.animationName === 'bb-sai') medirCapa(e.currentTarget)
                  }}
                >
                  <button
                    type="button"
                    className="lombada"
                    title={l.titulo}
                    aria-label={`${l.titulo}, de ${l.autores.map((a) => a.nome).join(', ')}`}
                    aria-expanded={estaAberto}
                    onClick={(e) => clicar(l, e)}
                    style={{ background: cores.fundo, color: cores.texto }}
                  >
                    {l.titulo}
                  </button>
                  {estaAberto && (
                    <div
                      className="capa3d"
                      style={{ left: m.largura, width: m.larguraCapa, height: m.altura, background: cores.fundo, color: cores.texto }}
                    >
                      {l.capa ? <img src={l.capa} alt="" /> : l.titulo}
                    </div>
                  )}
                </div>
              </div>
              {estaAberto && aberto.fase === 'sai' && areaCapa && (
                <Link className="capa-clique" to={`/livro/${l.id}`} aria-label={`Abrir ficha de ${l.titulo}`} style={areaCapa} />
              )}
              {estaAberto && aberto.fase === 'sai' && (
                <aside className="ficha3d" aria-live="polite" style={{ left: m.largura + m.larguraCapa * ESCALA_CAPA + 14 + aberto.deslocamento }}>
                  <h3>{l.titulo}</h3>
                  <p className="peq muted cartao-meta">
                    {l.autores.map((a, i) => (
                      <span key={a.id}>
                        {i > 0 && ', '}
                        <Link className="link" to={`/autor/${a.id}`}>{a.nome}</Link>
                      </span>
                    ))}
                    {l.paginas ? `, ${l.paginas} páginas` : ''}
                    {l.anoLido ? `, lido em ${l.anoLido}` : `, ${NOME_STATUS[l.status].toLowerCase()}`}
                  </p>
                  {l.status !== 'quero_ler' && <Estrelas nota={l.nota} aoMudar={(nota) => acoes.nota.mutate({ id: l.id, nota })} />}
                  {l.serie && (
                    <p className="peq sem-margem">
                      <Link className="link" to={`/serie/${l.serie.id}`}>{l.serie.nome}</Link>
                    </p>
                  )}
                  <div className="linha">
                    <Link className="btn" to={`/livro/${l.id}`}>Abrir ficha</Link>
                    <button type="button" className="btn btn2" onClick={devolver}>Devolver</button>
                  </div>
                </aside>
              )}
            </div>
          )
        })}
      </div>
      <p className="muted peq sem-margem">A cor vem da capa e a espessura segue o número de páginas. Livros sem capa têm cor provisória.</p>
    </main>
  )
}
