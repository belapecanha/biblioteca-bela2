import { useQuery } from '@tanstack/react-query'
import { ErroFormulario } from '../componentes/Formulario'

export function Configuracoes() {
  const estado = useQuery({ queryKey: ['google-configuracao'], queryFn: () => window.bela.google.configuracao(), staleTime: 0 })
  return <main className="wrap pagina"><div><p className="sobretitulo">Preferências da biblioteca</p><h1>Configurações</h1></div>
    <section className="card coluna configuracao-google"><h2>Google Books</h2><p className="muted sem-margem">Busque títulos, autores e edições para revisar antes de cadastrar. O cadastro manual funciona sem chave.</p>
      {estado.isPending ? <p className="muted">Carregando configuração…</p> : <p className="sem-margem" role="status">{estado.data?.configurada ? 'Chave encontrada no arquivo .env.' : 'Nenhuma chave válida no arquivo .env.'}</p>}
      <ErroFormulario erro={estado.error} />
      {estado.data && <p className="muted peq sem-margem texto-preservado">Arquivo: {estado.data.arquivo}</p>}
      <p className="muted peq sem-margem">Para trocar a chave, edite a linha GOOGLE_BOOKS_API_KEY nesse arquivo. Ela vale na próxima busca, sem reiniciar o app.</p>
      <details><summary>Como obter uma chave</summary><p>Crie uma chave de API em um projeto seu no Google Cloud e ative a Books API.</p><a className="link" href="https://developers.google.com/books/docs/v1/using#APIKey" target="_blank" rel="noreferrer">Instruções do Google Books ↗</a></details>
    </section>
    <section className="card coluna"><h2>Mais configurações</h2><p className="muted sem-margem">Perfil, importação, exportação e backups serão adicionados na etapa de organização.</p></section>
  </main>
}
