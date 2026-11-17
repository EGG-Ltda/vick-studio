import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../core/auth/useAuth'
import { routePaths } from './routePaths'

function ProtectedRoute() {
  const { isAuthenticated, isLoading, mustChangePassword } = useAuth()

  if (isLoading)
    return (
      <p className="session-loading" role="status">
        Verificando acesso…
      </p>
    )
  if (isAuthenticated && mustChangePassword)
    return <Navigate to={routePaths.changePassword} replace />

  return isAuthenticated ? (
    <Outlet />
  ) : (
    <Navigate to={routePaths.login} replace />
  )
}

export default ProtectedRoute
