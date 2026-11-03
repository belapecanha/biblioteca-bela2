import { Link, useParams } from 'react-router-dom'
import type { Autor, LivroResumo } from '@shared/api'
import { Capa, CartaoLivro, Estado } from '../componentes/Capa'
import { contar, useLivros } from '../dados'
import { Voltar } from '../componentes/Voltar'

export type TipoPagina = 'autor' | 'serie' | 'editora' | 'pais'
const ROTULO: Record<TipoPagina, string> = { autor: 'Autoria', serie: 'Série', editora: 'Editora', pais: 'País' }

export const linkPais = (pais: string) => `/pais/${encodeURIComponent(pais)}`

function Autores({ autores }: { autores: Autor[] }) {
  return <>{autores.map((a, i) => <span key={a.id}>{i > 0 && ', '}<Link className="link" to={`/autor/${a.id}`}>{a.nome}</Link></span>)}</>
}

export function Autoria({ tipo }: { tipo: TipoPagina }) {
  const parametro = useParams()
  const id = Number(parametro.id)
  const pais = parametro.nome ?? ''
  const consulta = useLivros()
  if (!consulta.data) return <Estado carregando={consulta.isLoading} erro={consulta.isError} aoTentar={() => void consulta.refetch()} />

  const todos = consulta.data
  const publicadoNoPais = (l: LivroResumo) => l.paisEditora === pais
  const autoriaDoPais = (l: LivroResumo) => l.autores.some((a) => a.pais === pais)
  const pertence: Record<TipoPagina, (l: LivroResumo) => boolean> = {
    autor: (l) => l.autores.some((a) => a.id === id),
    serie: (l) => l.serie?.id === id,
    editora: (l) => l.editora?.id === id,
    pais: (l) => publicadoNoPais(l) || autoriaDoPais(l)
  }
  const porSerie = (a: LivroResumo, b: LivroResumo) =>
    (a.serie?.nome ?? 'zzz').localeCompare(b.serie?.nome ?? 'zzz', 'pt-BR') || (a.volume ?? 0) - (b.volume ?? 0) || a.titulo.localeCompare(b.titulo, 'pt-BR')
  const livros = todos.filter(pertence[tipo]).sort(tipo === 'serie' ? (a, b) => (a.volume ?? 0) - (b.volume ?? 0) : porSerie)

  if (!livros.length) {
    return (
      <main className="wrap embreve">
        <h1>Nada encontrado</h1>
        <Link className="btn btn2" to="/livros">Ver todos os livros</Link>
      </main>
    )
  }

  const autor = tipo === 'autor' ? livros[0].autores.find((a) => a.id === id)! : null
  const nome = { autor: autor?.nome, serie: livros[0].serie?.nome, editora: livros[0].editora?.nome, pais }[tipo]!
  const lidos = livros.filter((l) => l.status === 'lido')
  const notas = lidos.flatMap((l) => (l.nota ? [l.nota] : []))
  const media = notas.length ? (notas.reduce((a, b) => a + b, 0) / notas.length).toFixed(1).replace('.', ',') : '-'
  const paginas = lidos.reduce((s, l) => s + (l.paginas ?? 0), 0)
  const series = tipo === 'serie'
    ? []
    : [...new Map(livros.flatMap((l) => (l.serie ? [[l.serie.id, l.serie] as const] : []))).values()].map((s) => {
        const volumes = todos.filter((l) => l.serie?.id === s.id)
        return { ...s, total: volumes.length, lidos: volumes.filter((l) => l.status === 'lido').length }
      }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  // Na página de autor, quem escreveu junto aparece como coautoria. Na de país, só a autoria
  // daquela nacionalidade: um livro publicado lá não torna o autor de lá.
  const entraNaLista = (a: Autor) => (tipo === 'autor' ? a.id !== id : tipo === 'pais' ? a.pais === pais : true)
  const autores = contar(livros.flatMap((l) => l.autores.filter(entraNaLista).map((a) => String(a.id))))
    .map(([chave, q]) => ({ ...todos.flatMap((l) => l.autores).find((a) => String(a.id) === chave)!, q }))
  // Na de país, só editoras daquele país, pelo mesmo motivo da autoria.
  const editoras = tipo === 'editora' ? [] : contar(livros.flatMap((l) => (l.editora && (tipo !== 'pais' || l.paisEditora === pais) ? [String(l.editora.id)] : [])))
    .map(([chave, q]) => ({ ...todos.find((l) => String(l.editora?.id) === chave)!.editora!, q }))
  const distribuicao = contar(notas.map(String)).sort((a, b) => Number(b[0]) - Number(a[0]))
  const comCapa = livros.filter((l) => l.miniatura)
  const paisDaEditora = tipo === 'editora' ? livros[0].paisEditora : null
  const grade = (lista: LivroResumo[]) => <div className="grade">{lista.map((l) => <CartaoLivro key={l.id} livro={l} />)}</div>

  return (
    <>
      <header className="hero">
        <div className="mosaico" aria-hidden="true">
          {comCapa.length > 0 && Array.from({ length: 12 }, (_, i) => <Capa key={i} livro={comCapa[i % comCapa.length]} />)}
        </div>
        <div className="veu" />
        <div className="wrap hero-c">
          <div>
            <Voltar />
            <p className="link">{ROTULO[tipo]}</p>
            <h1 className="titulo-grande">{nome}</h1>
            {tipo === 'serie' && <p className="sub">de <Autores autores={autores} /></p>}
            {autor?.pais && <p className="sub"><Link className="link" to={linkPais(autor.pais)}>{autor.pais}</Link></p>}
            {paisDaEditora && <p className="sub"><Link className="link" to={linkPais(paisDaEditora)}>{paisDaEditora}</Link></p>}
          </div>
          <dl className="numeros">
            <div><dd className="num">{livros.length}</dd><dt className="peq muted">{tipo === 'serie' ? 'volumes cadastrados' : 'livros'}</dt></div>
            <div><dd className="num">{lidos.length}</dd><dt className="peq muted">lidos</dt></div>
            <div><dd className="num">{paginas.toLocaleString('pt-BR')}</dd><dt className="peq muted">páginas</dt></div>
            <div><dd className="num">{media}</dd><dt className="peq muted">nota média</dt></div>
          </dl>
        </div>
      </header>
      <main className="wrap pagina">
        {distribuicao.length > 0 && (
          <section>
            <div className="sec"><h2>Suas notas</h2></div>
            <div className="linha">
              {distribuicao.map(([nota, q]) => (
                <span className="chip" key={nota}>{nota.replace('.', ',')} ★: {q}</span>
              ))}
            </div>
          </section>
        )}
        {tipo !== 'serie' && autores.length > 0 && (
          <section>
            <div className="sec"><h2>{tipo === 'autor' ? 'Coautoria' : 'Autoria'}</h2></div>
            <div className="linha">
              {autores.map((a) => <Link key={a.id} className="btn btn2" to={`/autor/${a.id}`}>{a.nome} · {a.q}</Link>)}
            </div>
          </section>
        )}
        {editoras.length > 0 && (
          <section>
            <div className="sec"><h2>Editoras</h2></div>
            <div className="linha">
              {editoras.map((e) => <Link key={e.id} className="btn btn2" to={`/editora/${e.id}`}>{e.nome} · {e.q}</Link>)}
            </div>
          </section>
        )}
        {series.length > 0 && (
          <section>
            <div className="sec"><h2>Séries</h2></div>
            <div className="cartoes">
              {series.map((s) => (
                <Link key={s.id} className="card" to={`/serie/${s.id}`}>
                  <strong className="card-titulo">{s.nome}</strong>
                  <span className="peq muted">{s.lidos} de {s.total} volumes cadastrados lidos</span>
                </Link>
              ))}
            </div>
          </section>
        )}
        {tipo === 'pais' ? (
          <>
            {livros.some(publicadoNoPais) && <section><div className="sec"><h2>Publicados em {pais}</h2><span className="muted peq">{livros.filter(publicadoNoPais).length}</span></div>{grade(livros.filter(publicadoNoPais))}</section>}
            {livros.some(autoriaDoPais) && <section><div className="sec"><h2>Autoria de {pais}</h2><span className="muted peq">{livros.filter(autoriaDoPais).length}</span></div>{grade(livros.filter(autoriaDoPais))}</section>}
          </>
        ) : (
          <section>
            <div className="sec"><h2>{tipo === 'serie' ? 'Volumes' : 'Livros na sua biblioteca'}</h2></div>
            {grade(livros)}
          </section>
        )}
      </main>
    </>
  )
}
