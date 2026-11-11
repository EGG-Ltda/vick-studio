import { useEffect, useRef, useState } from 'react'
import type { BookingCatalog, BookingSlot } from '../booking/bookingApi'
import { bookingDate, bookingRequest, money } from '../booking/bookingApi'
import type { Promotion } from './socialApi'
import './social.css'
type Choice = {
  treatmentId: number
  employeeId: number
  startsAt: string
  endsAt: string
}
function ProcedureSlot({
  name,
  treatmentId,
  catalog,
  onChange,
  disabled,
}: {
  name: string
  treatmentId: number
  catalog: BookingCatalog
  onChange: (choice: Choice | null) => void
  disabled: boolean
}) {
  const [employee, setEmployee] = useState(''),
    [date, setDate] = useState(''),
    [slots, setSlots] = useState<BookingSlot[]>([]),
    [selected, setSelected] = useState(''),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false)
  useEffect(() => {
    const c = new AbortController()
    if (!employee || !date) return
    bookingRequest<BookingSlot[]>(
      `/customer/slots?${new URLSearchParams({ employeeId: employee, treatmentIds: String(treatmentId), date })}`,
      { signal: c.signal },
    )
      .then((d) => {
        if (!c.signal.aborted) setSlots(d)
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message)
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false)
      })
    return () => c.abort()
  }, [employee, date, treatmentId])
  return (
    <div className="package-slot">
      <h3>{name}</h3>
      <label>
        Profissional
        <select
          disabled={disabled}
          required
          value={employee}
          onChange={(e) => {
            setSlots([])
            setError('')
            setLoading(!!e.target.value && !!date)
            setEmployee(e.target.value)
            setSelected('')
            onChange(null)
          }}
        >
          <option value="">Selecione</option>
          {catalog.employees
            .filter((e) => e.treatmentIds.includes(treatmentId))
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        Dia
        <input
          disabled={disabled}
          required
          type="date"
          min={new Date().toLocaleDateString('en-CA', {
            timeZone: 'America/Sao_Paulo',
          })}
          value={date}
          onChange={(e) => {
            setSlots([])
            setError('')
            setLoading(!!employee && !!e.target.value)
            setDate(e.target.value)
            setSelected('')
            onChange(null)
          }}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p role="status">Consultando horários…</p>
      ) : (
        employee &&
        date && (
          <>
            <div className="package-slot-times">
              {slots.map((s) => (
                <button
                  type="button"
                  disabled={disabled}
                  key={s.startsAt}
                  aria-pressed={selected === s.startsAt}
                  onClick={() => {
                    setSelected(s.startsAt)
                    onChange({
                      treatmentId,
                      employeeId: Number(employee),
                      startsAt: s.startsAt,
                      endsAt: s.endsAt,
                    })
                  }}
                >
                  {new Intl.DateTimeFormat('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'America/Sao_Paulo',
                  }).format(new Date(s.startsAt))}
                </button>
              ))}
            </div>
            {!slots.length && (
              <p>
                Nenhum horário disponível. Escolha outro dia ou profissional.
              </p>
            )}
          </>
        )
      )}
    </div>
  )
}
export function PackageBooking({
  catalog,
  onBooked,
  onSelectionChange,
}: {
  catalog: BookingCatalog
  onBooked: () => void
  onSelectionChange: (selected: boolean) => void
}) {
  const [promotions, setPromotions] = useState<Promotion[]>([]),
    [validUntil, setValidUntil] = useState(''),
    [selected, setSelected] = useState(
      () => sessionStorage.getItem('bookingPackage') ?? '',
    ),
    [choices, setChoices] = useState<Record<number, Choice | null>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [loading, setLoading] = useState(true)
  const key = useRef<string | null>(null)
  useEffect(() => {
    const c = new AbortController()
    bookingRequest<{ items: Promotion[]; validUntil: string }>(
      '/public/promotions',
      { signal: c.signal },
    )
      .then((d) => {
        if (!c.signal.aborted) {
          setPromotions(d.items)
          setValidUntil(d.validUntil)
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message)
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false)
      })
    return () => c.abort()
  }, [])
  const p = promotions.find((p) => String(p.id) === selected),
    items =
      p?.items.flatMap((i) =>
        Array.from({ length: i.quantity }, (_, n) => ({
          ...i,
          label: `${i.name}${i.quantity > 1 ? ` · ${n + 1}/${i.quantity}` : ''}`,
        })),
      ) ?? []
  const packageSelected = !!p
  useEffect(() => {
    onSelectionChange(packageSelected)
  }, [packageSelected, onSelectionChange])
  async function submit() {
    if (!p) return
    setBusy(true)
    setError('')
    setNotice('')
    key.current ??= crypto.randomUUID()
    try {
      const acquired = await bookingRequest<{ id: number }>(
        '/customer/packages',
        {
          method: 'POST',
          body: JSON.stringify({
            promotionId: p.id,
            requestKey: key.current,
            expectedPrice: p.price,
            expectedConditions: p.conditions,
            expectedValidUntil: validUntil,
            appointments: items.map((_, i) => choices[i]),
          }),
        },
      )
      setNotice(
        `Pacote #${acquired.id} reservado! Todos os horários foram confirmados. O pagamento será registrado pela equipe, sem sinal.`,
      )
      setSelected('')
      setChoices({})
      key.current = null
      sessionStorage.removeItem('bookingPackage')
      onBooked()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to acquire package.')
      onBooked()
      const current = await bookingRequest<{
        items: Promotion[]
        validUntil: string
      }>('/public/promotions').catch(() => null)
      if (current) {
        setPromotions(current.items)
        setValidUntil(current.validUntil)
      }
    } finally {
      setBusy(false)
    }
  }
  if (!loading && !promotions.length && !error) return null
  return (
    <section className="package-booking">
      <span className="salon-eyebrow">Cuidados que se completam</span>
      <h2>Escolha um pacote</h2>
      {loading && <p role="status">Carregando pacotes…</p>}
      {error && (
        <p className="booking-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <label>
        Pacote disponível
        <select
          disabled={busy}
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value)
            setChoices({})
            key.current = null
            setError('')
            setNotice('')
          }}
        >
          <option value="">Prefiro agendar um serviço avulso</option>
          {promotions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title} · {money(p.price)}
            </option>
          ))}
        </select>
      </label>
      {p && (
        <>
          <p>{p.description}</p>
          <strong>Total combinado: {money(p.price)}</strong>
          <p>{p.conditions}</p>
          <p>
            Todos os atendimentos devem terminar até{' '}
            <strong>{bookingDate(validUntil)}</strong> (Brasília). Escolha todos
            os horários agora, sem sobreposição.
          </p>
          <p>
            Sem sinal para o pacote. A reserva não significa pagamento recebido.
          </p>
          {items.map((item, i) => (
            <ProcedureSlot
              key={`${p.id}-${i}`}
              name={item.label}
              treatmentId={item.treatmentId}
              catalog={catalog}
              disabled={busy}
              onChange={(choice) => {
                setChoices((c) => ({ ...c, [i]: choice }))
                key.current = null
              }}
            />
          ))}
          {items.every((_, i) => choices[i]) && (
            <div className="booking-review">
              <h3>Confira seus horários</h3>
              <ul>
                {items.map((item, i) => {
                  const c = choices[i]!
                  return (
                    <li key={i}>
                      {item.label} · {bookingDate(c.startsAt)} ·{' '}
                      {
                        catalog.employees.find((e) => e.id === c.employeeId)
                          ?.name
                      }{' '}
                      ·{' '}
                      {Math.round(
                        (new Date(c.endsAt).getTime() -
                          new Date(c.startsAt).getTime()) /
                          60000,
                      )}{' '}
                      min
                    </li>
                  )
                })}
              </ul>
              <p>
                Total do pacote: <strong>{money(p.price)}</strong>
              </p>
            </div>
          )}
          <button
            type="button"
            className="primary-button"
            disabled={
              busy ||
              !catalog.settings.enabled ||
              !items.every((_, i) => choices[i])
            }
            onClick={() => void submit()}
          >
            {busy
              ? 'Validando todos os horários…'
              : 'Confirmar aquisição e horários'}
          </button>
        </>
      )}
    </section>
  )
}
