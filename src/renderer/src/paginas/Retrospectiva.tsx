import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { BaseAnalise, LivroAnalise } from '@shared/api'
import { calcular, cartoesRetrospectiva, comCapaPrimeiro, dec, filtrar, fmt, MESES_LONGOS } from '@shared/estatisticas'
import { Capa, Estado } from '../componentes/Capa'
import { coresDoLivro, mensagemErro, useAnalise } from '../dados'

const NOME_DA_DONA = 'Isabela'
const anosDe = (base: BaseAnalise) => [...new Set(base.livros.flatMap((l) => l.leituras.flatMap((x) => (x.ano === null ? [] : [x.ano]))))].sort((a, b) => b - a)
const inicial = (t: string) => t[0].toUpperCase() + t.slice(1)

export function Retrospectiva() {
  const consulta = useAnalise()
  if (!consulta.data) return <div className="bb"><Estado carregando={consulta.isLoading} erro={consulta.isError} aoTentar={() => void consulta.refetch()} /></div>
  return <Cartoes base={consulta.data} />
}

function Parede({ livros }: { livros: LivroAnalise[] }) {
  return <div className="parede">{comCapaPrimeiro(livros).sort((a, b) => Number(!!b.miniatura) - Number(!!a.miniatura) || (b.nota ?? 0) - (a.nota ?? 0)).map((l, i) => {
    const fundo = coresDoLivro(l).fundo
    const [d0, d1, d2] = l.miniatura ? [l.corPrincipal ?? '#2F3E4A', l.cor1 ?? fundo, l.cor2 ?? fundo] : ['#2F3E4A', fundo, fundo]
    return <Link key={l.id} className="par-i" to={`/livro/${l.id}`} title={l.titulo} aria-label={`${l.titulo}, de ${l.autores.map((a) => a.nome).join(', ')}`} style={{ animationDelay: `${Math.min(i, 24) * 40}ms` }}>
      <span className="diam" aria-hidden="true" style={{ background: d0, boxShadow: `0 0 0 9px ${d1}, 0 0 0 11px ${d0}, 0 0 0 16px ${d2}` }} />
      <Capa livro={l} />
    </Link>
  })}</div>
}

function Cartoes({ base }: { base: BaseAnalise }) {
  const [parametros] = useSearchParams()
  const navegar = useNavigate()
  const anos = anosDe(base)
  const pedido = Number(parametros.get('ano'))
  const [ano, setAno] = useState(anos.includes(pedido) ? pedido : (anos[0] ?? new Date().getFullYear()))
  const [i, setI] = useState(0)
  const [todos, setTodos] = useState(false)
  const recorte = useMemo(() => filtrar(base.livros, {}), [base])
  const S = useMemo(() => calcular(recorte, ano), [recorte, ano])
  const cartoes = useMemo(() => cartoesRetrospectiva(S, calcular(recorte, ano - 1), ano), [S, recorte, ano])
  const pos = Math.min(i, cartoes.length - 1)
  const c = cartoes[pos]
  const comCapa = S.R.filter((l) => l.miniatura)
  const fundo = comCapa.length ? Array.from({ length: 48 },(_, k) => comCapa[k % comCapa.length]) : []
  const naParede = todos ? base.livros.filter((l) => l.leituras.length > 0) : S.R

  return <div className="bb retro">
    <div className="mosaico" aria-hidden="true">{fundo.map((l, k) => <Capa key={k} livro={l} />)}</div>
    <div className="retro-veu" />
    <div className="retro-conteudo">
      <nav className="wrap topo-l" aria-label="Retrospectiva"><Link className="marca" to="/estante">Biblioteca Bela</Link><div className="dir"><label className="rot sem-margem" htmlFor="retro-ano">Ano</label><select id="retro-ano" className="campo" value={ano} onChange={(e) => { setAno(Number(e.target.value)); setI(0) }}>{anos.map((a) => <option key={a} value={a}>{a}</option>)}</select><Link className="btn btn2" to="/estatisticas">Fechar</Link></div></nav>
      <main className="wrap retro-principal">
        <div className="retro-barras" aria-hidden="true">{cartoes.map((_, k) => <i key={k} className={k <= pos ? 'on' : ''} />)}</div>
        <section className="retro-cartao" aria-live="polite">
          <div className="retro-texto"><p className="retro-sobre">{c.sobre}</p><h1>{inicial(c.grande)}</h1><p className="retro-frase">{c.texto}</p>{c.nota && <p className="peq muted">{c.nota}</p>}</div>
          <div className="retro-capas">{c.livros.map((l) => <Link key={l.id} className="livro" to={`/livro/${l.id}`} aria-label={l.titulo} title={l.titulo}><Capa livro={l} /></Link>)}</div>
        </section>
        <div className="linha retro-acoes"><button type="button" className="btn btn2" disabled={pos === 0} onClick={() => setI(pos - 1)}>Anterior</button><button type="button" className="btn" onClick={() => setI(pos === cartoes.length - 1 ? 0 : pos + 1)}>{pos === cartoes.length - 1 ? 'Rever' : 'Próximo'}</button><span className="muted peq">Cartão {pos + 1} de {cartoes.length}</span><button type="button" className="btn btn2 retro-salvar" onClick={() => navegar(`/retrospectiva/imagem/${ano}`)}>Salvar como imagem</button></div>
      </main>
      <section className="wrap retro-parede"><div className="sec"><h2>Todos os livros de {todos ? 'todos os anos' : ano}</h2><div className="linha"><button type="button" className={todos ? 'btn btn2' : 'btn btn2 on'} aria-pressed={!todos} onClick={() => setTodos(false)}>Deste ano</button><button type="button" className={todos ? 'btn btn2 on' : 'btn btn2'} aria-pressed={todos} onClick={() => setTodos(true)}>Todos os anos</button></div></div><Parede livros={naParede} /></section>
    </div>
  </div>
}

