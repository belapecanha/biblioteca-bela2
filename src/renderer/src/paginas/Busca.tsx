import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CartaoLivro, Estado } from '../componentes/Capa'
import { normalizar, useLivros } from '../dados'
import { linkPais } from './Autoria'

export function Busca() {
  const [parametros] = useSearchParams()
  const q = parametros.get('q') ?? ''
  const consulta = useLivros()
  const termo = normalizar(q.trim())

  const resultado = useMemo(() => {
    const livros = consulta.data ?? []
    if (termo.length < 2) return null
    const tem = (texto: string | null | undefined) => !!texto && normalizar(texto).includes(termo)
    const unicos = <T extends { id: number }>(lista: T[]) => [...new Map(lista.map((x) => [x.id, x])).values()]
    return {
      autores: unicos(livros.flatMap((l) => l.autores)).filter((a) => tem(a.nome)),
      series: unicos(livros.flatMap((l) => (l.serie ? [l.serie] : []))).filter((s) => tem(s.nome)),
      editoras: unicos(livros.flatMap((l) => (l.editora ? [l.editora] : []))).filter((e) => tem(e.nome)),
      paises: [...new Set(livros.flatMap((l) => [l.paisEditora, ...l.autores.map((a) => a.pais)]).filter((p): p is string => !!p))].filter(tem).sort(),
      livros: livros.filter((l) => tem(l.titulo) || tem(l.tituloOriginal) || l.autores.some((a) => tem(a.nome)) || tem(l.serie?.nome))
    }
  }, [consulta.data, termo])

  if (!consulta.data) return <Estado carregando={consulta.isLoading} erro={consulta.isError} aoTentar={() => void consulta.refetch()} />

  const vazio = resultado && !resultado.autores.length && !resultado.series.length && !resultado.editoras.length && !resultado.paises.length && !resultado.livros.length

  return (
    <main className="wrap pagina">
      <h1>Buscar</h1>
      {!resultado && <p className="muted">Digite pelo menos duas letras na busca lá em cima.</p>}
      {vazio && <p className="muted">Nada encontrado para "{q}".</p>}
      {!!resultado?.autores.length && (
        <section>
          <div className="sec"><h2>Autoria</h2></div>
          <div className="linha">
            {resultado.autores.map((a) => (
              <Link key={a.id} className="btn btn2" to={`/autor/${a.id}`}>{a.nome}</Link>
            ))}
          </div>
        </section>
      )}
      {!!resultado?.series.length && (
        <section>
          <div className="sec"><h2>Séries</h2></div>
          <div className="linha">
            {resultado.series.map((s) => (
              <Link key={s.id} className="btn btn2" to={`/serie/${s.id}`}>{s.nome}</Link>
            ))}
          </div>
        </section>
      )}
      {!!resultado?.editoras.length && (
        <section>
          <div className="sec"><h2>Editoras</h2></div>
          <div className="linha">
            {resultado.editoras.map((e) => (
              <Link key={e.id} className="btn btn2" to={`/editora/${e.id}`}>{e.nome}</Link>
            ))}
          </div>
        </section>
      )}
      {!!resultado?.paises.length && (
        <section>
          <div className="sec"><h2>Países</h2></div>
          <div className="linha">
            {resultado.paises.map((p) => (
              <Link key={p} className="btn btn2" to={linkPais(p)}>{p}</Link>
            ))}
          </div>
        </section>
      )}
      {!!resultado?.livros.length && (
        <section>
          <div className="sec"><h2>Livros</h2><span className="muted peq">{resultado.livros.length}</span></div>
          <div className="grade">
            {resultado.livros.map((l) => <CartaoLivro key={l.id} livro={l} />)}
          </div>
        </section>
      )}
    </main>
  )
}
