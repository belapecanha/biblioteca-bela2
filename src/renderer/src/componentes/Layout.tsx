import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'

const ABAS = [
  ['/perfil', 'Perfil'],
  ['/diario', 'Diário'],
  ['/estante', 'Estante'],
  ['/livros', 'Livros'],
  ['/listas', 'Listas'],
  ['/estatisticas', 'Estatísticas']
]

export function Layout() {
  const navegar = useNavigate()
  const { pathname } = useLocation()
  const [parametros] = useSearchParams()
  const busca = pathname === '/busca' ? (parametros.get('q') ?? '') : ''

  return (
    <div className="bb">
      <nav className="topo" aria-label="Principal">
        <div className="wrap topo-l">
          <Link className="marca" to="/estante">
            Biblioteca Bela
          </Link>
          {ABAS.map(([para, nome]) => (
            <NavLink key={para} to={para} className={({ isActive }) => (isActive ? 'aba on' : 'aba')}>
              {nome}
            </NavLink>
          ))}
          <div className="dir">
            <label className="oculto" htmlFor="busca-geral">
              Buscar título, autor ou série
            </label>
            <input
              id="busca-geral"
              className="campo"
              type="search"
              placeholder="Título, autor ou série"
              value={busca}
              onChange={(e) =>
                navegar(`/busca?q=${encodeURIComponent(e.target.value)}`, { replace: pathname === '/busca' })
              }
            />
            <NavLink to="/configuracoes" className={({ isActive }) => (isActive ? 'aba on' : 'aba')}>
              Configurações
            </NavLink>
            <Link className="btn" to="/registrar">
              + Registrar
            </Link>
          </div>
        </div>
      </nav>
      <Outlet />
    </div>
  )
}
