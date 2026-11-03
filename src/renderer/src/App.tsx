import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './componentes/Layout'
import { Autoria } from './paginas/Autoria'
import { Busca } from './paginas/Busca'
import { Estante } from './paginas/Estante'
import { Livro } from './paginas/Livro'
import { Livros } from './paginas/Livros'
import { Registrar } from './paginas/Registrar'
import { Diario } from './paginas/Diario'
import { Configuracoes } from './paginas/Configuracoes'
import { Perfil } from './paginas/Perfil'
import { Lista, Listas } from './paginas/Listas'
import { Estatisticas } from './paginas/Estatisticas'
import { ImagemRetrospectiva, Retrospectiva } from './paginas/Retrospectiva'

const cliente = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity } }
})

export function App() {
  return (
    <QueryClientProvider client={cliente}>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/estante" replace />} />
            <Route path="estante" element={<Estante />} />
            <Route path="livros" element={<Livros />} />
            <Route path="livro/:id" element={<Livro />} />
            <Route path="livro/:id/editar" element={<Registrar />} />
            <Route path="autor/:id" element={<Autoria tipo="autor" />} />
            <Route path="serie/:id" element={<Autoria key="serie" tipo="serie" />} />
            <Route path="editora/:id" element={<Autoria key="editora" tipo="editora" />} />
            <Route path="pais/:nome" element={<Autoria key="pais" tipo="pais" />} />
            <Route path="busca" element={<Busca />} />
            <Route path="perfil" element={<Perfil />} />
            <Route path="diario" element={<Diario />} />
            <Route path="listas" element={<Listas />} />
            <Route path="lista/:id" element={<Lista />} />
            <Route path="estatisticas" element={<Estatisticas />} />
            <Route path="registrar" element={<Registrar />} />
            <Route path="configuracoes" element={<Configuracoes />} />
          </Route>
          <Route path="retrospectiva" element={<Retrospectiva />} />
          <Route path="retrospectiva/imagem/:ano" element={<ImagemRetrospectiva />} />
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  )
}
