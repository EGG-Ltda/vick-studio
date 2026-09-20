import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../../core/auth/useAuth'
import { routePaths } from '../../routes/routePaths'

type LoginForm = {
  login: string
  password: string
}

function LoginPage() {
  const navigate = useNavigate()
  const { isAuthenticated, signIn } = useAuth()
  const [form, setForm] = useState<LoginForm>({ login: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (isAuthenticated) {
    return <Navigate to={routePaths.dashboard} replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await signIn(form.login, form.password)
      navigate(routePaths.schedule, { replace: true })
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Não foi possível entrar.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="page login-page">
      <header className="page-header">
        <button type="button" onClick={() => navigate(routePaths.home)}>
          Sair
        </button>
      </header>
      <section className="page-content" aria-labelledby="login-title">
        <h1 id="login-title">Login</h1>
        <form className="form" onSubmit={handleSubmit}>
          <label htmlFor="login">Login ou e-mail</label>
          <input
            id="login"
            type="text"
            value={form.login}
            onChange={(event) =>
              setForm({ ...form, login: event.target.value })
            }
            required
          />
          <label htmlFor="password">Senha</label>
          <input
            id="password"
            type="password"
            value={form.password}
            onChange={(event) =>
              setForm({ ...form, password: event.target.value })
            }
            required
          />
          {error && <p role="alert">{error}</p>}
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  )
}

export default LoginPage
