import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../core/auth/useAuth'
import { routePaths } from './routePaths'

function PublicRoute() {
  const { isAuthenticated } = useAuth()

  return isAuthenticated ? (
    <Navigate to={routePaths.home} replace />
  ) : (
    <Outlet />
  )
}

export default PublicRoute
