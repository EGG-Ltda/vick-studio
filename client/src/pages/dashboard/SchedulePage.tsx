import { AbsenceModal } from '../availability/AbsenceModal'
import { absenceKind } from '../availability/availabilityApi'
import type { AvailabilityBlock } from '../availability/availabilityApi'
import { useSearchParams } from 'react-router-dom'
import '../availability/availability.css'
import { SalonInput } from '../../components/selection/SalonInput'
import { calendarStyle } from './calendarColors'
import { useAuth } from '../../core/auth/useAuth'
import { allowed } from '../../core/auth/permissions'
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { listSchedules } from './calendarApi'
import type { Schedule } from './calendarApi'
import { SalonModal } from '../../components/SalonModal'
import { SalonIcon } from '../../components/SalonIcon'
import { BookingForm } from '../booking/BookingForm'
import { BookingOrderModal } from '../booking/BookingOrderModal'
import {
  bookingRequest,
  bookingStatus,
  cancellationText,
} from '../booking/bookingApi'
import type { BookingCatalog } from '../booking/bookingApi'
import '../booking/booking.css'
const salonTime = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value))
const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
export default function SchedulePage() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const [showAbsence, setShowAbsence] = useState(false)
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([])
  const [date, setDate] = useState(today),
    [schedules, setSchedules] = useState<Schedule[]>([]),
    [catalog, setCatalog] = useState<BookingCatalog | null>(null),
    [orderId, setOrderId] = useState<number | null>(null),
    [showForm, setShowForm] = useState(false),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0),
    [tv, setTv] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    let running = false
    async function load() {
      if (running) return
      running = true
      try {
        const start = new Date(date + 'T00:00:00-03:00'),
          end = new Date(start.getTime() + 86400000)
        const [items, data, unavailable] = await Promise.all([
          listSchedules(start, end),
          bookingRequest<BookingCatalog>('/booking/catalog', {
            signal: controller.signal,
          }),
          bookingRequest<AvailabilityBlock[]>(
            '/availability/blocks?' +
              new URLSearchParams({
                start: start.toISOString(),
                end: end.toISOString(),
              }),
            { signal: controller.signal },
          ),
        ])
        if (!controller.signal.aborted) {
          const grouped = new Map<string, Schedule>()
          for (const item of items) {
            const existing = grouped.get(`${item.id}-${item.employeeId}`)
            grouped.set(
              `${item.id}-${item.employeeId}`,
              existing
                ? {
                    ...existing,
                    treatmentName:
                      existing.treatmentName + ' + ' + item.treatmentName,
                  }
                : item,
            )
          }
          setSchedules([...grouped.values()])
          setCatalog(data)
          setBlocks(unavailable)
          setError('')
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to load schedules.',
          )
      } finally {
        if (!controller.signal.aborted) setLoading(false)
        running = false
      }
    }
    void load()
    window.addEventListener('focus', load)
    const timer = setInterval(() => void load(), 30000)
    return () => {
      controller.abort()
      clearInterval(timer)
      window.removeEventListener('focus', load)
    }
  }, [date, revision])
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTv(false)
    }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [])
  function move(days: number) {
    const value = new Date(date + 'T12:00:00Z')
    value.setUTCDate(value.getUTCDate() + days)
    setDate(value.toISOString().slice(0, 10))
    setLoading(true)
  }
  const professionalMap = new Map(
    (catalog?.employees ?? []).map((employee) => [
      employee.id,
      { name: employee.name, calendarColor: employee.calendarColor },
    ]),
  )
  for (const schedule of schedules)
    professionalMap.set(schedule.employeeId, {
      name: schedule.employeeName,
      calendarColor: schedule.calendarColor,
    })
  const professionals = [...professionalMap].map(([id, professional]) => ({
    id,
    ...professional,
  }))
  const columns = professionals.length
    ? professionals
    : [
        {
          id: 0,
          name: 'Nenhuma profissional cadastrada',
          calendarColor: undefined,
        },
      ]
  const hours = schedules.map((schedule) =>
    Number(salonTime(schedule.startsAt).slice(0, 2)),
  )
  const timeSlots = Array.from(
    { length: Math.max(18, ...hours) - Math.min(9, ...hours) + 1 },
    (_, i) => String(i + Math.min(9, ...hours)).padStart(2, '0') + ':00',
  )
  return (
    <section className={`dashboard-view${tv ? ' schedule-tv' : ''}`}>
      <header className="dashboard-view-header">
        <div>
          <span className="salon-eyebrow">
            Cada horário, um momento especial
          </span>
          <h1>{tv ? 'Agenda da equipe' : 'Agenda'}</h1>
          <p>
            Confirme o sinal e acompanhe as reservas. Atualização a cada 30
            segundos.
          </p>
        </div>
        <div className="schedule-actions">
          {user?.role === 'OPERATIONAL' &&
            allowed(user, 'availability.view') && (
              <button type="button" onClick={() => setShowAbsence(true)}>
                {allowed(user, 'availability.request')
                  ? 'Solicitar ausência'
                  : 'Meus pedidos'}
              </button>
            )}
          <button
            type="button"
            aria-pressed={tv}
            onClick={() => setTv((value) => !value)}
          >
            <SalonIcon name="tv" />
            {tv ? 'Voltar à agenda' : 'Expandir para TV'}
          </button>
          {tv && (
            <button
              type="button"
              onClick={() =>
                void document.documentElement
                  .requestFullscreen()
                  .catch(() => setError('Unable to enter fullscreen.'))
              }
            >
              Tela cheia
            </button>
          )}
          {!tv && allowed(user, 'agenda.create') && (
            <button
              className="primary-button"
              onClick={() => setShowForm(true)}
            >
              Novo agendamento
            </button>
          )}
        </div>
      </header>
      {(showAbsence || params.get('solicitacoes') === '1') &&
        user?.role === 'OPERATIONAL' &&
        allowed(user, 'availability.view') && (
          <AbsenceModal
            canRequest={allowed(user, 'availability.request')}
            initialTab={params.get('solicitacoes') ? 'history' : 'new'}
            onClose={() => {
              setShowAbsence(false)
              setParams({})
            }}
            onChanged={() => {
              setRevision((r) => r + 1)
              window.dispatchEvent(new Event('availability-updated'))
            }}
          />
        )}
      {showForm && catalog && (
        <SalonModal
          title="Novo agendamento"
          description="Reserva pela equipe, com prazo específico para o sinal."
          onClose={() => setShowForm(false)}
        >
          <BookingForm
            catalog={catalog}
            staff
            onBooked={() => {
              setShowForm(false)
              setRevision((value) => value + 1)
            }}
          />
        </SalonModal>
      )}
      {orderId !== null && (
        <BookingOrderModal
          id={orderId}
          onClose={() => setOrderId(null)}
          onChanged={() => setRevision((value) => value + 1)}
        />
      )}
      <div className="schedule-toolbar">
        <div className="schedule-date-navigation">
          <button aria-label="Dia anterior" onClick={() => move(-1)}>
            ‹
          </button>
          <label>
            Data{' '}
            <SalonInput
              type="date"
              value={date}
              onChange={(e) => {
                if (e.target.value) {
                  setDate(e.target.value)
                  setLoading(true)
                }
              }}
            />
          </label>
          <button aria-label="Próximo dia" onClick={() => move(1)}>
            ›
          </button>
          <button onClick={() => setDate(today())}>Hoje</button>
        </div>
        <p>
          {
            new Set(
              schedules
                .filter((s) => s.status !== 'cancelled')
                .map((s) => s.id),
            ).size
          }{' '}
          reservas ativas ·{' '}
          {
            new Set(
              schedules
                .filter((s) => s.status === 'awaiting_deposit')
                .map((s) => s.id),
            ).size
          }{' '}
          aguardando sinal
        </p>
      </div>
      {error && (
        <p className="booking-error" role="alert">
          {error}
        </p>
      )}
      {loading && <p role="status">Carregando agenda…</p>}
      <div
        className="calendar-scroll"
        role="region"
        aria-label="Grade de horários"
        tabIndex={0}
      >
        <div
          className="calendar"
          style={
            {
              '--professional-count': Math.max(professionals.length, 1),
            } as CSSProperties
          }
        >
          <div className="calendar-header">
            <div className="calendar-corner">
              <SalonIcon name="agenda" />
            </div>
            {columns.map((professional) => (
              <div
                className="professional-heading"
                key={professional.id}
                style={
                  calendarStyle(professional.calendarColor) as CSSProperties
                }
              >
                <strong>{professional.name}</strong>
              </div>
            ))}
          </div>
          <div className="calendar-body">
            {timeSlots.map((time) => (
              <div className="calendar-row" key={time}>
                <time>{time}</time>
                {columns.map((professional) => (
                  <div
                    className={
                      'calendar-cell' +
                      (blocks.some(
                        (b) =>
                          b.employeeId === professional.id &&
                          Date.parse(b.startsAt) <
                            Date.parse(date + 'T' + time + ':00-03:00') +
                              3600000 &&
                          Date.parse(b.endsAt) >
                            Date.parse(date + 'T' + time + ':00-03:00'),
                      )
                        ? ' is-unavailable'
                        : '')
                    }
                    key={professional.id}
                  >
                    {blocks
                      .filter(
                        (b) =>
                          b.employeeId === professional.id &&
                          Date.parse(b.startsAt) <
                            Date.parse(date + 'T' + time + ':00-03:00') +
                              3600000 &&
                          Date.parse(b.endsAt) >
                            Date.parse(date + 'T' + time + ':00-03:00') &&
                          (salonTime(b.startsAt).slice(0, 2) ===
                            time.slice(0, 2) ||
                            (time === timeSlots[0] &&
                              Date.parse(b.startsAt) <
                                Date.parse(date + 'T' + time + ':00-03:00'))),
                      )
                      .map((b, i) => (
                        <div
                          className="schedule-block"
                          key={
                            b.kind + '-' + (b.requestId ?? 'regular') + '-' + i
                          }
                        >
                          <strong>
                            {b.kind === 'lunch'
                              ? 'Almoço'
                              : absenceKind[b.kind]}
                          </strong>
                          <span>
                            {b.kind === 'vacation'
                              ? 'Indisponível neste dia'
                              : salonTime(b.startsAt) +
                                ' – ' +
                                salonTime(b.endsAt)}
                          </span>
                          <small>{b.employeeName}</small>
                        </div>
                      ))}
                    {schedules
                      .filter(
                        (schedule) =>
                          schedule.employeeId === professional.id &&
                          schedule.status !== 'cancelled' &&
                          salonTime(schedule.startsAt).slice(0, 2) ===
                            time.slice(0, 2),
                      )
                      .map((schedule) => (
                        <button
                          key={`${schedule.id}-${schedule.employeeId}`}
                          type="button"
                          onClick={() => setOrderId(schedule.id)}
                          className={`appointment employee-appointment appointment-${schedule.status.replaceAll('_', '-')}`}
                          style={
                            calendarStyle(
                              schedule.calendarColor,
                            ) as CSSProperties
                          }
                        >
                          <span className="appointment-time">
                            {salonTime(schedule.startsAt)} –{' '}
                            {salonTime(schedule.endsAt)}
                          </span>
                          <strong>{schedule.customerName}</strong>
                          {schedule.groupId && (
                            <small>Vínculo #{schedule.groupId}</small>
                          )}
                          <span>{schedule.treatmentName}</span>
                          <span>{schedule.employeeName}</span>
                          <small
                            className={`appointment-status status-${schedule.status}`}
                          >
                            {bookingStatus(schedule.status)}
                          </small>
                        </button>
                      ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      {!loading && !schedules.length && (
        <p className="empty-calendar">Nenhum agendamento para este dia.</p>
      )}
      <section className="booking-history">
        <h2>Cancelamentos do dia</h2>
        <p>Essas reservas permanecem no histórico e não ocupam horários.</p>
        <div className="booking-list">
          {schedules
            .filter((schedule) => schedule.status === 'cancelled')
            .map((schedule) => (
              <button
                key={schedule.id}
                className="cancelled employee-cancelled"
                style={calendarStyle(schedule.calendarColor) as CSSProperties}
                type="button"
                onClick={() => setOrderId(schedule.id)}
              >
                <strong>
                  {salonTime(schedule.startsAt)} · {schedule.customerName}
                </strong>
                <span>
                  {schedule.employeeName} · {schedule.treatmentName}
                </span>
                <span>
                  {cancellationText(schedule.cancellationReason ?? null)}
                </span>
                <small className="appointment-status status-cancelled">
                  Cancelado
                </small>
                <small>Abrir comanda e motivo do cancelamento</small>
              </button>
            ))}
        </div>
        {!schedules.some((schedule) => schedule.status === 'cancelled') && (
          <p>Nenhum cancelamento nesta data.</p>
        )}
      </section>
    </section>
  )
}
