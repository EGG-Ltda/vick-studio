import { Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from '../pages/auth/LoginPage'
import DashboardPage from '../pages/dashboard/DashboardPage'
import SchedulePage from '../pages/dashboard/SchedulePage'
import UsersPage from '../pages/dashboard/UsersPage'
import FinancePage from '../pages/dashboard/FinancePage'
import EmployeesPage from '../pages/dashboard/EmployeesPage'
import TreatmentsPage from '../pages/dashboard/TreatmentsPage'
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
        <Route path={routePaths.dashboard} element={<DashboardPage />}>
          <Route index element={<Navigate to="schedule" replace />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="usuarios" element={<UsersPage />} />
          <Route path="financeiro" element={<FinancePage />} />
          <Route path="funcionarios" element={<EmployeesPage />} />
          <Route path="servicos" element={<TreatmentsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to={routePaths.home} replace />} />
    </Routes>
  )
}
