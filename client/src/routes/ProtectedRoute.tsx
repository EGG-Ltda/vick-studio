import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../core/auth/useAuth'
import { routePaths } from './routePaths'

function ProtectedRoute() {
  const { isAuthenticated } = useAuth()

  return isAuthenticated ? (
    <Outlet />
  ) : (
    <Navigate to={routePaths.login} replace />
  )
}

export default ProtectedRoute
