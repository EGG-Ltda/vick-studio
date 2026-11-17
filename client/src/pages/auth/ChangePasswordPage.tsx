import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import logo from '../../assets/vick-florez-logo.webp'
import { useAuth } from '../../core/auth/useAuth'
import { routePaths } from '../../routes/routePaths'
import './password-change.css'

function ChangePasswordPage() {
  const {
    isAuthenticated,
    isLoading,
    mustChangePassword,
    changePassword,
    signOut,
  } = useAuth()
  const navigate = useNavigate()
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (isLoading)
    return (
      <p className="session-loading" role="status">
        Verificando acesso…
      </p>
    )
  if (!isAuthenticated) return <Navigate to={routePaths.login} replace />
  if (!mustChangePassword) return <Navigate to={routePaths.dashboard} replace />

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (newPassword !== confirmation) {
      setError('As senhas não conferem.')
      return
    }
    setBusy(true)
    try {
      await changePassword(newPassword, confirmation)
      setNewPassword('')
      setConfirmation('')
      navigate(routePaths.schedule, { replace: true })
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível alterar a senha.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="password-change-page">
      <section
        className="password-change-card"
        aria-labelledby="password-change-title"
      >
        <img src={logo} alt="Vick Florez" className="password-change-brand" />
        <span className="password-change-eyebrow">Seu acesso, seu cuidado</span>
        <h1 id="password-change-title">Crie sua senha pessoal</h1>
        <p>
          Você entrou com uma senha temporária. Defina uma nova senha para
          acessar as funcionalidades do salão.
        </p>
        <form onSubmit={submit}>
          <fieldset disabled={busy}>
            <label>
              Nova senha
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={32}
                aria-describedby="personal-password-hint"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </label>
            <label>
              Confirmar nova senha
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={32}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
          </fieldset>
          <small id="personal-password-hint">
            Use de 8 a 32 caracteres. Escolha uma senha pessoal diferente da
            temporária.
          </small>
          {error && (
            <p className="password-change-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="password-change-submit"
            type="submit"
            disabled={busy}
          >
            {busy ? 'Salvando…' : 'Salvar senha e continuar'}
          </button>
          <button
            className="password-change-exit"
            type="button"
            disabled={busy}
            onClick={() => void signOut().catch(() => {})}
          >
            Sair e continuar depois
          </button>
        </form>
      </section>
    </main>
  )
}

export default ChangePasswordPage
