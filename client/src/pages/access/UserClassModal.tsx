import { useEffect, useState } from 'react'
import { SalonModal } from '../../components/SalonModal'
import { SalonSelect } from '../../components/selection/SalonSelect'
import { accessRequest } from './accessApi'
import type { AccessClass } from './accessApi'
import type { User } from '../dashboard/usersApi'
export function UserClassModal({
  user,
  onClose,
  onSaved,
}: {
  user: User
  onClose: () => void
  onSaved: () => void
}) {
  const [classes, setClasses] = useState<AccessClass[]>([]),
    [selected, setSelected] = useState(String(user.accessClassId ?? '')),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false)
  useEffect(() => {
    const c = new AbortController()
    accessRequest<AccessClass[]>('/access/classes/options', {
      signal: c.signal,
    })
      .then((d) => {
        if (!c.signal.aborted) {
          setClasses(d)
          setLoading(false)
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setError(e.message)
          setLoading(false)
        }
      })
    return () => c.abort()
  }, [])
  return (
    <SalonModal
      size="compact"
      title={`Classe de ${user.login}`}
      description="A mudança aplica as permissões da classe e preserva as exceções dentro dos limites autorizados."
      busy={busy}
      onClose={onClose}
    >
      <form
        className="booking-form"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError('')
          try {
            await accessRequest(`/access/users/${user.id}/class`, {
              method: 'PUT',
              body: JSON.stringify({ classId: Number(selected) }),
            })
            onSaved()
            onClose()
          } catch (e) {
            setError(
              e instanceof Error ? e.message : 'Unable to assign access class.',
            )
          } finally {
            setBusy(false)
          }
        }}
      >
        <p>
          Classe atual:{' '}
          <strong>{user.accessClassName ?? user.assignedRole}</strong>
        </p>
        {loading && <p role="status">Carregando classes autorizadas…</p>}
        {error && <p role="alert">{error}</p>}
        <label>
          Classe de acesso
          <SalonSelect
            required
            disabled={busy || loading}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Selecione</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SalonSelect>
        </label>
        <button
          className="primary-button"
          disabled={busy || loading || !selected}
        >
          {busy ? 'Salvando…' : 'Atribuir classe'}
        </button>
      </form>
    </SalonModal>
  )
}
