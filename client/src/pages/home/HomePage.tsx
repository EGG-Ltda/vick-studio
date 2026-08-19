import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../core/auth/useAuth'
import { routePaths } from '../../routes/routePaths'

function HomePage() {
  const navigate = useNavigate()
  const { signOut } = useAuth()

  function handleLogout() {
    signOut()
    navigate(routePaths.login, { replace: true })
  }

  return (
    <main className="page home-page">
      <header className="page-header">
        <h1>Home</h1>
        <button type="button" onClick={handleLogout}>
          Sair
        </button>
      </header>
      <section className="page-content"> Teste </section>
    </main>
  )
}

export default HomePage
