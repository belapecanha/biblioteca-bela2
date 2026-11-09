import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/cormorant-garamond/600.css'
import '@fontsource/cormorant-garamond/600-italic.css'
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-sans/600.css'
import './estilos/tokens.css'
import './estilos/app.css'
import { App } from './App'

// Erros fora da renderização (eventos, promessas) também vão para o log do app.
window.addEventListener('error', (e) =>
  window.bela?.registrarErro(`Erro na interface: ${e.message}`, e.error instanceof Error ? e.error.stack : undefined)
)
window.addEventListener('unhandledrejection', (e) => {
  const motivo: unknown = e.reason
  window.bela?.registrarErro(
    `Promessa rejeitada na interface: ${motivo instanceof Error ? motivo.message : String(motivo)}`,
    motivo instanceof Error ? motivo.stack : undefined
  )
})

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