export function ImagemRetrospectiva() {
  const consulta = useAnalise()
  const { ano: anoTexto } = useParams()
  const [parametros] = useSearchParams()
  const captura = parametros.get('captura') === '1'
  const ano = Number(anoTexto)
  const [situacao, setSituacao] = useState<{ salvando?: boolean; salvo?: string; erro?: string }>({})
  const S = useMemo(() => (consulta.data ? calcular(filtrar(consulta.data.livros, {}), ano) : null), [consulta.data, ano])

  useEffect(() => {
    if (!S) return
    let ativo = true
    // A janela de captura só pode fotografar depois que fontes e capas terminarem de carregar.
    void (async () => {
      await document.fonts.ready
      await Promise.all([...document.images].map((img) => img.decode().catch(() => undefined)))
      if (ativo) document.documentElement.dataset.imagemPronta = '1'
    })()
    return () => { ativo = false; delete document.documentElement.dataset.imagemPronta }
  }, [S])

  if (!S) return <div className="bb"><Estado carregando={consulta.isLoading} erro={consulta.isError} aoTentar={() => void consulta.refetch()} /></div>
  const melhor = [...S.meses].sort((a, b) => b.q - a.q)[0]
  const comCapa = S.R.filter((l) => l.miniatura)
  const fundo = comCapa.length ? Array.from({ length: 16 }, (_, k) => comCapa[k % comCapa.length]) : []
  const favoritos = comCapaPrimeiro(S.R).sort((a, b) => Number(!!b.miniatura) - Number(!!a.miniatura) || (b.nota ?? 0) - (a.nota ?? 0)).slice(0, 5)
  const modelo = <div className="retro-imagem" data-testid="imagem-retrospectiva">
    <div className="retro-imagem-fundo" aria-hidden="true">{fundo.map((l, k) => <Capa key={k} livro={l} imediata />)}</div>
    <div className="retro-imagem-veu" aria-hidden="true" />
    <header><p>Biblioteca Bela</p><p>{NOME_DA_DONA}</p></header>
    <section className="retro-imagem-titulo"><p>Meu ano em livros, {ano}</p><h1>{S.n} {S.n === 1 ? 'livro' : 'livros'}</h1></section>
    <dl>
      <div><dd>{fmt(S.paginas)}</dd><dt>páginas</dt></div>
      <div><dd>{dec(S.media)} ★</dd><dt>nota média</dt></div>
      <div><dd>{S.cinco.length}</dd><dt>com 5 estrelas</dt></div>
      <div className="menor"><dd>{melhor.q ? inicial(MESES_LONGOS[melhor.i]) : 'Sem data'}</dd><dt>melhor mês</dt></div>
      <div className="menor"><dd>{S.generos[0]?.[0] ?? 'Sem gênero'}</dd><dt>gênero do ano</dt></div>
      <div className="menor"><dd>{S.autores[0]?.nome ?? 'Sem autoria'}</dd><dt>autoria mais lida</dt></div>
    </dl>
    <section className="retro-imagem-favoritos"><p>Os favoritos do ano</p><div>{favoritos.map((l) => <Capa key={l.id} livro={l} grande imediata />)}</div></section>
  </div>
  if (captura) return modelo

  async function salvar() {
    setSituacao({ salvando: true })
    try {
      const caminho = await window.bela.analise.salvarImagem(ano)
      setSituacao(caminho ? { salvo: caminho } : {})
    } catch (erro) {
      setSituacao({ erro: mensagemErro(erro) })
    }
  }
  return <div className="bb"><main className="wrap pagina retro-previa">
    <div className="cabeca"><div><p className="sobretitulo">1080 × 1350</p><h1>Imagem de {ano}</h1></div><div className="linha"><Link className="btn btn2" to={`/retrospectiva?ano=${ano}`}>Voltar</Link><button type="button" className="btn" disabled={situacao.salvando} onClick={() => void salvar()}>{situacao.salvando ? 'Salvando...' : 'Salvar imagem'}</button></div></div>
    {situacao.salvo && <p className="sucesso" role="status">Imagem salva em {situacao.salvo}</p>}
    {situacao.erro && <p className="erro" role="alert">{situacao.erro}</p>}
    <div className="retro-moldura">{modelo}</div>
  </main></div>
}
