import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../core/auth/useAuth'
import { routePaths } from './routePaths'

function PublicRoute() {
  const { isAuthenticated, isLoading, mustChangePassword } = useAuth()

  if (isLoading)
    return (
      <p className="session-loading" role="status">
        Verificando acesso…
      </p>
    )

  return isAuthenticated ? (
    <Navigate
      to={mustChangePassword ? routePaths.changePassword : routePaths.dashboard}
      replace
    />
  ) : (
    <Outlet />
  )
}

export default PublicRoute
