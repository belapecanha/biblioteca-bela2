import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Posse, Status } from '@shared/api'
import { GENEROS, MOODS, TEMAS, type TipoClassificacao } from '@shared/classificacoes'
import { Capa, CartaoLivro, Estado } from '../componentes/Capa'
import { Estrelas } from '../componentes/Estrelas'
import { NOME_STATUS, useAcoesLivro, useLivro, useLivros } from '../dados'
import { RegistroLeitura } from '../componentes/RegistroLeitura'
import { linkPais } from './Autoria'

const CLASSES: [TipoClassificacao, string, readonly string[], 'generos' | 'temas' | 'moods'][] = [
  ['genero', 'Gênero', GENEROS, 'generos'],
  ['tema', 'Tema', TEMAS, 'temas'],
  ['mood', 'Mood', MOODS, 'moods']
]

export function Livro() {
  const id = Number(useParams().id)
  const consulta = useLivro(id)
  const todos = useLivros()
  const acoes = useAcoesLivro()
  const [editando, setEditando] = useState(false)

  const livro = consulta.data
  if (!livro) {
    if (consulta.data === null) {
      return (
        <main className="wrap embreve">
          <h1>Livro não encontrado</h1>
          <Link className="btn btn2" to="/livros">Ver todos os livros</Link>
        </main>
      )
    }
    return <Estado carregando={consulta.isLoading} erro={consulta.isError} aoTentar={() => void consulta.refetch()} />
  }

  const lista = todos.data ?? []
  const daSerie = livro.serie ? lista.filter((l) => l.serie?.id === livro.serie!.id && l.id !== id).sort((a, b) => (a.volume ?? 0) - (b.volume ?? 0)) : []
  const principal = livro.autores[0]
  const doAutor = principal
    ? lista.filter((l) => l.id !== id && l.autores.some((a) => a.id === principal.id) && l.serie?.id !== livro.serie?.id)
    : []
  const dados = [
    livro.paginas ? `${livro.paginas}${livro.paginasEstimadas ? ' páginas (estimadas)' : ' páginas'}` : null,
    livro.formato === 'ebook' ? 'E-book' : livro.formato === 'fisico' ? 'Físico' : livro.formato === 'audiolivro' ? 'Audiolivro' : null,
    livro.isbn13 ? `ISBN ${livro.isbn13}` : null
  ].filter(Boolean) as string[]
  const lugares = [
    ...(livro.editora ? [{ texto: livro.editora.nome, para: `/editora/${livro.editora.id}`, rotulo: `Editora ${livro.editora.nome}` }] : []),
    ...[...new Set([livro.paisEditora, ...livro.autores.map((a) => a.pais)].filter((p): p is string => !!p))]
      .map((p) => ({ texto: p, para: linkPais(p), rotulo: `País ${p}` }))
  ]

  const alternar = (tipo: TipoClassificacao, atuais: string[], nome: string) =>
    acoes.classificacoes.mutate({
      id,
      tipo,
      nomes: atuais.includes(nome) ? atuais.filter((n) => n !== nome) : [...atuais, nome]
    })

  return (
    <>
      <header className="hero hero-livro">
        {livro.capa && <img className="fundo-capa" src={livro.capa} alt="" />}
        <div className="veu" />
      </header>
      <main className="wrap ficha">
        <aside className="ficha-lado">
          <Capa livro={livro} grande />
          <Link className="btn btn2" to={`/livro/${id}/editar`}>Editar dados e capa</Link>
          <div className="card coluna">
            {livro.status === 'quero_ler' ? (
              <p className="peq muted sem-margem">A nota fica disponível quando você começar a leitura.</p>
            ) : (
              <div>
                <span className="rot">Sua nota</span>
                <Estrelas grande nota={livro.nota} aoMudar={(nota) => acoes.nota.mutate({ id, nota })} />
                <p className="peq muted sem-margem">
                  {livro.nota ? `${String(livro.nota).replace('.', ',')} de 5. Clique de novo para apagar.` : 'Clique na metade da estrela para meia nota.'}
                </p>
              </div>
            )}
            <div>
              <label className="rot" htmlFor="status">Status</label>
              <select id="status" className="campo larga" value={livro.status} onChange={(e) => acoes.status.mutate({ id, status: e.target.value as Status })}>
                {Object.entries(NOME_STATUS).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="rot" htmlFor="posse">Na minha estante</label>
              <select
                id="posse"
                className="campo larga"
                value={livro.posse ?? ''}
                onChange={(e) => acoes.posse.mutate({ ids: [id], posse: (e.target.value || null) as Posse | null })}
              >
                <option value="">A definir</option>
                <option value="tenho">Tenho</option>
                <option value="nao_tenho">Não tenho</option>
                <option value="ja_tive">Já tive</option>
              </select>
            </div>
            {(acoes.status.isError || acoes.nota.isError || acoes.posse.isError || acoes.classificacoes.isError) && (
              <p className="erro peq sem-margem" role="alert">Não foi possível salvar. Tente de novo.</p>
            )}
          </div>
        </aside>
        <div className="ficha-corpo">
          <section>
            <h1 className="titulo-grande">{livro.titulo}</h1>
            {livro.tituloOriginal && <p className="muted sem-margem">{livro.tituloOriginal}</p>}
            <p className="sub">
              {livro.autores.length > 0 && 'de '}
              {livro.autores.map((a, i) => (
                <span key={a.id}>
                  {i > 0 && ', '}
                  <Link className="link" to={`/autor/${a.id}`}>{a.nome}</Link>
                </span>
              ))}
              {livro.anoPublicacao && <span className="muted"> ({livro.anoPublicacao})</span>}
            </p>
            {livro.serie && (
              <p className="sem-margem">
                <Link className="link" to={`/serie/${livro.serie.id}`}>
                  {livro.serie.nome}{livro.volume ? `, volume ${String(livro.volume).replace('.', ',')}` : ''}
                </Link>
              </p>
            )}
            <p className="sinopse">{livro.sinopse ?? 'Sinopse ainda não cadastrada.'}</p>
            <div className="linha">
              {dados.map((d) => <span className="chip" key={d}>{d}</span>)}
              {lugares.map((l) => <Link className="chip chip-link" key={l.para} to={l.para} aria-label={l.rotulo}>{l.texto}</Link>)}
            </div>
          </section>

          <section>
            <div className="sec">
              <h2>Classificação</h2>
              <button type="button" className="btn btn2" aria-pressed={editando} onClick={() => setEditando(!editando)}>
                {editando ? 'Concluir' : 'Editar classificação'}
              </button>
            </div>
            <div className="coluna">
              {CLASSES.map(([tipo, rotulo, permitidos, campo]) => {
                const atuais = livro[campo]
                return (
                  <div key={tipo}>
                    <span className="rot">{rotulo}</span>
                    <div className="linha">
                      {editando
                        ? permitidos.map((nome) => (
                            <button
                              type="button"
                              key={nome}
                              className={atuais.includes(nome) ? 'btn btn2 pequeno on' : 'btn btn2 pequeno'}
                              aria-pressed={atuais.includes(nome)}
                              onClick={() => alternar(tipo, atuais, nome)}
                            >
                              {nome}
                            </button>
                          ))
                        : atuais.map((nome) => <span className="chip" key={nome}>{nome}</span>)}
                      {!editando && !atuais.length && <span className="muted peq">Nenhum</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <RegistroLeitura key={id} livro={livro} />

          {daSerie.length > 0 && (
            <section>
              <div className="sec"><h2>Nesta série</h2></div>
              <div className="grade">{daSerie.map((l) => <CartaoLivro key={l.id} livro={l} />)}</div>
            </section>
          )}
          {doAutor.length > 0 && principal && (
            <section>
              <div className="sec"><h2>Mais de {principal.nome}</h2></div>
              <div className="grade">{doAutor.slice(0, 12).map((l) => <CartaoLivro key={l.id} livro={l} />)}</div>
            </section>
          )}
        </div>
      </main>
    </>
  )
}
