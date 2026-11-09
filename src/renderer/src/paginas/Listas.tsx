import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { ListaDados, ListaDetalhe } from '@shared/api'
import { Capa, Estado } from '../componentes/Capa'
import { AreaTexto, Campo, ErroFormulario, Escolha } from '../componentes/Formulario'
import { moverItem, SelecionarLivros } from '../componentes/SelecionarLivros'
import { useListas, useLivros, useSalvar } from '../dados'

function FormLista({
  inicial,
  aoSalvar,
  aoCancelar
}: {
  inicial?: ListaDados
  aoSalvar: (id: number) => void
  aoCancelar?: () => void
}) {
  const [dados, setDados] = useState<ListaDados>(inicial ?? { nome: '', descricao: null, ordenada: false })
  const salvar = useSalvar((d: ListaDados) => window.bela.listas.salvar(d))
  async function enviar(e: FormEvent) {
    e.preventDefault()
    try {
      const id = await salvar.mutateAsync(dados)
      aoSalvar(id)
    } catch {
      /* Mantém os dados. */
    }
  }
  return (
    <form className="card coluna lista-form" onSubmit={enviar}>
      <h2>{inicial ? 'Editar lista' : 'Nova lista'}</h2>
      <div className="form-grid">
        <Campo
          rotulo="Nome da lista"
          required
          maxLength={200}
          value={dados.nome}
          onChange={(e) => setDados((d) => ({ ...d, nome: e.target.value }))}
        />
        <Escolha
          rotulo="Tipo da lista"
          valor={dados.ordenada ? 'ordenada' : 'livre'}
          aoMudar={(v) => setDados((d) => ({ ...d, ordenada: v === 'ordenada' }))}
          opcoes={[
            ['livre', 'Não ordenada'],
            ['ordenada', 'Ordenada']
          ]}
        />
      </div>
      <AreaTexto
        rotulo="Descrição da lista"
        valor={dados.descricao ?? ''}
        aoMudar={(v) => setDados((d) => ({ ...d, descricao: v || null }))}
        linhas={2}
      />
      <p className="muted peq sem-margem">
        Listas ordenadas têm posições escolhidas por você. As demais são exibidas por título.
      </p>
      <ErroFormulario erro={salvar.error} />
      <div className="linha">
        <button className="btn" disabled={salvar.isPending}>
          {inicial ? 'Salvar lista' : 'Criar lista'}
        </button>
        {aoCancelar && (
          <button className="btn btn2" type="button" onClick={aoCancelar}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}
export function Listas() {
  const consulta = useListas()
  const navegar = useNavigate()
  const [criando, setCriando] = useState(false)
  if (!consulta.data)
    return <Estado carregando={consulta.isLoading} erro={consulta.isError} aoTentar={() => void consulta.refetch()} />
  return (
    <main className="wrap pagina">
      <div className="cabeca">
        <div>
          <p className="sobretitulo">Coleções com a sua curadoria</p>
          <h1>Suas listas</h1>
        </div>
        <button className="btn" type="button" onClick={() => setCriando(!criando)}>
          Nova lista
        </button>
      </div>
      {criando && <FormLista aoSalvar={(id) => navegar(`/lista/${id}`)} aoCancelar={() => setCriando(false)} />}
      <div className="listas-grade">
        {consulta.data.map((l) => (
          <Link key={l.id} className="card lista-cartao" to={`/lista/${l.id}`}>
            <div className="lista-capas">
              {l.capas.length ? (
                l.capas.map((livro) => <Capa key={livro.id} livro={livro} />)
              ) : (
                <span className="muted">Sua próxima coleção começa aqui</span>
              )}
            </div>
            <h2>{l.nome}</h2>
            <p className="muted peq sem-margem">
              {l.total} {l.total === 1 ? 'livro' : 'livros'}, {l.ordenada ? 'ordenada' : 'não ordenada'}
            </p>
            {l.descricao && <p className="lista-descricao muted peq">{l.descricao}</p>}
          </Link>
        ))}
      </div>
      {!consulta.data.length && (
        <p className="muted">Crie uma lista para reunir livros de um tema ou escolher a ordem das próximas leituras.</p>
      )}
    </main>
  )
}
export function Lista() {
  const id = Number(useParams().id)
  const consulta = useQuery({ queryKey: ['listas', id], queryFn: () => window.bela.listas.obter(id) })
  if (consulta.data === null)
    return (
      <main className="wrap pagina">
        <h1>Lista não encontrada</h1>
        <Link className="btn btn2" to="/listas">
          Ver listas
        </Link>
      </main>
    )
  if (!consulta.data)
    return <Estado carregando={consulta.isLoading} erro={consulta.isError} aoTentar={() => void consulta.refetch()} />
  return <ConteudoLista key={id} lista={consulta.data} />
}
function ConteudoLista({ lista }: { lista: ListaDetalhe }) {
  const livros = useLivros()
  const navegar = useNavigate()
  const [adicionando, setAdicionando] = useState(false)
  const [editando, setEditando] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const adicionar = useSalvar((ids: number[]) => window.bela.listas.adicionar(lista.id, ids))
  const remover = useSalvar((id: number) => window.bela.listas.removerLivro(lista.id, id))
  const ordenar = useSalvar((ids: number[]) => window.bela.listas.ordenar(lista.id, ids))
  const excluir = useSalvar(() => window.bela.listas.excluir(lista.id))
  return (
    <main className="wrap pagina">
      <Link className="link peq" to="/listas">
        ← Suas listas
      </Link>
      <div className="cabeca">
        <div>
          <p className="sobretitulo">
            {lista.ordenada ? 'Uma ordem escolhida por você' : 'Uma coleção da sua biblioteca'}
          </p>
          <h1>{lista.nome}</h1>
          <p className="muted sem-margem">
            {lista.total} livros · {lista.ordenada ? 'ordenada' : 'não ordenada'}
          </p>
        </div>
        <div className="linha">
          <button className="btn btn2" type="button" onClick={() => setEditando(!editando)}>
            Editar lista
          </button>
          <button className="btn" type="button" onClick={() => setAdicionando(!adicionando)}>
            Adicionar livros
          </button>
        </div>
      </div>
      {lista.descricao && <p className="texto-preservado sem-margem">{lista.descricao}</p>}
      {editando && (
        <FormLista inicial={lista} aoSalvar={() => setEditando(false)} aoCancelar={() => setEditando(false)} />
      )}
      {adicionando && (
        <SelecionarLivros
          titulo="Adicionar livros à lista"
          livros={(livros.data ?? []).filter((l) => !lista.livros.some((v) => v.id === l.id))}
          salvando={adicionar.isPending}
          erro={adicionar.error}
          aoFechar={() => setAdicionando(false)}
          aoSalvar={(ids) => adicionar.mutate(ids, { onSuccess: () => setAdicionando(false) })}
        />
      )}
      <ErroFormulario erro={remover.error || ordenar.error || livros.error} />
      <div className="lista-livros">
        {lista.livros.map((l, i) => (
          <article className="card lista-livro" key={l.id}>
            {lista.ordenada && <span className="lista-posicao">{i + 1}</span>}
            <Link className="lista-livro-capa" to={`/livro/${l.id}`}>
              <Capa livro={l} />
            </Link>
            <div>
              <Link className="link" to={`/livro/${l.id}`}>
                <h3>{l.titulo}</h3>
              </Link>
              <p className="muted peq">{l.autores.map((a) => a.nome).join(', ')}</p>
            </div>
            <div className="coluna lista-acoes">
              {lista.ordenada && (
                <div className="linha">
                  <button
                    className="btn btn2 pequeno"
                    type="button"
                    aria-label={`Subir ${l.titulo}`}
                    disabled={!i || ordenar.isPending}
                    onClick={() =>
                      ordenar.mutate(
                        moverItem(
                          lista.livros.map((x) => x.id),
                          i,
                          -1
                        )
                      )
                    }
                  >
                    Subir
                  </button>
                  <button
                    className="btn btn2 pequeno"
                    type="button"
                    aria-label={`Descer ${l.titulo}`}
                    disabled={i === lista.total - 1 || ordenar.isPending}
                    onClick={() =>
                      ordenar.mutate(
                        moverItem(
                          lista.livros.map((x) => x.id),
                          i,
                          1
                        )
                      )
                    }
                  >
                    Descer
                  </button>
                </div>
              )}
              <button
                className="btn btn2 pequeno"
                type="button"
                aria-label={`Retirar ${l.titulo} da lista`}
                disabled={remover.isPending}
                onClick={() => remover.mutate(l.id)}
              >
                Retirar da lista
              </button>
            </div>
          </article>
        ))}
      </div>
      {!lista.total && <p className="muted">Esta lista ainda não tem livros. Use Adicionar livros para começar.</p>}
      <footer className="lista-rodape">
        {excluindo ? (
          <div className="aviso coluna" role="alert">
            <p className="sem-margem">Excluir “{lista.nome}”? Os livros continuam na biblioteca.</p>
            <div className="linha">
              <button
                className="btn"
                type="button"
                disabled={excluir.isPending}
                onClick={() => excluir.mutate(undefined, { onSuccess: () => navegar('/listas') })}
              >
                Confirmar exclusão da lista
              </button>
              <button className="btn btn2" type="button" onClick={() => setExcluindo(false)}>
                Cancelar
              </button>
            </div>
            <ErroFormulario erro={excluir.error} />
          </div>
        ) : (
          <button className="btn btn2 pequeno" type="button" onClick={() => setExcluindo(true)}>
            Excluir lista
          </button>
        )}
      </footer>
    </main>
  )
}
