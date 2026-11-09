import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

// Um erro de renderização derrubaria a árvore inteira e deixaria a janela vazia,
// o que parece perda de dados. Aqui a tela mostra o que houve e o erro vai para o log.
export class LimiteErro extends Component<{ children: ReactNode; comLink?: boolean }, { erro: Error | null }> {
  state = { erro: null as Error | null }

  static getDerivedStateFromError(erro: Error) {
    return { erro }
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    window.bela?.registrarErro(
      `Erro ao exibir a tela: ${erro.message}`,
      `${erro.stack ?? ''}\n${info.componentStack ?? ''}`
    )
  }

  render() {
    if (!this.state.erro) return this.props.children
    return (
      <main className="wrap embreve" role="alert">
        <h1>Algo deu errado nesta tela</h1>
        <p className="muted">Seus dados estão salvos. O erro foi registrado no log da biblioteca.</p>
        <p className="muted peq caminho-arquivo">{this.state.erro.message}</p>
        <div className="linha">
          {this.props.comLink !== false && (
            <Link className="btn" to="/estante" onClick={() => this.setState({ erro: null })}>
              Voltar para a Estante
            </Link>
          )}
          <button type="button" className="btn btn2" onClick={() => this.setState({ erro: null })}>
            Tentar de novo
          </button>
        </div>
      </main>
    )
  }
}
