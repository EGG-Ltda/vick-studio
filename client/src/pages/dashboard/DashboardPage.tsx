import { allowed, pagePermissions } from '../../core/auth/permissions'
import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BirthdayNotice } from '../social/BirthdayNotice'
import '../social/social.css'
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
  {
    label: 'Configurações da agenda',
    path: routePaths.bookingSettings,
    icon: 'agenda',
  },
  { label: 'Usuários', path: routePaths.users, icon: 'usuarios' },
  {
    label: 'Funcionalidades por perfil',
    path: routePaths.permissions,
    icon: 'usuarios',
  },
]

function DashboardPage() {
  const navigate = useNavigate()
  const { signOut, user } = useAuth()
  const { pathname } = useLocation()
  const socialActive = [
    routePaths.customers,
    routePaths.birthdays,
    routePaths.promotions,
  ].some((path) => pathname === path || pathname.startsWith(path + '/'))
  const [socialOpen, setSocialOpen] = useState(socialActive)
  const currentPage =
    [
      ...navigation,
      { label: 'Clientes', path: routePaths.customers },
      { label: 'Aniversariantes', path: routePaths.birthdays },
      { label: 'Promoções e pacotes', path: routePaths.promotions },
    ].find(
      (item) => item.path === pathname || pathname.startsWith(item.path + '/'),
    )?.label ?? 'Agenda'

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
          {navigation
            .filter((item) => allowed(user, pagePermissions[item.path]))
            .map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setSocialOpen(false)}
              >
                <SalonIcon name={item.icon} />
                <span>{item.label}</span>
                <span className="salon-nav-arrow" aria-hidden="true">
                  ›
                </span>
              </NavLink>
            ))}
          {['clients.view', 'birthdays.view', 'promotions.view'].some((key) =>
            allowed(user, key),
          ) && (
            <div
              className={`social-sidebar${socialActive ? ' social-sidebar-active' : ''}`}
            >
              <button
                className="social-sidebar-toggle"
                type="button"
                aria-expanded={socialOpen}
                aria-controls="social-sidebar-links"
                onClick={() => setSocialOpen((open) => !open)}
              >
                <SalonIcon name="social" />
                <span>Social</span>
                <svg
                  className="social-sidebar-chevron"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <path d="m9 5 7 7-7 7" />
                </svg>
              </button>
              {socialOpen && (
                <div className="social-sidebar-links" id="social-sidebar-links">
                  {allowed(user, 'clients.view') && (
                    <NavLink to={routePaths.customers}>
                      <SalonIcon name="clientes" />
                      <span>Clientes</span>
                    </NavLink>
                  )}
                  {allowed(user, 'birthdays.view') && (
                    <NavLink to={routePaths.birthdays}>
                      <SalonIcon name="aniversarios" />
                      <span>Aniversariantes</span>
                    </NavLink>
                  )}
                  {allowed(user, 'promotions.view') && (
                    <NavLink to={routePaths.promotions}>
                      <SalonIcon name="promocoes" />
                      <span>Promoções e pacotes</span>
                    </NavLink>
                  )}
                </div>
              )}
            </div>
          )}
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
          {allowed(user, 'birthdays.view') && <BirthdayNotice />}
          <Outlet />
        </div>
      </main>
    </div>
  )
}

export default DashboardPage
