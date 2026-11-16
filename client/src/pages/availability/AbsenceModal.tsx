import { useEffect, useRef, useState } from 'react'
import { SalonModal } from '../../components/SalonModal'
import { SalonInput } from '../../components/selection/SalonInput'
import { SalonSelect } from '../../components/selection/SalonSelect'
import { availabilityRequest, absenceKind, endOfLunch } from './availabilityApi'
import type { WorkingDay, AbsenceRequest } from './availabilityApi'
import { AvailabilityRequests } from './AvailabilityRequests'
import './availability.css'
export function AbsenceModal({
  onClose,
  onChanged,
  canRequest,
  initialTab = 'new',
}: {
  onClose: () => void
  onChanged: () => void
  canRequest: boolean
  initialTab?: 'new' | 'history'
}) {
  const [tab, setTab] = useState<'new' | 'history'>(
      canRequest ? initialTab : 'history',
    ),
    [me, setMe] = useState<{
      id: number
      name: string
      hours: WorkingDay[]
    } | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const [kind, setKind] = useState<AbsenceRequest['kind']>('lunch'),
    [date, setDate] = useState(''),
    [endDate, setEndDate] = useState(''),
    [start, setStart] = useState(''),
    [end, setEnd] = useState(''),
    [reason, setReason] = useState('')
  const key = useRef<{ body: string; key: string } | null>(null)
  useEffect(() => {
    const c = new AbortController()
    availabilityRequest<typeof me>('/availability/me', { signal: c.signal })
      .then((d) => {
        if (!c.signal.aborted) {
          setMe(d)
          setLoading(false)
        }
      })
      .catch((cause) => {
        if (!c.signal.aborted) {
          setError(cause.message)
          setLoading(false)
        }
      })
    return () => c.abort()
  }, [])
  const day = date
    ? me?.hours.find(
        (h) => h.weekday === new Date(date + 'T12:00:00Z').getUTCDay(),
      )
    : null
  return (
    <SalonModal
      title="Solicitações de disponibilidade"
      description="Solicite alterações e acompanhe a decisão da gestão."
      busy={busy}
      onClose={onClose}
    >
      <nav
        className="availability-tabs"
        aria-label="Solicitações do funcionário"
      >
        {canRequest && (
          <button
            type="button"
            aria-current={tab === 'new' ? 'page' : undefined}
            onClick={() => setTab('new')}
          >
            Nova solicitação
          </button>
        )}
        <button
          type="button"
          aria-current={tab === 'history' ? 'page' : undefined}
          onClick={() => setTab('history')}
        >
          Meus pedidos
        </button>
      </nav>
      {notice && (
        <p role="status" className="booking-availability-notice">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="booking-error">
          {error}
        </p>
      )}
      {tab === 'history' ? (
        <AvailabilityRequests onChanged={onChanged} />
      ) : loading ? (
        <p role="status">Carregando expediente…</p>
      ) : !me ? (
        <p>Seu usuário precisa estar vinculado a um funcionário ativo.</p>
      ) : (
        <form
          className="booking-form"
          onSubmit={async (event) => {
            event.preventDefault()
            setBusy(true)
            setError('')
            const body = JSON.stringify({
              kind,
              date,
              ...(kind === 'vacation'
                ? { endDate }
                : {
                    startsAt: start,
                    ...(kind === 'absence' ? { endsAt: end } : {}),
                  }),
              reason,
            })
            if (key.current?.body !== body)
              key.current = { body, key: crypto.randomUUID() }
            try {
              await availabilityRequest('/availability/requests', {
                method: 'POST',
                body: JSON.stringify({
                  ...JSON.parse(body),
                  requestKey: key.current.key,
                }),
              })
              key.current = null
              setNotice(
                'Solicitação enviada. A agenda só será alterada após a aprovação.',
              )
              setTab('history')
              setReason('')
              onChanged()
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : 'Não foi possível enviar a solicitação.',
              )
            } finally {
              setBusy(false)
            }
          }}
        >
          <fieldset disabled={busy}>
            <legend>{me.name}</legend>
            <label>
              Tipo
              <SalonSelect
                value={kind}
                onChange={(e) => setKind(e.target.value as typeof kind)}
              >
                {Object.entries(absenceKind).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </SalonSelect>
            </label>
            <label>
              {kind === 'vacation' ? 'Primeiro dia de férias' : 'Data'}
              <SalonInput
                type="date"
                required
                value={date}
                min={new Intl.DateTimeFormat('en-CA', {
                  timeZone: 'America/Sao_Paulo',
                }).format(new Date())}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            {kind === 'vacation' ? (
              <label>
                Último dia de férias (inclusive)
                <SalonInput
                  type="date"
                  required
                  min={date}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </label>
            ) : (
              <>
                <div className="availability-time-grid">
                  <label>
                    {kind === 'lunch' ? 'Novo início do almoço' : 'Início'}
                    <SalonInput
                      type="time"
                      required
                      value={start}
                      min={day?.opensAt.slice(0, 5)}
                      max={day?.closesAt.slice(0, 5)}
                      onChange={(e) => setStart(e.target.value)}
                    />
                  </label>
                  {kind === 'absence' && (
                    <label>
                      Término
                      <SalonInput
                        type="time"
                        required
                        value={end}
                        min={start}
                        max={day?.closesAt.slice(0, 5)}
                        onChange={(e) => setEnd(e.target.value)}
                      />
                    </label>
                  )}
                </div>
                {kind === 'lunch' && (
                  <p className="booking-note">
                    {day?.lunchStart
                      ? `Almoço habitual: ${day.lunchStart.slice(0, 5)} às ${endOfLunch(day.lunchStart)}.`
                      : 'Não há almoço habitual configurado para este dia.'}
                    {start && ` Novo almoço: ${start} às ${endOfLunch(start)}.`}{' '}
                    A troca vale somente para a data escolhida.
                  </p>
                )}
                {date && !day && (
                  <p className="booking-alert">
                    Não há expediente configurado nesta data.
                  </p>
                )}
              </>
            )}
            <label>
              Motivo ou observação
              <textarea
                required
                minLength={3}
                maxLength={2000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          </fieldset>
          <p className="booking-note">
            Sua solicitação será analisada por ADMIN ou MASTER. Nenhum
            atendimento será cancelado automaticamente.
          </p>
          <button className="primary-button" disabled={busy}>
            {busy ? 'Enviando…' : 'Enviar solicitação'}
          </button>
        </form>
      )}
    </SalonModal>
  )
}
