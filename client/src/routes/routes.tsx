import { Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from '../pages/auth/LoginPage'
import DashboardPage from '../pages/dashboard/DashboardPage'
import HomePage from '../pages/home/HomePage'
import ProtectedRoute from './ProtectedRoute'
import PublicRoute from './PublicRoute'
import { routePaths } from './routePaths'

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicRoute />}>
        <Route path={routePaths.home} element={<HomePage />} />
        <Route path={routePaths.login} element={<LoginPage />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route path={routePaths.dashboard} element={<DashboardPage />} />
      </Route>
      <Route path="*" element={<Navigate to={routePaths.home} replace />} />
    </Routes>
  )
}
