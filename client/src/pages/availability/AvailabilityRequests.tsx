import { useEffect, useRef, useState } from 'react'
import { SalonInput } from '../../components/selection/SalonInput'
import { SalonSelect } from '../../components/selection/SalonSelect'
import { bookingDate } from '../booking/bookingApi'
import {
  availabilityRequest,
  absenceKind,
  absenceStatus,
  endOfLunch,
} from './availabilityApi'
import type { AbsenceRequest, RequestPage } from './availabilityApi'
export function AvailabilityRequests({
  management = false,
  onChanged,
}: {
  management?: boolean
  onChanged?: () => void
}) {
  const [data, setData] = useState<RequestPage | null>(null),
    [status, setStatus] = useState(management ? 'pending' : ''),
    [kind, setKind] = useState(''),
    [search, setSearch] = useState(''),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [page, setPage] = useState(0),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false)
  const [decision, setDecision] = useState<{
      request: AbsenceRequest
      action: 'approve' | 'decline' | 'cancel'
    } | null>(null),
    [reason, setReason] = useState(''),
    [events, setEvents] = useState<
      | {
          id: number
          action: string
          createdAt: string
          author: string
          reason: string | null
        }[]
      | null
    >(null),
    [historyId, setHistoryId] = useState<number | null>(null)
  const requestKey = useRef<{ body: string; key: string } | null>(null)
  useEffect(() => {
    const c = new AbortController()
    let running = false
    const load = async () => {
      if (running) return
      running = true
      try {
        const result = await availabilityRequest<RequestPage>(
          '/availability/requests?' +
            new URLSearchParams({
              status,
              kind,
              search,
              page: String(page),
              ...(from ? { from } : {}),
              ...(to ? { to } : {}),
            }),
          { signal: c.signal },
        )
        if (!c.signal.aborted) {
          setData(result)
          setError('')
          setLoading(false)
        }
      } catch (cause) {
        if (!c.signal.aborted) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Não foi possível carregar as solicitações.',
          )
          setLoading(false)
        }
      } finally {
        running = false
      }
    }
    void load()
    const timer = setInterval(() => void load(), 30000)
    return () => {
      c.abort()
      clearInterval(timer)
    }
  }, [status, kind, search, from, to, page, revision])
  function filter(change: () => void) {
    change()
    setPage(0)
    setLoading(true)
  }
  async function decide() {
    if (!decision) return
    setBusy(true)
    setError('')
    const body = JSON.stringify({
      id: decision.request.id,
      action: decision.action,
      reason,
    })
    if (requestKey.current?.body !== body)
      requestKey.current = { body, key: crypto.randomUUID() }
    try {
      await availabilityRequest(
        `/availability/requests/${decision.request.id}/decision`,
        {
          method: 'POST',
          body: JSON.stringify({
            ...JSON.parse(body),
            requestKey: requestKey.current.key,
          }),
        },
      )
      requestKey.current = null
      setDecision(null)
      setReason('')
      setLoading(true)
      setRevision((r) => r + 1)
      setHistoryId(null)
      onChanged?.()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível decidir a solicitação.',
      )
    } finally {
      setBusy(false)
    }
  }
  async function history(id: number) {
    setBusy(true)
    setError('')
    try {
      const result = await availabilityRequest<typeof events>(
        `/availability/requests/${id}/events`,
      )
      setEvents(result)
      setHistoryId(id)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível consultar o histórico.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="availability-requests">
      <header className="availability-section-heading">
        <div>
          <h2>{management ? 'Solicitações da equipe' : 'Meus pedidos'}</h2>
          <p>{data?.pendingCount ?? 0} aguardando aprovação</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true)
            setRevision((r) => r + 1)
          }}
          disabled={busy}
        >
          Atualizar
        </button>
      </header>
      <div className="availability-filters">
        {management && (
          <label>
            Funcionário
            <SalonInput
              type="search"
              value={search}
              maxLength={100}
              placeholder="Nome do funcionário"
              onChange={(e) => filter(() => setSearch(e.target.value))}
            />
          </label>
        )}
        <label>
          Status
          <SalonSelect
            value={status}
            onChange={(e) => filter(() => setStatus(e.target.value))}
          >
            <option value="">Todos</option>
            {Object.entries(absenceStatus).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </SalonSelect>
        </label>
        <label>
          Tipo
          <SalonSelect
            value={kind}
            onChange={(e) => filter(() => setKind(e.target.value))}
          >
            <option value="">Todos</option>
            {Object.entries(absenceKind).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </SalonSelect>
        </label>
        <label>
          De
          <SalonInput
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => filter(() => setFrom(e.target.value))}
          />
        </label>
        <label>
          Até
          <SalonInput
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => filter(() => setTo(e.target.value))}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="booking-error">
          {error}
        </p>
      )}
      {loading && <p role="status">Carregando solicitações…</p>}
      {!loading && !error && !data?.items.length && (
        <p className="availability-empty">
          Nenhuma solicitação para estes filtros.
        </p>
      )}
      {!loading &&
        data?.items.map((r) => (
          <article className="availability-request-card" key={r.id}>
            <header>
              <div>
                <span className="salon-eyebrow">{absenceKind[r.kind]}</span>
                <h3>{r.employeeName}</h3>
              </div>
              <span className={`availability-status status-${r.status}`}>
                {absenceStatus[r.status]}
              </span>
            </header>
            <p>
              <strong>
                {r.kind === 'vacation'
                  ? `${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date(r.startsAt))} a ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.parse(r.endsAt) - 1))} (inclusive)`
                  : `${bookingDate(r.startsAt)} — ${bookingDate(r.endsAt)}`}
              </strong>{' '}
              · Brasília
              {r.kind === 'vacation'
                ? ' · retorno após o término do período'
                : ''}
            </p>
            {r.kind === 'lunch' && r.baselineLunch && (
              <p className="availability-lunch-comparison">
                Habitual: {r.baselineLunch.slice(0, 5)} às{' '}
                {endOfLunch(r.baselineLunch)}. Se aprovada, a troca vale somente
                para este dia e libera o almoço anterior.
              </p>
            )}
            <p className="availability-request-reason">{r.reason}</p>
            <small>Solicitado em {bookingDate(r.createdAt)}</small>
            {r.hasConflict && r.status === 'pending' && (
              <p className="booking-alert">
                Há atendimento neste intervalo. A equipe deve regularizá-lo
                antes de aprovar; nenhuma reserva será alterada automaticamente.
              </p>
            )}
            {r.decidedAt && (
              <p className="availability-decision-summary">
                {r.decidedBy} · {bookingDate(r.decidedAt)}
                <br />
                {r.decisionReason}
              </p>
            )}
            <div className="availability-actions">
              {management && data.canManage && r.status === 'pending' && (
                <>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={busy}
                    onClick={() => {
                      setDecision({ request: r, action: 'approve' })
                      setReason('')
                    }}
                  >
                    Aprovar
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setDecision({ request: r, action: 'decline' })
                      setReason('')
                    }}
                  >
                    Recusar
                  </button>
                </>
              )}
              {(r.status === 'pending' ||
                (management && data.canManage && r.status === 'approved')) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setDecision({ request: r, action: 'cancel' })
                    setReason('')
                  }}
                >
                  Cancelar solicitação
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => void history(r.id)}
              >
                Ver histórico
              </button>
            </div>
            {decision?.request.id === r.id && (
              <form
                className="booking-form availability-decision"
                onSubmit={(event) => {
                  event.preventDefault()
                  void decide()
                }}
              >
                <label>
                  {decision.action === 'approve'
                    ? 'Observação da aprovação'
                    : 'Justificativa'}
                  <SalonInput
                    required
                    minLength={3}
                    maxLength={2000}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    disabled={busy}
                  />
                </label>
                <div className="availability-actions">
                  <button className="primary-button" disabled={busy}>
                    {busy ? 'Salvando…' : 'Confirmar decisão'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setDecision(null)}
                  >
                    Voltar
                  </button>
                </div>
              </form>
            )}
            {historyId === r.id && events && (
              <div className="availability-history">
                {events.map((event) => (
                  <p key={event.id}>
                    <strong>
                      {{
                        request: 'Solicitação enviada',
                        approve: 'Aprovada',
                        decline: 'Recusada',
                        cancel: 'Cancelada',
                      }[event.action] ?? event.action}
                    </strong>{' '}
                    · {event.author} · {bookingDate(event.createdAt)}
                    {event.reason && <span>{event.reason}</span>}
                  </p>
                ))}
              </div>
            )}
          </article>
        ))}
      <nav className="users-pagination" aria-label="Paginação de solicitações">
        <button
          type="button"
          disabled={loading || busy || page === 0}
          onClick={() => {
            setPage(page - 1)
            setLoading(true)
          }}
        >
          Anterior
        </button>
        <span>Página {page + 1}</span>
        <button
          type="button"
          disabled={loading || busy || !data?.hasNext}
          onClick={() => {
            setPage(page + 1)
            setLoading(true)
          }}
        >
          Próxima
        </button>
      </nav>
    </section>
  )
}
