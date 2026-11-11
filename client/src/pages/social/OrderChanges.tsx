import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { allowed } from '../../core/auth/permissions'
import { useAuth } from '../../core/auth/useAuth'
import { bookingDate, bookingRequest } from '../booking/bookingApi'
import type {
  BookingCatalog,
  BookingOrder,
  BookingSlot,
} from '../booking/bookingApi'
import './social.css'
type Change = {
  id: number
  action: string
  reason: string
  createdAt: string
  author: string
  previousData: { startsAt?: string; employeeIds?: number[]; useState?: string }
  currentData: { schedule_started_at?: string; employeeId?: number }
}
export function OrderChanges({
  order,
  onChanged,
  onBusyChange,
}: {
  order: BookingOrder
  onChanged: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const { user } = useAuth()
  const [catalog, setCatalog] = useState<BookingCatalog | null>(null),
    [history, setHistory] = useState<Change[]>([]),
    [slots, setSlots] = useState<BookingSlot[]>([]),
    [slotsLoading, setSlotsLoading] = useState(false),
    [revision, setRevision] = useState(0),
    [form, setForm] = useState({
      action: 'reschedule',
      employeeId: '',
      date: '',
      time: '',
      reason: '',
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const request = useRef<{ body: string; key: string } | null>(null)
  useEffect(() => {
    const c = new AbortController()
    Promise.all([
      bookingRequest<BookingCatalog>('/booking/catalog', { signal: c.signal }),
      bookingRequest<Change[]>(`/orders/${order.id}/changes`, {
        signal: c.signal,
      }),
    ])
      .then(([b, h]) => {
        if (!c.signal.aborted) {
          setCatalog(b)
          setHistory(h)
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message)
      })
    return () => c.abort()
  }, [order.id, revision])
  useEffect(() => {
    const c = new AbortController()
    if (!form.employeeId || !form.date || form.action !== 'reschedule') {
      return
    }
    bookingRequest<BookingSlot[]>(
      `/orders/${order.id}/reschedule-slots?${new URLSearchParams({ employeeId: form.employeeId, date: form.date })}`,
      { signal: c.signal },
    )
      .then((d) => {
        if (!c.signal.aborted) setSlots(d)
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message)
      })
      .finally(() => {
        if (!c.signal.aborted) setSlotsLoading(false)
      })
    return () => c.abort()
  }, [order.id, order.startsAt, form.employeeId, form.date, form.action])
  function choose(field: 'employeeId' | 'date' | 'action', value: string) {
    const next = { ...form, [field]: value, time: '' }
    setForm(next)
    setSlots([])
    setError('')
    setSlotsLoading(
      next.action === 'reschedule' && !!next.employeeId && !!next.date,
    )
  }
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    onBusyChange(true)
    setError('')
    setNotice('')
    try {
      const body = {
        action: form.action,
        reason: form.reason,
        ...(form.action === 'reschedule'
          ? {
              employeeId: Number(form.employeeId),
              startsAt: new Date(
                `${form.date}T${form.time}:00-03:00`,
              ).toISOString(),
            }
          : {}),
      }
      const text = JSON.stringify(body)
      if (request.current?.body !== text)
        request.current = { body: text, key: crypto.randomUUID() }
      await bookingRequest(`/orders/${order.id}/change`, {
        method: 'POST',
        body: JSON.stringify({ ...body, requestKey: request.current.key }),
      })
      setNotice(
        'Alteração registrada. Nenhum pagamento ou estorno foi gerado automaticamente.',
      )
      setForm((f) => ({ ...f, reason: '' }))
      request.current = null
      setRevision((r) => r + 1)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to change appointment.')
    } finally {
      setBusy(false)
      onBusyChange(false)
    }
  }
  const names: Record<string, string> = {
    reschedule: 'Remarcar',
    cancel: 'Cancelar atendimento',
    no_show: 'Registrar falta',
    return_use: 'Devolver utilização do pacote',
  }
  return (
    <section className="order-changes">
      <h2>Alterações da agenda</h2>
      {error && (
        <p role="alert" className="booking-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!order.readOnlyShared &&
        allowed(user, 'agenda.change') &&
        order.status !== 'completed' && (
          <form onSubmit={submit}>
            <fieldset disabled={busy}>
              <label>
                Ação
                <select
                  value={form.action}
                  onChange={(e) => choose('action', e.target.value)}
                >
                  <option value="reschedule">Remarcar</option>
                  {order.status !== 'cancelled' && (
                    <>
                      <option value="cancel">Cancelar atendimento</option>
                      <option value="no_show">Registrar falta</option>
                    </>
                  )}
                  {order.packageUseId && order.status === 'cancelled' && (
                    <option value="return_use">
                      Devolver utilização do pacote
                    </option>
                  )}
                </select>
              </label>
              {form.action === 'reschedule' && (
                <>
                  <label>
                    Profissional
                    <select
                      required
                      value={form.employeeId}
                      onChange={(e) => choose('employeeId', e.target.value)}
                    >
                      <option value="">Selecione</option>
                      {catalog?.employees
                        .filter(
                          (e) =>
                            order.treatments.every((t) =>
                              e.treatmentIds.includes(t.id),
                            ) &&
                            (user?.isMaster ||
                              user?.role === 'ADMIN' ||
                              e.id === order.employeeId),
                        )
                        .map((e) => (
                          <option value={e.id} key={e.id}>
                            {e.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Novo dia
                    <input
                      required
                      type="date"
                      min={new Date().toLocaleDateString('en-CA', {
                        timeZone: 'America/Sao_Paulo',
                      })}
                      value={form.date}
                      onChange={(e) => choose('date', e.target.value)}
                    />
                  </label>
                  <label>
                    Novo horário (Brasília)
                    <select
                      required
                      value={form.time}
                      disabled={slotsLoading}
                      onChange={(e) =>
                        setForm({ ...form, time: e.target.value })
                      }
                    >
                      <option value="">
                        {slotsLoading
                          ? 'Consultando horários…'
                          : 'Selecione um horário disponível'}
                      </option>
                      {slots.map((s) => {
                        const time = new Intl.DateTimeFormat('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: 'America/Sao_Paulo',
                        }).format(new Date(s.startsAt))
                        return (
                          <option key={s.startsAt} value={time}>
                            {time}
                          </option>
                        )
                      })}
                    </select>
                  </label>
                  <p>
                    A disponibilidade será validada antes de salvar. Se houver
                    conflito, a reserva original será mantida.
                  </p>
                </>
              )}
              <label>
                Motivo obrigatório
                <textarea
                  required
                  minLength={3}
                  maxLength={1000}
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                />
              </label>
            </fieldset>
            <p>
              Cancelar ou registrar falta libera a agenda, sem estornar
              pagamentos ou devolver utilizações. Para um pacote cancelado,
              devolva a utilização explicitamente antes de reservar novamente.
            </p>
            <button disabled={busy} type="submit">
              {busy ? 'Salvando…' : names[form.action]}
            </button>
          </form>
        )}
      <h3>Histórico de alterações</h3>
      {!history.length && <p>Nenhuma alteração registrada pela equipe.</p>}
      <ul>
        {history.map((h) => (
          <li key={h.id}>
            <strong>{names[h.action] ?? h.action}</strong> · {h.author} ·{' '}
            {bookingDate(h.createdAt)}
            <p>{h.reason}</p>
            {h.action === 'reschedule' && h.previousData.startsAt && (
              <p>
                De {bookingDate(h.previousData.startsAt)} para{' '}
                {h.currentData.schedule_started_at
                  ? bookingDate(h.currentData.schedule_started_at)
                  : 'novo horário'}
                .
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
