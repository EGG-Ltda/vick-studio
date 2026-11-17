import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../core/auth/useAuth'
import { allowed } from '../../core/auth/permissions'
import { availabilityRequest } from './availabilityApi'
export function AvailabilityNotice() {
  const { user } = useAuth(),
    enabled =
      allowed(user, 'availability.view') || allowed(user, 'availability.manage')
  const [data, setData] = useState<{
      items: { id: number; body: string; kind: string }[]
      pendingCount: number
    } | null>(null),
    [revision, setRevision] = useState(0),
    [error, setError] = useState('')
  useEffect(() => {
    if (!enabled) return
    const c = new AbortController()
    const refresh = () =>
      availabilityRequest<typeof data>('/availability/notices', {
        signal: c.signal,
      })
        .then((d) => {
          if (!c.signal.aborted) {
            setData(d)
            setError('')
          }
        })
        .catch(() => {
          if (!c.signal.aborted)
            setError(
              'Não foi possível atualizar os avisos de disponibilidade. Consulte as solicitações.',
            )
        })
    void refresh()
    const timer = setInterval(() => void refresh(), 30000)
    window.addEventListener('focus', refresh)
    window.addEventListener('availability-updated', refresh)
    return () => {
      c.abort()
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('availability-updated', refresh)
    }
  }, [enabled, revision])
  if (!enabled || (!error && !data?.items.length && !data?.pendingCount))
    return null
  return (
    <aside
      className="availability-notices"
      aria-label="Avisos de disponibilidade"
    >
      <div>
        {error ? (
          <p role="status">{error}</p>
        ) : (
          <>
            <strong>
              {data?.pendingCount
                ? `${data.pendingCount} solicitação(ões) aguardando análise`
                : 'Novidades nas suas solicitações'}
            </strong>
            {data?.items.map((item) => (
              <div key={item.id}>
                <span>{item.body}</span>
                <button
                  type="button"
                  onClick={() => {
                    void availabilityRequest(
                      `/availability/notices/${item.id}/read`,
                      { method: 'POST' },
                    )
                      .then(() => setRevision((r) => r + 1))
                      .catch(() =>
                        setError('Não foi possível marcar o aviso como lido.'),
                      )
                  }}
                  aria-label={`Marcar como lido: ${item.body}`}
                >
                  Marcar como lido
                </button>
              </div>
            ))}
          </>
        )}
      </div>
      <Link
        to={
          allowed(user, 'availability.manage')
            ? '/dashboard/funcionarios?aba=solicitacoes'
            : '/dashboard/schedule?solicitacoes=1'
        }
      >
        Ver solicitações →
      </Link>
    </aside>
  )
}
