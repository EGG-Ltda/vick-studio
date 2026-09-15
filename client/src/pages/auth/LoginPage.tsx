import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../../core/auth/useAuth'
import { routePaths } from '../../routes/routePaths'

type LoginForm = {
  email: string
  password: string
}

function LoginPage() {
  const navigate = useNavigate()
  const { isAuthenticated, signIn } = useAuth()
  const [form, setForm] = useState<LoginForm>({ email: '', password: '' })

  if (isAuthenticated) {
    return <Navigate to={routePaths.dashboard} replace />
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    signIn(form.email, form.password)
    navigate(routePaths.dashboard, { replace: true })
  }

  return (
    <main className="page login-page">
      <section className="page-content" aria-labelledby="login-title">
        <h1 id="login-title">Login</h1>
        <form className="form" onSubmit={handleSubmit}>
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            value={form.email}
            onChange={(event) =>
              setForm({ ...form, email: event.target.value })
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
          <button type="submit">Entrar</button>
        </form>
      </section>
    </main>
  )
}

export default LoginPage
