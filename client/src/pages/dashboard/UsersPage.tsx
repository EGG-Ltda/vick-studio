import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { createUser, disableUser, listUsers, restoreUser, updateUser } from './usersApi'
import type { User } from './usersApi'

function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [hasNext, setHasNext] = useState(false)
  const [page, setPage] = useState(0)
  const [hideDisabled, setHideDisabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [listError, setListError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [login, setLogin] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    listUsers(page, hideDisabled, controller.signal).then((data) => {
      if (controller.signal.aborted) return
      if (!data.items.length && page > 0) {
        setPage(page - 1)
        return
      }
      setUsers(data.items)
      setHasNext(data.hasNext)
      setLoading(false)
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return
      setListError(cause instanceof Error ? cause.message : 'Não foi possível carregar os usuários.')
      setLoading(false)
    })
    return () => controller.abort()
  }, [page, hideDisabled, revision])

  function refresh() {
    setLoading(true)
    setListError('')
    setRevision((value) => value + 1)
  }

  function openForm(user: User | null) {
    setEditing(user)
    setLogin(user?.login ?? '')
    setEmail(user?.email ?? '')
    setPassword('')
    setError('')
    setNotice('')
    setShowForm(true)
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const input = { login: login.trim(), email: email.trim() }
      if (editing) await updateUser(editing.id, input)
      else await createUser({ ...input, password })
      setShowForm(false)
      setPassword('')
      setNotice(editing ? 'Usuário atualizado.' : 'Usuário cadastrado.')
      if (!editing) setPage(0)
      refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o usuário.')
    } finally {
      setBusy(false)
    }
  }

  async function changeStatus(user: User) {
    const active = user.isActive && !user.removedAt
    if (active && user.isMaster) return
    const action = active ? 'Desabilitar' : 'Reabilitar'
    if (!window.confirm(`${action} o usuário ${user.login}?`)) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (active) await disableUser(user.id)
      else await restoreUser(user.id)
      if (editing?.id === user.id) setShowForm(false)
      setNotice(active ? 'Usuário desabilitado.' : 'Usuário reabilitado.')
      refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível alterar o status do usuário.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="dashboard-view">
      <header className="dashboard-view-header">
        <div><h1>Usuários</h1><p>Gerencie os acessos ao sistema.</p></div>
        <button type="button" className="primary-button" disabled={busy} onClick={() => { if (showForm) { setShowForm(false); setPassword('') } else openForm(null) }}>
          {showForm ? 'Cancelar' : 'Novo usuário'}
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {showForm && (
        <form className="user-form users-registration-form" onSubmit={save} aria-label={editing ? 'Editar usuário' : 'Novo usuário'}>
          <label>Login<input value={login} onChange={(event) => setLogin(event.target.value)} required maxLength={255} pattern=".*\S.*" disabled={busy} autoComplete="username" /></label>
          <label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={255} disabled={busy} autoComplete="email" /></label>
          {!editing && <label>Senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} maxLength={32} disabled={busy} autoComplete="new-password" aria-describedby="user-password-hint" /><small id="user-password-hint">De 8 a 32 caracteres.</small></label>}
          <button type="submit" className="primary-button" disabled={busy}>{busy ? 'Salvando…' : editing ? 'Salvar alterações' : 'Adicionar'}</button>
        </form>
      )}
      <label className="users-filter"><input type="checkbox" checked={hideDisabled} disabled={busy} onChange={(event) => {
        setHideDisabled(event.target.checked)
        setPage(0)
        setLoading(true)
        setListError('')
      }} /> Esconder usuários desabilitados</label>
      {listError && <p role="alert">{listError} <button type="button" onClick={refresh}>Tentar novamente</button></p>}
      <div className="users-table-wrapper" aria-busy={loading}>
        <table className="users-table">
          <thead><tr><th scope="col">Login</th><th scope="col">E-mail</th><th scope="col">Status</th><th scope="col">Ações</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={4}>Carregando usuários…</td></tr> : listError ? <tr><td colSpan={4}>Listagem indisponível.</td></tr> : !users.length ? <tr><td colSpan={4}>Nenhum usuário encontrado.</td></tr> : users.map((user) => (
              <tr key={user.id}>
                <td>{user.login}</td><td>{user.email}</td><td>{user.isActive && !user.removedAt ? 'Ativo' : 'Desabilitado'}</td>
                <td><div className="users-actions">
                  <button type="button" disabled={busy} aria-label={`Editar ${user.login}`} onClick={() => openForm(user)}>Editar</button>
                  <button type="button" className="user-status-button" disabled={busy || (user.isMaster && user.isActive && !user.removedAt)} title={user.isMaster ? 'O administrador master não pode ser desabilitado.' : undefined} aria-label={`${user.isActive && !user.removedAt ? 'Desabilitar' : 'Reabilitar'} ${user.login}`} onClick={() => void changeStatus(user)}>{user.isActive && !user.removedAt ? 'Desabilitar' : 'Reabilitar'}</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav className="users-pagination" aria-label="Paginação de usuários">
        <button type="button" disabled={loading || busy || page === 0} onClick={() => { setLoading(true); setListError(''); setPage(page - 1) }}>Anterior</button>
        <span aria-live="polite">Página {page + 1}</span>
        <button type="button" disabled={loading || busy || !!listError || !hasNext} onClick={() => { setLoading(true); setPage(page + 1) }}>Próxima</button>
      </nav>
    </section>
  )
}
export default UsersPage
