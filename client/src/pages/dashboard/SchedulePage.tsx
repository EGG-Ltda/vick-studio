import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, DragEvent, FormEvent } from 'react'
import { listSchedules, type Schedule } from './calendarApi'

const timeSlots = Array.from(
  { length: 10 },
  (_, index) => `${String(index + 9).padStart(2, '0')}:00`,
)

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
  const [serviceName, setServiceName] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [durationMinutes, setDurationMinutes] = useState('60')
  const nextLocalId = useRef(-1)

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
          serviceId: localId,
          serviceName,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          status: 'scheduled',
        },
      ]),
    )
    setCustomerName('')
    setEmployeeId('')
    setServiceName('')
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

  const completedCount = schedules.filter(
    (schedule) => schedule.status === 'completed',
  ).length

  return (
    <section className="dashboard-view">
      <header className="dashboard-view-header">
        <div>
          <h1>{formattedDate}</h1>
          <p>Agenda do dia</p>
        </div>
        <div className="schedule-actions">
          <button
            type="button"
            onClick={() => changeDate(-1)}
            aria-label="Dia anterior"
          >
            Anterior
          </button>
          <button type="button" onClick={goToToday}>
            Hoje
          </button>
          <button
            type="button"
            onClick={() => changeDate(1)}
            aria-label="Próximo dia"
          >
            Próximo
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => setShowForm((isVisible) => !isVisible)}
          >
            {showForm ? 'Cancelar' : 'Novo agendamento'}
          </button>
        </div>
      </header>

      {showForm && (
        <form className="user-form" onSubmit={addSchedule}>
          <label>
            Cliente
            <input
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
              value={serviceName}
              onChange={(event) => setServiceName(event.target.value)}
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
          <button type="submit" className="primary-button">
            Adicionar
          </button>
        </form>
      )}

      <div className="schedule-summary">
        <span>{schedules.length} agendamentos</span>
        <span>{completedCount} concluído</span>
      </div>

      {error && <p role="alert">{error}</p>}
      {isLoading && <p>Carregando agenda...</p>}

      <div
        className="calendar"
        aria-label="Calendário de agendamentos"
        style={calendarStyle}
      >
        <div className="calendar-header">
          <div className="calendar-corner" />
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
                const appointment = schedules.find(
                  (schedule) =>
                    schedule.employeeId === professional.id &&
                    formatTime(schedule.startsAt) === time,
                )
                return (
                  <div
                    className="calendar-cell"
                    key={professional.id}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => handleDrop(event, professional.id, time)}
                  >
                    {appointment && (
                      <article
                        className={`appointment appointment-${statusClass(appointment.status)}`}
                        draggable
                        onDragStart={(event) =>
                          handleDragStart(event, appointment.id)
                        }
                        onDragEnd={() => {
                          setDraggedScheduleId(null)
                          setDraggedEmployeeId(null)
                        }}
                      >
                        <strong>{appointment.customerName}</strong>
                        <span>{appointment.serviceName}</span>
                        <small>{statusLabel(appointment.status)}</small>
                      </article>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
      {!isLoading && schedules.length === 0 && (
        <p className="empty-calendar">Nenhum agendamento para este dia.</p>
      )}
    </section>
  )
}

export default SchedulePage
