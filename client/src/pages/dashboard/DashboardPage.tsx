import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../core/auth/useAuth'
import { routePaths } from '../../routes/routePaths'

function DashboardPage() {
  const navigate = useNavigate()
  const { signOut } = useAuth()

  function handleLogout() {
    signOut()
    navigate(routePaths.login, { replace: true })
  }

  return (
    <main className="page dashboard-page">
      <header className="page-header">
        <h1>Dashboard</h1>
        <button type="button" onClick={handleLogout}>
          Sair
        </button>
      </header>
      <section className="page-content">Bem-vindo ao seu dashboard.</section>
    </main>
  )
}

export default DashboardPage
