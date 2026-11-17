import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import logo from '../../assets/vick-florez-logo.webp'
import { SalonIcon } from '../../components/SalonIcon'
import type { SalonIconName } from '../../components/SalonIcon'
import { useAuth } from '../../core/auth/useAuth'
import { routePaths } from '../../routes/routePaths'
import './dashboard.css'

const navigation: { label: string; path: string; icon: SalonIconName }[] = [
  { label: 'Agenda', path: routePaths.schedule, icon: 'agenda' },
  { label: 'Financeiro', path: routePaths.finance, icon: 'financeiro' },
  { label: 'Funcionários', path: routePaths.employees, icon: 'funcionarios' },
  { label: 'Serviços', path: routePaths.treatments, icon: 'servicos' },
  { label: 'Usuários', path: routePaths.users, icon: 'usuarios' },
]

function DashboardPage() {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const { pathname } = useLocation()
  const currentPage =
    navigation.find((item) => item.path === pathname)?.label ?? 'Agenda'

  async function handleLogout() {
    await signOut()
    navigate(routePaths.login, { replace: true })
  }

  return (
    <div className="dashboard-shell">
      <a className="salon-skip-link" href="#salon-content">
        Ir para o conteúdo
      </a>
      <aside className="dashboard-sidebar">
        <div className="salon-brand">
          <img src={logo} alt="Vick Florez" />
          <span>Beleza em cada detalhe.</span>
        </div>
        <p className="salon-nav-caption">Gestão do estúdio</p>
        <nav aria-label="Navegação principal">
          {navigation.map((item) => (
            <NavLink key={item.path} to={item.path}>
              <SalonIcon name={item.icon} />
              <span>{item.label}</span>
              <span className="salon-nav-arrow" aria-hidden="true">
                ›
              </span>
            </NavLink>
          ))}
        </nav>
        <div className="salon-sidebar-footer">
          <p>
            Um espaço para cuidar
            <br />
            <em>de quem faz florescer.</em>
          </p>
          <button type="button" onClick={handleLogout}>
            <SalonIcon name="sair" />
            Sair do sistema
          </button>
          <span className="salon-footer-signature">
            VICK FLOREZ · ESTÚDIO DE BELEZA
          </span>
        </div>
      </aside>
      <main className="dashboard-main">
        <header className="salon-topbar">
          <div>
            <span>Área do salão</span>
            <span aria-hidden="true">/</span>
            <strong>{currentPage}</strong>
          </div>
          <span className="salon-workspace">
            <span aria-hidden="true" />
            Seu espaço de gestão
          </span>
        </header>
        <div id="salon-content" className="salon-content" tabIndex={-1}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}

export default DashboardPage
