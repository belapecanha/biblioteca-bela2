import { useEffect, useState } from 'react'
import type { EstadoApp } from '@shared/api'

export function App() {
  const [estado, setEstado] = useState<EstadoApp | null>(null)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    window.bela.estado().then(setEstado, () => setErro(true))
  }, [])

  return (
    <main className="inicio">
      <h1>Biblioteca Bela</h1>
      {erro && <p role="alert">Não foi possível abrir seus dados.</p>}
      {estado && (
        <p data-testid="estado">
          {estado.livros} livros e {estado.classificacoes} classificações. Versão {estado.versao}.
        </p>
      )}
    </main>
  )
}
