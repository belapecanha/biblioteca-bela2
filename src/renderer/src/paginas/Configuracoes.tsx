import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ErroFormulario } from '../componentes/Formulario'
import { Capa, Estado } from '../componentes/Capa'
import { usePerfilDados } from '../dados'
import { FormPerfil } from './configuracoes/Perfil'
import { Importacao } from './configuracoes/Importacao'
import { Arquivos, Espaco } from './configuracoes/Arquivos'

export function Configuracoes() {
  const estado = useQuery({
    queryKey: ['google-configuracao'],
    queryFn: () => window.bela.google.configuracao(),
    staleTime: 0
  })
  const perfil = usePerfilDados()
  const pendencias = useQuery({ queryKey: ['pendencias'], queryFn: () => window.bela.perfil.pendencias() })
  const [codigo, setCodigo] = useState<string | null>(null)
  if (!perfil.data)
    return <Estado carregando={perfil.isLoading} erro={perfil.isError} aoTentar={() => void perfil.refetch()} />
  const atual =
    pendencias.data?.find((p) => p.codigo === codigo) ??
    pendencias.data?.find((p) => p.livros.length) ??
    pendencias.data?.[0]
  return (
    <main className="wrap pagina">
      <h1>Configurações</h1>
      <div className="configuracoes-layout">
        <aside className="coluna configuracoes-lado">
          <FormPerfil perfil={perfil.data} />
          <Importacao />
          <Arquivos />
          <Espaco />
          <section className="card coluna configuracao-google">
            <h2>Google Books</h2>
            <p className="muted peq sem-margem">
              {estado.isPending
                ? 'Conferindo configuração…'
                : estado.data?.configurada
                  ? 'Chave encontrada no arquivo .env.'
                  : 'Nenhuma chave válida no arquivo .env.'}
            </p>
            <ErroFormulario erro={estado.error} />
            {estado.data && <p className="muted peq caminho-arquivo sem-margem">Arquivo: {estado.data.arquivo}</p>}
            <p className="muted peq sem-margem">
              Para trocar a chave, edite GOOGLE_BOOKS_API_KEY nesse arquivo. Ela vale na próxima busca, sem reiniciar o
              app.
            </p>
            <a
              className="link peq"
              href="https://developers.google.com/books/docs/v1/using#APIKey"
              target="_blank"
              rel="noreferrer"
            >
              Instruções do Google Books ↗
            </a>
          </section>
        </aside>
        <section className="pendencias coluna">
          <div className="sec">
            <h2>Pendências dos dados</h2>
            <span className="muted peq">
              {pendencias.data?.reduce((s, p) => s + p.livros.length, 0) ?? '…'} ajustes sugeridos
            </span>
          </div>
          <p className="muted peq sem-margem">
            Um livro pode aparecer em mais de uma categoria. Abra a ficha para revisar os dados.
          </p>
          <div className="linha">
            {pendencias.data?.map((p) => (
              <button
                className={`btn btn2 pequeno ${atual?.codigo === p.codigo ? 'on' : ''}`}
                aria-pressed={atual?.codigo === p.codigo}
                key={p.codigo}
                type="button"
                onClick={() => setCodigo(p.codigo)}
              >
                {p.rotulo} ({p.livros.length})
              </button>
            ))}
          </div>
          <ErroFormulario erro={pendencias.error} />
          {pendencias.isPending && <p className="muted">Conferindo seus livros…</p>}
          <div className="pendencias-livros grade">
            {atual?.livros.map((l) => (
              <Link key={l.id} className="livro" to={`/livro/${l.id}`}>
                <Capa livro={l} />
                <span className="livro-titulo">{l.titulo}</span>
              </Link>
            ))}
          </div>
          {atual && !atual.livros.length && <p className="muted">Nenhum livro com esta pendência.</p>}
        </section>
      </div>
    </main>
  )
}
