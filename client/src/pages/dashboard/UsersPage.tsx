import { SalonInput } from '../../components/selection/SalonInput'
import { SalonSelect } from '../../components/selection/SalonSelect'
import { useAuth } from '../../core/auth/useAuth'
import { allowed } from '../../core/auth/permissions'
import { accessRequest } from '../access/accessApi'
import type { AccessClass } from '../access/accessApi'
import { UserClassModal } from '../access/UserClassModal'
import { UserPermissionsModal } from '../access/UserPermissionsModal'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { CSSProperties } from 'react'
import {
  CALENDAR_PALETTE,
  DEFAULT_CALENDAR_COLOR,
  normalizeCalendarColor,
  calendarStyle,
} from './calendarColors'
import {
  createUser,
  disableUser,
  listUsers,
  restoreUser,
  updateUser,
  setTemporaryPassword,
} from './usersApi'
import type { User } from './usersApi'
import { SalonModal } from '../../components/SalonModal'

function UsersPage() {
  const { user: actor } = useAuth()
  const [permissionTarget, setPermissionTarget] = useState<number | null>(null)
  const [role, setRole] = useState<string>('')
  const [classes, setClasses] = useState<AccessClass[]>([])
  const [classTarget, setClassTarget] = useState<User | null>(null)
  const [classError, setClassError] = useState('')
  const [resetTarget, setResetTarget] = useState<User | null>(null)
  const [temporaryPassword, setTemporaryPasswordValue] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [resetError, setResetError] = useState('')
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
  const [calendarColor, setCalendarColor] = useState(DEFAULT_CALENDAR_COLOR)
  useEffect(() => {
    if (!allowed(actor, 'users.manage') && !allowed(actor, 'users.create'))
      return
    const c = new AbortController()
    accessRequest<AccessClass[]>('/access/classes/options', {
      signal: c.signal,
    })
      .then((d) => {
        if (!c.signal.aborted) setClasses(d)
      })
      .catch((e) => {
        if (!c.signal.aborted) setClassError(e.message)
      })
    return () => c.abort()
  }, [actor, revision])

  useEffect(() => {
    const controller = new AbortController()
    listUsers(page, hideDisabled, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return
        if (!data.items.length && page > 0) {
          setPage(page - 1)
          return
        }
        setUsers(data.items)
        setHasNext(data.hasNext)
        setLoading(false)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setListError(
          cause instanceof Error
            ? cause.message
            : 'Não foi possível carregar os usuários.',
        )
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
    setRole(
      user
        ? user.role === 'MASTER' || user.role === 'DISABLED'
          ? user.role
          : String(user.accessClassId ?? '')
        : String(
            classes.find((c) => c.builtinRole === 'OPERATIONAL')?.id ?? '',
          ),
    )
    setLogin(user?.login ?? '')
    setEmail(user?.email ?? '')
    setCalendarColor(normalizeCalendarColor(user?.calendarColor))
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
      const input = {
        login: login.trim(),
        email: email.trim(),
        role:
          role === 'MASTER' || role === 'DISABLED'
            ? (role as User['role'])
            : editing?.role === 'DISABLED'
              ? ((classes.find((c) => String(c.id) === role)?.level ===
                'administrative'
                  ? 'ADMIN'
                  : 'OPERATIONAL') as User['role'])
              : undefined,
        accessClassId:
          role !== 'MASTER' && role !== 'DISABLED' ? Number(role) : undefined,
        calendarColor,
      }
      if (editing) await updateUser(editing.id, input)
      else await createUser({ ...input, password })
      setShowForm(false)
      setPassword('')
      setNotice(editing ? 'Usuário atualizado.' : 'Usuário cadastrado.')
      if (!editing) setPage(0)
      refresh()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível salvar o usuário.',
      )
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
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível alterar o status do usuário.',
      )
    } finally {
      setBusy(false)
    }
  }

  function closePasswordReset() {
    if (busy) return
    setResetTarget(null)
    setTemporaryPasswordValue('')
    setPasswordConfirmation('')
    setResetError('')
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!resetTarget) return
    setResetError('')
    if (temporaryPassword !== passwordConfirmation) {
      setResetError('As senhas não conferem.')
      return
    }
    setBusy(true)
    try {
      await setTemporaryPassword(
        resetTarget.id,
        temporaryPassword,
        passwordConfirmation,
      )
      setNotice(
        `Senha temporária definida para ${resetTarget.login}. Comunique-a ao funcionário por um canal privado. A troca será exigida ao entrar.`,
      )
      setResetTarget(null)
      setTemporaryPasswordValue('')
      setPasswordConfirmation('')
      refresh()
    } catch (cause) {
      setResetError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível redefinir a senha.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="dashboard-view">
      <header className="dashboard-view-header">
        <div>
          <span className="salon-eyebrow">Acessos & permissões</span>
          <h1>Usuários</h1>
          <p>Os acessos certos para cada pessoa da sua equipe.</p>
        </div>
        {allowed(actor, 'users.create') && (
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => openForm(null)}
          >
            <span aria-hidden="true">＋</span> Novo usuário
          </button>
        )}
      </header>
      {error && !showForm && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {classTarget && (
        <UserClassModal
          user={classTarget}
          onClose={() => setClassTarget(null)}
          onSaved={() => {
            refresh()
            setNotice('Classe de acesso atualizada.')
          }}
        />
      )}
      {permissionTarget !== null && (
        <UserPermissionsModal
          id={permissionTarget}
          onClose={() => setPermissionTarget(null)}
          onSaved={() => {
            refresh()
            setNotice('Acessos individuais atualizados.')
          }}
        />
      )}
      {resetTarget && (
        <SalonModal
          title="Definir senha temporária"
          description={`Redefinir o acesso de ${resetTarget.login}.`}
          busy={busy}
          onClose={closePasswordReset}
        >
          <form className="user-form" onSubmit={resetPassword}>
            <p className="form-hint">
              As sessões anteriores serão encerradas. No próximo acesso, o
              funcionário deverá criar uma senha pessoal para continuar.
            </p>
            <fieldset className="password-reset-fields" disabled={busy}>
              <label>
                Senha temporária
                <SalonInput
                  type="password"
                  required
                  minLength={8}
                  maxLength={32}
                  autoComplete="new-password"
                  value={temporaryPassword}
                  onChange={(event) =>
                    setTemporaryPasswordValue(event.target.value)
                  }
                  aria-describedby="temporary-password-hint"
                />
              </label>
              <label>
                Confirmar senha temporária
                <SalonInput
                  type="password"
                  required
                  minLength={8}
                  maxLength={32}
                  autoComplete="new-password"
                  value={passwordConfirmation}
                  onChange={(event) =>
                    setPasswordConfirmation(event.target.value)
                  }
                />
              </label>
            </fieldset>
            <small id="temporary-password-hint">
              Use de 8 a 32 caracteres e comunique a senha somente ao
              funcionário.
            </small>
            {resetError && <p role="alert">{resetError}</p>}
            <div className="modal-actions">
              <button
                type="button"
                disabled={busy}
                onClick={closePasswordReset}
              >
                Cancelar
              </button>
              <button type="submit" className="primary-button" disabled={busy}>
                {busy ? 'Definindo…' : 'Definir senha temporária'}
              </button>
            </div>
          </form>
        </SalonModal>
      )}
      {showForm && (
        <SalonModal
          title={editing ? 'Editar usuário' : 'Novo usuário'}
          description="Defina os dados de acesso ao sistema do salão."
          busy={busy}
          onClose={() => {
            setShowForm(false)
            setPassword('')
          }}
        >
          <form
            className="user-form users-registration-form"
            onSubmit={save}
            aria-label={editing ? 'Editar usuário' : 'Novo usuário'}
          >
            <label>
              Login
              <SalonInput
                autoFocus
                value={login}
                onChange={(event) => setLogin(event.target.value)}
                required
                maxLength={255}
                pattern=".*\S.*"
                disabled={busy}
                autoComplete="username"
                placeholder="Ex.: maria.silva"
              />
            </label>
            <label>
              E-mail
              <SalonInput
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                maxLength={255}
                disabled={busy}
                autoComplete="email"
              />
            </label>
            <label>
              Classe de acesso
              <SalonSelect
                value={role}
                onChange={(e) => setRole(e.target.value)}
                required
                disabled={
                  busy || (editing?.isMaster && editing.id === actor?.id)
                }
              >
                <option value="">Selecione uma classe</option>
                <option value="MASTER">Master · acesso completo</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {!c.builtinRole &&
                      ` · ${c.level === 'administrative' ? 'Administrativo' : 'Operacional'}`}
                  </option>
                ))}
                <option value="DISABLED">Desabilitado</option>
              </SalonSelect>
              <small>
                As funcionalidades e o alcance dos dados são definidos na
                classe, em Funcionalidades por perfil.
              </small>
            </label>
            {classError && (
              <p role="alert">
                Não foi possível carregar as classes: {classError}
              </p>
            )}
            <fieldset className="employee-color-picker" disabled={busy}>
              <legend>Cor na Agenda</legend>
              <p className="form-hint">
                Identifica os agendamentos do funcionário vinculado a este
                usuário.
              </p>
              <label className="employee-color-custom">
                Cor personalizada
                <SalonInput
                  type="color"
                  value={calendarColor}
                  onChange={(event) =>
                    setCalendarColor(event.target.value.toUpperCase())
                  }
                />
                <span>{calendarColor}</span>
              </label>
              <div
                className="employee-color-palette"
                aria-label="Cores sugeridas"
              >
                {CALENDAR_PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Usar cor ${color}`}
                    aria-pressed={calendarColor === color}
                    style={{ background: color }}
                    onClick={() => setCalendarColor(color)}
                  />
                ))}
              </div>
              <div
                className="employee-color-preview"
                style={calendarStyle(calendarColor) as CSSProperties}
              >
                <strong>{login || 'Profissional'}</strong>
                <span>09:00 – 10:00 · Prévia na Agenda</span>
              </div>
              <button
                type="button"
                onClick={() => setCalendarColor(DEFAULT_CALENDAR_COLOR)}
              >
                Usar cor padrão
              </button>
            </fieldset>
            {!editing && (
              <label>
                Senha temporária
                <SalonInput
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={8}
                  maxLength={32}
                  disabled={busy}
                  autoComplete="new-password"
                  aria-describedby="user-password-hint"
                />
                <small id="user-password-hint">
                  De 8 a 32 caracteres. O funcionário deverá criar uma senha
                  pessoal no primeiro acesso.
                </small>
              </label>
            )}
            {error && <p role="alert">{error}</p>}
            <div className="modal-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setShowForm(false)
                  setPassword('')
                }}
              >
                Cancelar
              </button>
              <button type="submit" className="primary-button" disabled={busy}>
                {busy
                  ? 'Salvando…'
                  : editing
                    ? 'Salvar alterações'
                    : 'Cadastrar usuário'}
              </button>
            </div>
          </form>
        </SalonModal>
      )}
      <div className="list-toolbar">
        <div>
          <h2>Contas do sistema</h2>
          <span>Consulte e gerencie os usuários cadastrados.</span>
        </div>
        <label className="users-filter">
          <SalonInput
            type="checkbox"
            checked={hideDisabled}
            disabled={busy}
            onChange={(event) => {
              setHideDisabled(event.target.checked)
              setPage(0)
              setLoading(true)
              setListError('')
            }}
          />{' '}
          Esconder usuários desabilitados
        </label>
      </div>
      {listError && (
        <p role="alert">
          {listError}{' '}
          <button type="button" onClick={refresh}>
            Tentar novamente
          </button>
        </p>
      )}
      <div className="users-table-wrapper" aria-busy={loading}>
        <table className="users-table">
          <thead>
            <tr>
              <th scope="col">Login</th>
              <th scope="col">E-mail</th>
              <th scope="col">Status</th>
              <th scope="col">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4}>Carregando usuários…</td>
              </tr>
            ) : listError ? (
              <tr>
                <td colSpan={4}>Listagem indisponível.</td>
              </tr>
            ) : !users.length ? (
              <tr>
                <td colSpan={4}>Nenhum usuário encontrado.</td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <td data-label="Login">
                    <strong className="table-person">{user.login}</strong>
                    {user.isMaster && (
                      <span className="master-tag">Master</span>
                    )}
                    {!user.isMaster && (
                      <span className="master-tag">
                        {user.accessClassName ?? user.assignedRole}
                      </span>
                    )}
                  </td>
                  <td data-label="E-mail">{user.email}</td>
                  <td data-label="Status">
                    <span
                      className={`status-tag ${user.isActive && !user.removedAt ? 'status-active' : 'status-inactive'}`}
                    >
                      {user.isActive && !user.removedAt
                        ? 'Ativo'
                        : 'Desabilitado'}
                    </span>
                    {user.mustChangePassword && (
                      <small className="password-pending-tag">
                        Troca de senha pendente
                      </small>
                    )}
                  </td>
                  <td data-label="Ações">
                    <div className="users-actions">
                      {allowed(actor, 'classes.manage') &&
                        !user.isMaster &&
                        user.id !== actor?.id &&
                        (actor?.isMaster ||
                          user.assignedRole === 'OPERATIONAL') && (
                          <button
                            type="button"
                            onClick={() => setClassTarget(user)}
                          >
                            Classe de acesso
                          </button>
                        )}
                      {user.canConfigurePermissions && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setPermissionTarget(user.id)}
                        >
                          Permissões
                        </button>
                      )}
                      {allowed(actor, 'users.manage') && (
                        <button
                          type="button"
                          disabled={busy}
                          aria-label={`Editar ${user.login}`}
                          onClick={() => openForm(user)}
                        >
                          Editar
                        </button>
                      )}
                      {user.canResetPassword && (
                        <button
                          type="button"
                          disabled={busy}
                          aria-label={`Redefinir senha de ${user.login}`}
                          onClick={() => {
                            setShowForm(false)
                            setResetTarget(user)
                            setResetError('')
                            setNotice('')
                            setTemporaryPasswordValue('')
                            setPasswordConfirmation('')
                          }}
                        >
                          Redefinir senha
                        </button>
                      )}
                      {allowed(actor, 'users.manage') && (
                        <button
                          type="button"
                          className="user-status-button"
                          disabled={
                            busy ||
                            (user.isMaster && user.isActive && !user.removedAt)
                          }
                          title={
                            user.isMaster
                              ? 'O administrador master não pode ser desabilitado.'
                              : undefined
                          }
                          aria-label={`${user.isActive && !user.removedAt ? 'Desabilitar' : 'Reabilitar'} ${user.login}`}
                          onClick={() => void changeStatus(user)}
                        >
                          {user.isActive && !user.removedAt
                            ? 'Desabilitar'
                            : 'Reabilitar'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <nav className="users-pagination" aria-label="Paginação de usuários">
        <button
          type="button"
          disabled={loading || busy || page === 0}
          onClick={() => {
            setLoading(true)
            setListError('')
            setPage(page - 1)
          }}
        >
          Anterior
        </button>
        <span aria-live="polite">Página {page + 1}</span>
        <button
          type="button"
          disabled={loading || busy || !!listError || !hasNext}
          onClick={() => {
            setLoading(true)
            setPage(page + 1)
          }}
        >
          Próxima
        </button>
      </nav>
    </section>
  )
}
export default UsersPage
