import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { PainelPerfil } from '@shared/api'
import { Capa, CartaoLivro, Estado } from '../componentes/Capa'
import { Campo, ErroFormulario } from '../componentes/Formulario'
import { moverItem, SelecionarLivros } from '../componentes/SelecionarLivros'
import { hoje, useLivros, usePainelPerfil, useSalvar } from '../dados'

export function Perfil() {
  const ano = new Date().getFullYear()
  const consulta = usePainelPerfil(ano)
  if (!consulta.data) return <Estado carregando={consulta.isLoading} erro={consulta.isError} aoTentar={() => void consulta.refetch()} />
  return <ConteudoPerfil painel={consulta.data} ano={ano} />
}
function Lendo({ leitura }: { leitura: PainelPerfil['lendo'][number] }) {
  const [pagina, setPagina] = useState(String(leitura.pagina ?? ''))
  const salvar = useSalvar((pagina: number) => window.bela.leituras.progresso(leitura.livro.id, leitura.leituraId, hoje(), pagina))
  async function enviar(e: FormEvent) { e.preventDefault(); salvar.mutate(Number(pagina)) }
  const l = leitura.livro
  return <article className="card lendo-card"><Link to={`/livro/${l.id}`}><Capa livro={l} /></Link><div className="coluna"><div><Link className="link" to={`/livro/${l.id}`}><h3>{l.titulo}</h3></Link><p className="muted peq sem-margem">{l.autores.map((a) => a.nome).join(', ')}</p></div><form className="coluna" onSubmit={enviar}><Campo rotulo={`Página atual de ${l.titulo}`} type="number" required min={0} max={l.paginas ?? 1000000} value={pagina} onChange={(e) => { setPagina(e.target.value); salvar.reset() }} /><div className="linha"><span className="muted peq">{l.paginas ? `de ${l.paginas} páginas${leitura.pagina !== null ? ` · ${Math.round(leitura.pagina / l.paginas * 100)}%` : ''}` : 'Total de páginas não informado'}</span><button className="btn btn2 pequeno" disabled={salvar.isPending}>Salvar progresso</button></div><ErroFormulario erro={salvar.error} />{salvar.isSuccess && <span className="sucesso peq" role="status">Página salva para hoje.</span>}</form></div></article>
}
function MetaPerfil({ ano, meta, concluidas }: { ano: number; meta: number | null; concluidas: number }) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(meta === null ? '' : String(meta))
  const salvar = useSalvar((valor: number | null) => window.bela.analise.definirMeta(ano, valor))
  const fim = new Date(ano, 11, 31, 12)
  const dias = Math.max(0, Math.ceil((fim.getTime() - new Date().getTime()) / 86400000))
  return <section className="card meta-perfil coluna"><div className="cabeca"><h2>Meta de {ano}</h2><button className="btn btn2 pequeno" type="button" onClick={() => setEditando(!editando)}>{meta ? 'Editar' : 'Definir'}</button></div>{meta ? <><p className="meta-numero"><strong>{concluidas}</strong> de {meta}</p><progress max={meta} value={Math.min(meta, concluidas)} aria-label={`Progresso da meta de ${ano}`} /><p className="peq sem-margem">{concluidas >= meta ? 'Meta alcançada.' : `Faltam ${meta - concluidas} leituras em ${dias} dias.`}</p></> : <p className="muted sem-margem">Defina quantos livros deseja ler neste ano.</p>}{editando && <form className="coluna" onSubmit={(e) => { e.preventDefault(); salvar.mutate(valor ? Number(valor) : null, { onSuccess: () => setEditando(false) }) }}><Campo rotulo="Livros da meta anual" type="number" min={1} max={100000} value={valor} onChange={(e) => setValor(e.target.value)} /><span className="muted peq">Deixe vazio para remover a meta.</span><button className="btn" disabled={salvar.isPending}>Salvar meta do perfil</button><ErroFormulario erro={salvar.error} /></form>}</section>
}
function ConteudoPerfil({ painel: p, ano }: { painel: PainelPerfil; ano: number }) {
  const livros = useLivros()
  const [escolhendo, setEscolhendo] = useState(false)
  const [editandoFila, setEditandoFila] = useState(false)
  const favoritos = useSalvar((ids: number[]) => window.bela.perfil.favoritos(ids))
  const fila = useSalvar((ids: number[]) => window.bela.perfil.fila(ids))
  const seguintes = p.fila.slice(0, 5)
  const fundo = (livros.data ?? []).filter((l) => l.miniatura).slice(0, 24)
  const foto = p.perfil.foto
  return <>
    <header className="hero perfil-hero">{p.perfil.topo ? <img className="perfil-topo" src={p.perfil.topo} alt="" /> : <div className="mosaico" aria-hidden="true">{fundo.map((l) => <Capa key={l.id} livro={l} />)}</div>}<div className="veu" /><div className="wrap hero-c perfil-cabeca"><div className="perfil-identidade">{foto ? <img className="perfil-avatar" src={foto} alt={`Foto de ${p.perfil.nome}`} /> : <span className="perfil-avatar" aria-hidden="true">{p.perfil.nome[0]?.toLocaleUpperCase()}</span>}<div><h1>{p.perfil.nome}</h1>{p.perfil.frase && <p className="perfil-frase">{p.perfil.frase}</p>}<Link className="link peq" to="/configuracoes">Editar perfil</Link></div></div><dl className="numeros">{[[p.numeros.lidos, 'lidos'], [p.numeros.noAno, `em ${ano}`], [p.numeros.paginas.toLocaleString('pt-BR'), 'páginas'], [p.numeros.series, 'séries'], [p.numeros.listas, 'listas']].map(([n, rotulo]) => <div key={rotulo}><dt className="num">{n}</dt><dd className="muted peq">{rotulo}</dd></div>)}</dl></div></header>
    <main className="wrap perfil-layout"><div className="coluna perfil-principal">
      <section className="coluna"><div className="sec"><h2>Favoritos</h2><button className="btn btn2" type="button" onClick={() => setEscolhendo(!escolhendo)}>Escolher favoritos</button></div>
        {escolhendo && <SelecionarLivros titulo="Escolher os quatro favoritos" livros={(livros.data ?? []).filter((l) => l.status === 'lido')} iniciais={p.favoritos.map((l) => l.id)} limite={4} ordenavel salvando={favoritos.isPending} erro={favoritos.error} aoFechar={() => setEscolhendo(false)} aoSalvar={(ids) => favoritos.mutate(ids, { onSuccess: () => setEscolhendo(false) })} />}
        <div className="perfil-favoritos">{p.favoritos.map((l) => <Link key={l.id} to={`/livro/${l.id}`} aria-label={`Favorito: ${l.titulo}`}><Capa livro={l} /></Link>)}{Array.from({ length: 4 - p.favoritos.length }, (_, i) => <button key={`vazio-${i}`} type="button" className="favorito-vazio" onClick={() => setEscolhendo(true)}><span>+</span>Escolher favorito</button>)}</div>
      </section>
      <section><div className="sec"><h2>Lendo agora</h2></div><div className="lendo-grade">{p.lendo.map((l) => <Lendo key={l.leituraId} leitura={l} />)}</div>{!p.lendo.length && <p className="muted">Nenhuma leitura em andamento. Abra um livro para começar.</p>}</section>
      <section className="coluna"><div className="sec"><h2>Próximas leituras da meta</h2><button className="btn btn2 pequeno" type="button" onClick={() => setEditandoFila(!editandoFila)}>Organizar fila</button></div>
        {editandoFila && <SelecionarLivros titulo="Escolher próximas leituras" livros={(livros.data ?? []).filter((l) => l.status === 'quero_ler')} iniciais={p.fila.map((l) => l.id)} salvando={fila.isPending} erro={fila.error} aoFechar={() => setEditandoFila(false)} aoSalvar={(ids) => fila.mutate(ids, { onSuccess: () => setEditandoFila(false) })} />}
        {!!seguintes.length && <p className="muted peq sem-margem">Lendo estes {seguintes.length} livros ({seguintes.reduce((s, l) => s + (l.paginas ?? 0), 0).toLocaleString('pt-BR')} páginas conhecidas), você chega a {p.numeros.noAno + seguintes.length}{p.meta ? ` de ${p.meta}` : ''} na meta de {ano}.</p>}
        <div className="fila-meta">{seguintes.map((l, i) => <article className="card fila-meta-livro" key={l.id}><span className="num">{i + 1}</span><Link to={`/livro/${l.id}`}><Capa livro={l} /></Link><div><Link className="link" to={`/livro/${l.id}`}>{l.titulo}</Link><span className="muted peq">{l.paginas ? `${l.paginas} páginas` : 'Sem páginas'}</span></div><div className="coluna"><button type="button" className="btn btn2 pequeno" aria-label={`Subir na fila: ${l.titulo}`} disabled={!i || fila.isPending} onClick={() => fila.mutate(moverItem(p.fila.map((x) => x.id), i, -1))}>Subir</button><button type="button" className="btn btn2 pequeno" aria-label={`Descer na fila: ${l.titulo}`} disabled={i === p.fila.length - 1 || fila.isPending} onClick={() => fila.mutate(moverItem(p.fila.map((x) => x.id), i, 1))}>Descer</button></div></article>)}</div>
        {!p.fila.length && <p className="muted">Escolha livros com status Quero ler para montar sua fila.</p>}{p.fila.length > 5 && <p className="muted peq sem-margem">Mostrando as cinco próximas leituras de {p.fila.length} na fila.</p>}<ErroFormulario erro={fila.error} />
      </section>
      <section><div className="sec"><h2>Atividade recente</h2><Link className="link peq" to="/diario">Ver diário</Link></div><div className="perfil-atividade">{p.atividade.map((a, i) => <CartaoLivro key={`${a.livro.id}-${i}`} livro={{ ...a.livro, nota: a.nota, status: 'lido' }} />)}</div>{!p.atividade.length && <p className="muted">As leituras concluídas aparecerão aqui.</p>}</section>
      <section><div className="sec"><h2>Séries em andamento</h2></div><div className="cartoes">{p.series.map((s) => <Link className="card" key={s.id} to={`/serie/${s.id}`}><strong>{s.nome}</strong><p className="muted peq sem-margem">{s.lidos} de {s.cadastrados} volumes cadastrados lidos{s.total !== null ? ` · ${s.total} volumes na série` : ''}</p></Link>)}</div>{!p.series.length && <p className="muted">Nenhuma série com volumes pendentes na biblioteca.</p>}</section>
    </div><aside className="perfil-lado coluna"><MetaPerfil key={p.meta ?? 'sem-meta'} ano={ano} meta={p.meta} concluidas={p.numeros.noAno} /><section><div className="sec"><h2>Diário</h2></div><div className="perfil-diario">{p.atividade.map((a, i) => <Link key={`${a.livro.id}-${i}`} to={`/livro/${a.livro.id}`}><span className="muted peq">{a.data ? new Date(`${a.data}T12:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : a.ano ? `${a.ano} · sem dia` : 'Sem data'}</span><strong>{a.livro.titulo}</strong></Link>)}</div>{!p.atividade.length && <p className="muted peq">Ainda sem leituras registradas.</p>}</section></aside></main>
  </>
}
