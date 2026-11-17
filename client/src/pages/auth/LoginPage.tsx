import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import vickFlorezLogo from '../../assets/vick-florez-logo.png'
import { useAuth } from '../../core/auth/useAuth'
import { routePaths } from '../../routes/routePaths'

type LoginForm = {
  login: string
  password: string
}

function LoginPage() {
  const navigate = useNavigate()
  const { isAuthenticated, mustChangePassword, signIn } = useAuth()
  const [form, setForm] = useState<LoginForm>({ login: '', password: '' })
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState('')

  if (isAuthenticated) {
    return (
      <Navigate
        to={
          mustChangePassword ? routePaths.changePassword : routePaths.dashboard
        }
        replace
      />
    )
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback('')
    setIsSubmitting(true)

    try {
      const session = await signIn(form.login, form.password)
      navigate(
        session.mustChangePassword
          ? routePaths.changePassword
          : routePaths.schedule,
        { replace: true },
      )
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : 'Não foi possível entrar. Tente novamente.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="page login-page">
      <Link className="login-back-link" to={routePaths.home}>
        <span aria-hidden="true">←</span>
        Voltar ao início
      </Link>
      <svg
        className="login-art"
        viewBox="0 0 751 535"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient
            id="login-art-background"
            x1="0"
            y1="0"
            x2="0.78"
            y2="1"
          >
            <stop stopColor="#b31843" />
            <stop offset="0.52" stopColor="#87001f" />
            <stop offset="1" stopColor="#5f0019" />
          </linearGradient>
          <linearGradient id="login-art-ribbon" x1="0" y1="0" x2="1" y2="0.86">
            <stop stopColor="#e9a7ad" />
            <stop offset="0.48" stopColor="#d66d82" />
            <stop offset="1" stopColor="#bd375c" />
          </linearGradient>
          <filter
            id="login-art-shadow"
            x="-40%"
            y="-10%"
            width="190%"
            height="120%"
          >
            <feDropShadow
              dx="8"
              dy="8"
              stdDeviation="7"
              floodColor="#7d4132"
              floodOpacity="0.24"
            />
          </filter>
        </defs>

        <path
          className="login-art-base"
          d="M0 0H212C211 44 183 71 150 102C112 139 95 187 102 231C109 277 143 307 157 345C174 393 151 439 123 476C108 496 99 516 96 535H0Z"
          filter="url(#login-art-shadow)"
        />
        <path
          className="login-art-ribbon"
          d="M176 0C173 54 146 88 117 125C91 159 83 206 99 247C113 283 137 303 135 337C133 380 102 421 89 465C82 489 79 513 78 535H111C113 503 129 472 147 444C174 403 187 360 171 315C157 275 128 248 127 211C125 167 154 126 179 91C200 62 212 29 213 0Z"
        />
        <path
          d="M156 0C151 59 113 100 96 153C78 211 91 261 118 305C145 350 145 391 119 439C101 472 88 504 87 535"
          fill="none"
          stroke="rgb(255 237 232 / 62%)"
          strokeLinecap="round"
          strokeWidth="5"
        />
        <path
          className="login-art-highlight"
          d="M178 0C173 60 130 99 109 145C87 192 85 240 103 282C120 322 147 349 145 390C143 437 102 474 90 535"
        />
        <path
          className="login-art-line"
          d="M180 0C175 61 143 91 113 128C86 162 76 203 83 245C91 293 126 324 129 365C132 414 88 467 66 535"
        />
      </svg>
      <span className="login-dots" aria-hidden="true" />

      <section className="login-card" aria-labelledby="login-title">
        <img className="login-brand" src={vickFlorezLogo} alt="Vick Florez" />
        <h1 id="login-title" className="visually-hidden">
          Acessar o sistema
        </h1>
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label htmlFor="login">E-mail</label>
            <div className="login-input">
              <span className="login-icon login-icon-user" aria-hidden="true" />
              <input
                id="login"
                type="text"
                autoComplete="username"
                placeholder="Digite seu e-mail"
                value={form.login}
                onChange={(event) =>
                  setForm({ ...form, login: event.target.value })
                }
                required
              />
            </div>
          </div>

          <div className="login-field login-password-field">
            <label htmlFor="password">Senha</label>
            <div className="login-input">
              <svg
                className="login-icon login-icon-lock"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="4" y="10" width="16" height="10" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                <path d="M12 14v2" />
              </svg>
              <input
                id="password"
                type={isPasswordVisible ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Digite sua senha"
                value={form.password}
                onChange={(event) =>
                  setForm({ ...form, password: event.target.value })
                }
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setIsPasswordVisible((visible) => !visible)}
                aria-label={
                  isPasswordVisible ? 'Ocultar senha' : 'Mostrar senha'
                }
              >
                <span
                  className="login-icon login-icon-eye"
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>

          <button
            type="button"
            className="forgot-password"
            onClick={() =>
              setFeedback(
                'Solicite uma senha temporária ao administrador do salão. Ao entrar com ela, você deverá definir sua senha pessoal.',
              )
            }
          >
            Esqueceu sua senha?
          </button>
          <button
            type="submit"
            className="login-submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Entrando...' : 'Entrar'}
          </button>
          {feedback && (
            <p className="login-feedback" role="alert">
              {feedback}
            </p>
          )}
        </form>
      </section>
    </main>
  )
}

export default LoginPage
