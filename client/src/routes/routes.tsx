import { Navigate, Route, Routes } from 'react-router-dom'
import BirthdaysPage from '../pages/social/BirthdaysPage'
import PromotionsPage from '../pages/social/PromotionsPage'
import {
  DashboardIndex,
  NoAccessPage,
  PermissionRoute,
} from './PermissionRoute'
import ProfilesPage from '../pages/access/ProfilesPage'
import BookingPage from '../pages/booking/BookingPage'
import CustomersPage from '../pages/dashboard/CustomersPage'
import CustomerDetailPage from '../pages/dashboard/CustomerDetailPage'
import BookingSettingsPage from '../pages/dashboard/BookingSettingsPage'
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
import ChangePasswordPage from '../pages/auth/ChangePasswordPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/agendar" element={<BookingPage />} />
      <Route path="/agendar/reservar" element={<BookingPage />} />
      <Route
        path={routePaths.changePassword}
        element={<ChangePasswordPage />}
      />
      <Route element={<PublicRoute />}>
        <Route path={routePaths.home} element={<HomePage />} />
        <Route path={routePaths.login} element={<LoginPage />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route path={routePaths.dashboard} element={<DashboardPage />}>
          <Route index element={<DashboardIndex />} />
          <Route path="sem-acesso" element={<NoAccessPage />} />
          <Route element={<PermissionRoute />}>
            <Route path="permissoes-perfis" element={<ProfilesPage />} />
            <Route path="schedule" element={<SchedulePage />} />
            <Route
              path="configuracoes-agenda"
              element={<BookingSettingsPage />}
            />
            <Route path="usuarios" element={<UsersPage />} />
            <Route path="social/aniversariantes" element={<BirthdaysPage />} />
            <Route path="social/promocoes" element={<PromotionsPage />} />
            <Route path="clientes" element={<CustomersPage />} />
            <Route path="clientes/:id" element={<CustomerDetailPage />} />
            <Route path="financeiro" element={<FinancePage />} />
            <Route path="funcionarios" element={<EmployeesPage />} />
            <Route path="servicos" element={<TreatmentsPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to={routePaths.home} replace />} />
    </Routes>
  )
}
