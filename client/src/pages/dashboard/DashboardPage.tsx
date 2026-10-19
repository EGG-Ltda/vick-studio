import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../core/auth/useAuth'
import { routePaths } from '../../routes/routePaths'

function DashboardPage() {
  const navigate = useNavigate()
  const { signOut } = useAuth()

  async function handleLogout() {
    await signOut()
    navigate(routePaths.login, { replace: true })
  }

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div>
          <strong>Vick Studio</strong>
          <span>Sistema de gestão</span>
        </div>
        <nav aria-label="Navegação principal">
          <NavLink to={routePaths.schedule}>Agenda</NavLink>
          <NavLink to={routePaths.finance}>Financeiro</NavLink>
          <NavLink to={routePaths.employees}>Funcionários</NavLink>
          <NavLink to={routePaths.treatments}>Serviços</NavLink>
          <NavLink to={routePaths.users}>Usuários</NavLink>
        </nav>
        <button type="button" onClick={handleLogout}>
          Sair
        </button>
      </aside>
      <main className="dashboard-main">
        <Outlet />
      </main>
    </div>
  )
}

export default DashboardPage
