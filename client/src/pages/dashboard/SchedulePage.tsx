import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, DragEvent, FormEvent } from 'react'
import { listSchedules, type Schedule } from './calendarApi'
import { SalonModal } from '../../components/SalonModal'
import { SalonIcon } from '../../components/SalonIcon'

function uniqueSchedules(schedules: Schedule[]): Schedule[] {
  return Array.from(
    new Map(schedules.map((schedule) => [schedule.id, schedule])).values(),
  )
}

function startOfDay(date: Date): Date {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

function endOfDay(date: Date): Date {
  const result = startOfDay(date)
  result.setDate(result.getDate() + 1)
  return result
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function displayHour(schedule: Schedule, date: Date): number {
  const start = new Date(schedule.startsAt)
  return start < startOfDay(date) ? 0 : start.getHours()
}

function statusLabel(status: Schedule['status']): string {
  const labels: Record<Schedule['status'], string> = {
    scheduled: 'Agendado',
    in_progress: 'Em atendimento',
    completed: 'Concluído',
    cancelled: 'Cancelado',
  }
  return labels[status]
}

function statusClass(status: Schedule['status']): string {
  return status.replace('_', '-')
}

function SchedulePage() {
  const [isTvMode, setIsTvMode] = useState(false)
  const [fullscreenError, setFullscreenError] = useState('')
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draggedScheduleId, setDraggedScheduleId] = useState<number | null>(
    null,
  )
  const [draggedEmployeeId, setDraggedEmployeeId] = useState<number | null>(
    null,
  )
  const [showForm, setShowForm] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [treatmentName, setTreatmentName] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [durationMinutes, setDurationMinutes] = useState('60')
  const nextLocalId = useRef(-1)

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsTvMode(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [])

  useEffect(() => {
    if (!isTvMode) return
    let isCurrent = true
    let timer: ReturnType<typeof setTimeout>
    async function refresh() {
      try {
        const data = await listSchedules(
          startOfDay(selectedDate),
          endOfDay(selectedDate),
        )
        if (isCurrent) {
          setSchedules((current) =>
            uniqueSchedules([
              ...data,
              ...current.filter((schedule) => schedule.id < 0),
            ]),
          )
          setError(null)
        }
      } catch {
        if (isCurrent)
          setError(
            'Não foi possível atualizar a agenda. Tentaremos novamente em 30 segundos.',
          )
      } finally {
        if (isCurrent) timer = setTimeout(refresh, 30_000)
      }
    }
    timer = setTimeout(refresh, 30_000)
    return () => {
      isCurrent = false
      clearTimeout(timer)
    }
  }, [isTvMode, selectedDate])

  async function toggleTvMode() {
    setFullscreenError('')
    if (isTvMode) {
      setIsTvMode(false)
      if (document.fullscreenElement)
        await document.exitFullscreen().catch(() => {})
      return
    }
    setShowForm(false)
    setIsTvMode(true)
  }

  async function enterFullscreen() {
    try {
      await document.documentElement.requestFullscreen()
      setFullscreenError('')
    } catch {
      setFullscreenError(
        'Tela cheia indisponível neste navegador. O modo TV continua ativo.',
      )
    }
  }

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)
    setError(null)

    listSchedules(startOfDay(selectedDate), endOfDay(selectedDate))
      .then((data) => {
        if (isMounted) setSchedules(uniqueSchedules(data))
      })
      .catch(() => {
        if (isMounted) setError('Não foi possível carregar os agendamentos.')
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [selectedDate])

  const formattedDate = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(selectedDate)

  function changeDate(amount: number) {
    setSelectedDate((currentDate) => {
      const nextDate = new Date(currentDate)
      nextDate.setDate(nextDate.getDate() + amount)
      return nextDate
    })
  }

  function goToToday() {
    setSelectedDate(new Date())
  }

  function addSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const [hours, minutes] = startTime.split(':').map(Number)
    const startsAt = new Date(selectedDate)
    startsAt.setHours(hours, minutes, 0, 0)
    const endsAt = new Date(
      startsAt.getTime() + Number(durationMinutes) * 60 * 1000,
    )

    const localId = nextLocalId.current
    nextLocalId.current -= 1

    setSchedules((currentSchedules) =>
      uniqueSchedules([
        ...currentSchedules,
        {
          id: localId,
          customerId: localId,
          customerName,
          employeeId: Number(employeeId),
          employeeName:
            professionals.find(
              (professional) => professional.id === Number(employeeId),
            )?.name ?? '',
          treatmentId: localId,
          treatmentName,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          status: 'scheduled',
        },
      ]),
    )
    setCustomerName('')
    setEmployeeId('')
    setTreatmentName('')
    setStartTime('09:00')
    setDurationMinutes('60')
    setShowForm(false)
    setError(null)
  }

  function handleDragStart(event: DragEvent<HTMLElement>, scheduleId: number) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(scheduleId))
    const schedule = schedules.find((item) => item.id === scheduleId)
    setDraggedScheduleId(scheduleId)
    setDraggedEmployeeId(schedule?.employeeId ?? null)
  }

  function handleDrop(
    event: DragEvent<HTMLDivElement>,
    employeeId: number,
    time: string,
  ) {
    event.preventDefault()
    const scheduleId = Number(event.dataTransfer.getData('text/plain'))
    const id = Number.isNaN(scheduleId) ? draggedScheduleId : scheduleId
    if (id === null || id === undefined || employeeId !== draggedEmployeeId)
      return

    const [hours, minutes] = time.split(':').map(Number)
    const nextStart = new Date(selectedDate)
    nextStart.setHours(hours, minutes, 0, 0)

    setSchedules((currentSchedules) =>
      uniqueSchedules(
        currentSchedules.map((schedule) => {
          if (schedule.id !== id) return schedule

          const duration =
            new Date(schedule.endsAt).getTime() -
            new Date(schedule.startsAt).getTime()
          return {
            ...schedule,
            startsAt: nextStart.toISOString(),
            endsAt: new Date(nextStart.getTime() + duration).toISOString(),
          }
        }),
      ),
    )
    setDraggedScheduleId(null)
    setDraggedEmployeeId(null)
  }

  const loadedProfessionals = Array.from(
    new Map(
      schedules.map((schedule) => [schedule.employeeId, schedule.employeeName]),
    ).entries(),
  ).map(([id, name]) => ({ id, name }))
  const professionals = loadedProfessionals
  const displayProfessionals =
    professionals.length > 0
      ? professionals
      : [{ id: 0, name: 'Nenhuma profissional cadastrada' }]
  const calendarStyle = {
    '--professional-count': Math.max(professionals.length, 1),
  } as CSSProperties
  const hours = schedules.map((schedule) => displayHour(schedule, selectedDate))
  const firstHour = Math.min(9, ...hours)
  const lastHour = Math.max(18, ...hours)
  const timeSlots = Array.from(
    { length: lastHour - firstHour + 1 },
    (_, index) => `${String(index + firstHour).padStart(2, '0')}:00`,
  )

  const completedCount = schedules.filter(
    (schedule) => schedule.status === 'completed',
  ).length

  return (
    <section className={`dashboard-view${isTvMode ? ' schedule-tv' : ''}`}>
      <header className="dashboard-view-header">
        <div>
          <span className="salon-eyebrow">
            Cada horário, um momento especial
          </span>
          <h1>{isTvMode ? 'Agenda da equipe' : 'Agenda'}</h1>
          <p>
            {isTvMode
              ? 'Vick Florez · Atualização a cada 30 segundos'
              : 'Organize os atendimentos e faça o dia florescer.'}
          </p>
        </div>
        <div className="schedule-actions">
          <button type="button" onClick={toggleTvMode} aria-pressed={isTvMode}>
            <SalonIcon name="tv" />
            {isTvMode ? 'Voltar à agenda' : 'Expandir para TV'}
          </button>
          {isTvMode && (
            <button type="button" onClick={enterFullscreen}>
              Tela cheia
            </button>
          )}
          {!isTvMode && (
            <button
              type="button"
              className="primary-button"
              onClick={() => setShowForm(true)}
            >
              <span aria-hidden="true">＋</span> Novo agendamento
            </button>
          )}
        </div>
      </header>

      {showForm && (
        <SalonModal
          title="Novo agendamento"
          description="Reserve um momento de cuidado na agenda do salão."
          onClose={() => setShowForm(false)}
        >
          <form className="user-form schedule-form" onSubmit={addSchedule}>
            <label>
              Cliente
              <input
                autoFocus
                placeholder="Nome da cliente"
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                required
              />
            </label>
            <label>
              Profissional
              <select
                value={employeeId}
                onChange={(event) => setEmployeeId(event.target.value)}
                required
                disabled={professionals.length === 0}
              >
                <option value="">Selecione</option>
                {professionals.map((professional) => (
                  <option value={professional.id} key={professional.id}>
                    {professional.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Serviço
              <input
                value={treatmentName}
                onChange={(event) => setTreatmentName(event.target.value)}
                required
              />
            </label>
            <label>
              Horário
              <input
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                required
              />
            </label>
            <label>
              Duração (min.)
              <input
                type="number"
                min="15"
                step="15"
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(event.target.value)}
                required
              />
            </label>
            {professionals.length === 0 && (
              <p className="form-hint">
                Não há profissionais disponíveis na agenda deste dia.
              </p>
            )}
            <div className="modal-actions">
              <button type="button" onClick={() => setShowForm(false)}>
                Cancelar
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={professionals.length === 0}
              >
                Adicionar agendamento
              </button>
            </div>
          </form>
        </SalonModal>
      )}

      <div className="schedule-toolbar">
        <div className="schedule-date-control">
          <div className="date-arrows">
            <button
              type="button"
              onClick={() => changeDate(-1)}
              aria-label="Dia anterior"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => changeDate(1)}
              aria-label="Próximo dia"
            >
              ›
            </button>
          </div>
          <strong>{formattedDate}</strong>
          <button className="today-button" type="button" onClick={goToToday}>
            Hoje
          </button>
        </div>
        <div className="schedule-summary">
          <span>{schedules.length} agendamentos</span>
          <span>{completedCount} concluído</span>
        </div>
      </div>

      {error && <p role="alert">{error}</p>}
      {fullscreenError && <p role="status">{fullscreenError}</p>}
      {isLoading && <p>Carregando agenda...</p>}

      <div
        className="calendar-scroll"
        role="region"
        aria-label="Grade de horários"
        tabIndex={0}
      >
        <div
          className="calendar"
          aria-label="Calendário de agendamentos"
          style={calendarStyle}
        >
          <div className="calendar-header">
            <div className="calendar-corner">
              <SalonIcon name="agenda" />
            </div>
            {displayProfessionals.map((professional) => (
              <div className="professional-heading" key={professional.id}>
                <strong>{professional.name}</strong>
              </div>
            ))}
          </div>
          <div className="calendar-body">
            {timeSlots.map((time) => (
              <div className="calendar-row" key={time}>
                <time>{time}</time>
                {displayProfessionals.map((professional) => {
                  const appointments = schedules
                    .filter(
                      (schedule) =>
                        schedule.employeeId === professional.id &&
                        displayHour(schedule, selectedDate) ===
                          Number(time.split(':')[0]),
                    )
                    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
                  return (
                    <div
                      className="calendar-cell"
                      key={professional.id}
                      onDragOver={(event) => {
                        if (!isTvMode) event.preventDefault()
                      }}
                      onDrop={(event) => {
                        if (!isTvMode) handleDrop(event, professional.id, time)
                      }}
                    >
                      {appointments.map((appointment) => (
                        <article
                          key={appointment.id}
                          className={`appointment appointment-${statusClass(appointment.status)}`}
                          draggable={!isTvMode}
                          onDragStart={(event) =>
                            handleDragStart(event, appointment.id)
                          }
                          onDragEnd={() => {
                            setDraggedScheduleId(null)
                            setDraggedEmployeeId(null)
                          }}
                        >
                          <span className="appointment-time">
                            {formatTime(appointment.startsAt)} –{' '}
                            {formatTime(appointment.endsAt)}
                          </span>
                          <strong>{appointment.customerName}</strong>
                          <span>{appointment.treatmentName}</span>
                          <small>{statusLabel(appointment.status)}</small>
                        </article>
                      ))}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      {!isLoading && schedules.length === 0 && (
        <p className="empty-calendar">Nenhum agendamento para este dia.</p>
      )}
      <div className="calendar-legend" aria-label="Legenda dos agendamentos">
        <span>Agendado</span>
        <span>Em atendimento</span>
        <span>Concluído</span>
        <span>Cancelado</span>
      </div>
    </section>
  )
}

export default SchedulePage
