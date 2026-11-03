import { useNavigate } from 'react-router-dom'

// Volta para a tela anterior; aberta direto (sem histórico), vai para a lista de livros.
export function Voltar() {
  const navegar = useNavigate()
  const temHistorico = (window.history.state as { idx?: number } | null)?.idx
  return <button type="button" className="voltar" onClick={() => (temHistorico ? navegar(-1) : navegar('/livros'))}>← Voltar</button>
}
