import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { bookingDate, bookingRequest, money } from './bookingApi'
import type { BookingCatalog, BookingOrder, BookingSlot } from './bookingApi'

export function BookingForm({
  catalog,
  onBooked,
  staff = false,
}: {
  catalog: BookingCatalog
  onBooked: (order: BookingOrder) => void
  staff?: boolean
}) {
  const [treatmentIds, setTreatmentIds] = useState<number[]>([])
  const [employeeId, setEmployeeId] = useState('')
  const [date, setDate] = useState('')
  const [deadline, setDeadline] = useState('')
  const [slots, setSlots] = useState<BookingSlot[]>([])
  const [selected, setSelected] = useState<BookingSlot | null>(null)
  const [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const [customerSearch, setCustomerSearch] = useState(''),
    [customers, setCustomers] = useState<
      { id: number; name: string; email: string }[]
    >([]),
    [customerId, setCustomerId] = useState('')
  const request = useRef<{ fingerprint: string; key: string } | null>(null)
  const acceptingBookings = staff || catalog.settings.enabled
  const chosenTreatments = catalog.treatments.filter((treatment) =>
    treatmentIds.includes(treatment.id),
  )
  const selectedTotal = chosenTreatments.reduce(
    (total, treatment) => total + treatment.price,
    0,
  )
  const selectedDuration = chosenTreatments.reduce(
    (total, treatment) => total + treatment.durationMinutes,
    0,
  )
  const treatmentsKey = treatmentIds.join(',')
  useEffect(() => {
    setSelected(null)
    setSlots([])
    setError('')
    setLoading(false)
    if (
      !acceptingBookings ||
      !employeeId ||
      !date ||
      !treatmentsKey ||
      (staff && !deadline)
    )
      return
    const controller = new AbortController()
    setLoading(true)
    const params = new URLSearchParams({
      employeeId,
      date,
      treatmentIds: treatmentsKey,
    })
    // datetime-local represents the salon's fixed UTC-03 timezone, not the device timezone.
    if (staff)
      params.set('depositDeadline', new Date(deadline + '-03:00').toISOString())
    bookingRequest<BookingSlot[]>(
      `${staff ? '/booking/staff-slots' : '/customer/slots'}?${params}`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted) setSlots(data)
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to load availability.',
          )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [employeeId, date, treatmentsKey, staff, deadline, acceptingBookings])
  useEffect(() => {
    if (!staff || customerSearch.trim().length < 2) {
      setCustomers([])
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      bookingRequest<{ id: number; name: string; email: string }[]>(
        `/booking/customers?search=${encodeURIComponent(customerSearch)}`,
        { signal: controller.signal },
      )
        .then((data) => {
          if (!controller.signal.aborted) setCustomers(data)
        })
        .catch((cause) => {
          if (!controller.signal.aborted) setError(cause.message)
        })
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [customerSearch, staff])
  const employees = catalog.employees.filter(
    (employee) =>
      treatmentIds.length > 0 &&
      treatmentIds.every((id) => employee.treatmentIds.includes(id)),
  )
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!selected || !acceptingBookings) return
    const body = {
      employeeId: Number(employeeId),
      treatmentIds,
      startsAt: selected.startsAt,
      expectedTotal: selected.total,
      expectedDeposit: selected.deposit,
      expectedDeadline: selected.deadline,
      expectedInstructions: selected.instructions,
      ...(staff
        ? {
            customerId: Number(customerId),
            depositDeadline: new Date(deadline + '-03:00').toISOString(),
          }
        : {}),
    }
    const fingerprint = JSON.stringify(body)
    if (request.current?.fingerprint !== fingerprint)
      request.current = { fingerprint, key: crypto.randomUUID() }
    setBusy(true)
    setError('')
    try {
      const order = await bookingRequest<BookingOrder>(
        staff ? '/booking/staff-bookings' : '/customer/bookings',
        {
          method: 'POST',
          body: JSON.stringify({ ...body, requestKey: request.current.key }),
        },
      )
      onBooked(order)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to reserve this time.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="booking-form" onSubmit={submit}>
      {!acceptingBookings && (
        <p className="booking-availability-notice" role="status">
          As reservas online estão pausadas no momento. Você pode consultar
          nossos serviços e valores abaixo. Entre em contato com o salão para
          agendar.
        </p>
      )}
      {catalog.employees.length === 0 && (
        <p className="booking-availability-notice" role="status">
          Ainda não há profissionais disponíveis para agendamento online. Assim
          que a equipe disponibilizar os horários, eles aparecerão aqui.
        </p>
      )}
      <fieldset disabled={busy}>
        <legend>Escolha seu momento de cuidado</legend>
        {staff && (
          <>
            <label>
              Buscar cliente cadastrado
              <input
                value={customerSearch}
                onChange={(event) => {
                  setCustomerSearch(event.target.value)
                  setCustomerId('')
                }}
                placeholder="Nome ou e-mail"
              />
            </label>
            <label>
              Cliente
              <select
                required
                value={customerId}
                onChange={(event) => setCustomerId(event.target.value)}
              >
                <option value="">Selecione</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} · {customer.email}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Prazo específico do sinal (horário de Brasília)
              <input
                required
                type="datetime-local"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
              />
            </label>
            <p className="booking-note">
              A equipe pode combinar um prazo futuro específico, anterior ao
              atendimento. Na reserva online, o prazo próximo é calculado
              automaticamente.
            </p>
          </>
        )}
        <div
          className="booking-treatments"
          role="group"
          aria-label="Procedimentos"
        >
          {catalog.treatments.map((treatment) => (
            <label key={treatment.id} className="booking-choice">
              <input
                type="checkbox"
                checked={treatmentIds.includes(treatment.id)}
                onChange={(event) => {
                  setTreatmentIds((ids) =>
                    event.target.checked
                      ? [...ids, treatment.id]
                      : ids.filter((id) => id !== treatment.id),
                  )
                  setEmployeeId('')
                }}
              />
              <span>
                <strong>{treatment.name}</strong>
                <small>
                  {money(treatment.price)} · {treatment.durationMinutes} min
                </small>
              </span>
            </label>
          ))}
        </div>
        {!catalog.treatments.length && (
          <p>Nenhum procedimento disponível no momento.</p>
        )}
        {chosenTreatments.length > 0 && (
          <div className="booking-selection-summary" aria-live="polite">
            <span>Procedimentos selecionados</span>
            <strong>{money(selectedTotal)}</strong>
            <span>{selectedDuration} minutos de cuidado</span>
          </div>
        )}
        <label>
          Profissional
          <select
            required
            disabled={!acceptingBookings || employees.length === 0}
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
          >
            <option value="">Selecione</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
        </label>
        {treatmentIds.length > 0 && employees.length === 0 && (
          <p>
            Nenhuma profissional habilitada para essa combinação. Escolha outros
            procedimentos ou entre em contato com o salão.
          </p>
        )}
        {employeeId && (
          <p className="booking-note">
            Dias de atendimento:{' '}
            {employees
              .find((employee) => employee.id === Number(employeeId))
              ?.hours.map(
                (hour) =>
                  [
                    'domingo',
                    'segunda-feira',
                    'terça-feira',
                    'quarta-feira',
                    'quinta-feira',
                    'sexta-feira',
                    'sábado',
                  ][hour.weekday],
              )
              .join(', ')}
            . Horário de Brasília.
          </p>
        )}
        <label>
          Data do atendimento
          <input
            required
            type="date"
            disabled={!acceptingBookings || !employeeId}
            min={new Intl.DateTimeFormat('en-CA', {
              timeZone: 'America/Sao_Paulo',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            }).format(new Date())}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        {loading && <p role="status">Consultando horários…</p>}
        {!loading && date && employeeId && !slots.length && (
          <p className="booking-note">
            Nenhum horário disponível para essa profissional e esses
            procedimentos nesta data. Escolha outro dia ou profissional.
          </p>
        )}
        <div
          className="booking-slots"
          role="group"
          aria-label="Horários disponíveis"
        >
          {slots.map((slot) => (
            <button
              key={slot.startsAt}
              type="button"
              aria-pressed={selected?.startsAt === slot.startsAt}
              onClick={() => setSelected(slot)}
            >
              {new Intl.DateTimeFormat('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'America/Sao_Paulo',
              }).format(new Date(slot.startsAt))}
            </button>
          ))}
        </div>
        {selected && (
          <section className="booking-review" aria-label="Revisão da reserva">
            <h2>Confira sua reserva</h2>
            {selected.shortNotice && (
              <p className="booking-availability-notice">
                Para esta reserva próxima, o sinal tem prazo de até{' '}
                {selected.shortNoticeHours}{' '}
                {selected.shortNoticeHours === 1 ? 'hora' : 'horas'}, limitado
                ao início do atendimento. Confira a data e o horário limite
                abaixo.
              </p>
            )}
            <p>
              {catalog.treatments
                .filter((t) => treatmentIds.includes(t.id))
                .map((t) => t.name)
                .join(' + ')}{' '}
              · {employees.find((e) => e.id === Number(employeeId))?.name}
            </p>
            <p>
              <strong>{bookingDate(selected.startsAt)}</strong> ·{' '}
              {selected.duration} min
            </p>
            <p>
              Valor combinado: <strong>{money(selected.total)}</strong>
            </p>
            <p>
              Sinal necessário: <strong>{money(selected.deposit)}</strong>
            </p>
            <p>
              Confirmação do sinal até{' '}
              <strong>{bookingDate(selected.deadline)}</strong> (Brasília).
            </p>
            <p className="booking-instructions">{selected.instructions}</p>
            <p>
              A reserva fica aguardando sinal. Se a equipe não confirmar o
              recebimento até o prazo, ela será cancelada e o horário será
              liberado.
            </p>
          </section>
        )}
      </fieldset>
      {error && (
        <p className="booking-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="primary-button"
        type="submit"
        disabled={
          !acceptingBookings ||
          busy ||
          !selected ||
          loading ||
          (staff && !customerId)
        }
      >
        {busy ? 'Reservando…' : 'Confirmar solicitação'}
      </button>
    </form>
  )
}
