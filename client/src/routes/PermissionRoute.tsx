import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../core/auth/useAuth'
import {
  allowed,
  firstAllowedPage,
  pagePermissions,
} from '../core/auth/permissions'
export function DashboardIndex() {
  const { user } = useAuth()
  return <Navigate to={firstAllowedPage(user)} replace />
}
export function NoAccessPage() {
  return (
    <section className="dashboard-view">
      <span className="salon-eyebrow">Acesso restrito</span>
      <h1>Nenhuma funcionalidade habilitada</h1>
      <p>
        Peça ao responsável do salão para conferir seu perfil e suas permissões.
      </p>
    </section>
  )
}
export function PermissionRoute() {
  const { user } = useAuth(),
    { pathname } = useLocation()
  const permission = Object.entries(pagePermissions).find(
    ([path]) => pathname === path || pathname.startsWith(path + '/'),
  )?.[1]
  return !permission || allowed(user, permission) ? (
    <Outlet />
  ) : (
    <Navigate to={firstAllowedPage(user)} replace />
  )
}
