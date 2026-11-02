import { Link } from 'react-router-dom'

export function EmBreve({ titulo, etapa }: { titulo: string; etapa: string }) {
  return (
    <main className="wrap embreve">
      <h1>{titulo}</h1>
      <p className="muted">Esta tela será construída na etapa de {etapa}.</p>
      <Link className="btn btn2" to="/estante">
        Ir para a Estante
      </Link>
    </main>
  )
}
