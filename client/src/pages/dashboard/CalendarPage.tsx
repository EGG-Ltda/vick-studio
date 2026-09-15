import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../core/auth/useAuth'
import { routePaths } from '../../routes/routePaths'
import { createSchedule, listSchedules, type Schedule } from './calendarApi'

function startOfDay(date: Date): Date {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

function endOfDay(date: Date): Date {
  const result = new Date(date)
  result.setHours(23, 59, 59, 999)
  return result
}

function CalendarPage() {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()))
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState({
    customerId: '',
    employeeId: '',
    serviceId: '',
    startsAt: '09:00',
    endsAt: '10:00',
  })

  useEffect(() => {
    let isCurrent = true
    setIsLoading(true)
    setError('')
    listSchedules(startOfDay(selectedDate), endOfDay(selectedDate))
      .then((data) => {
        if (isCurrent) setSchedules(data)
      })
      .catch((requestError: unknown) => {
        if (isCurrent)
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Erro ao carregar a agenda.',
          )
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false)
      })

    return () => {
      isCurrent = false
    }
  }, [selectedDate])

  function moveDate(days: number) {
    setSelectedDate((current) => {
      const nextDate = new Date(current)
      nextDate.setDate(nextDate.getDate() + days)
      return nextDate
    })
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    setFormError('')
    const startsAt = new Date(selectedDate)
    const endsAt = new Date(selectedDate)
    const [startHour, startMinute] = form.startsAt.split(':').map(Number)
    const [endHour, endMinute] = form.endsAt.split(':').map(Number)
    startsAt.setHours(startHour, startMinute, 0, 0)
    endsAt.setHours(endHour, endMinute, 0, 0)

    try {
      const created = await createSchedule({
        customerId: Number(form.customerId),
        employeeId: Number(form.employeeId),
        serviceId: Number(form.serviceId),
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      })
      setSchedules((current) =>
        [...current, created].sort((a, b) =>
          a.startsAt.localeCompare(b.startsAt),
        ),
      )
      setIsFormOpen(false)
    } catch (requestError: unknown) {
      setFormError(
        requestError instanceof Error
          ? requestError.message
          : 'Erro ao criar agendamento.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  function handleLogout() {
    signOut()
    navigate(routePaths.login, { replace: true })
  }

  const dateLabel = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(selectedDate)

  return (
    <main className="calendar-page">
      <header className="calendar-header">
        <div>
          <p className="eyebrow">Agenda</p>
          <h1>{dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}</h1>
          <p className="calendar-caption">
            {isLoading
              ? 'Carregando...'
              : `${schedules.length} agendamento(s) no dia`}
          </p>
        </div>
        <div className="calendar-header-actions">
          <button
            type="button"
            onClick={() => moveDate(-1)}
            aria-label="Dia anterior"
          >
            Anterior
          </button>
          <button
            type="button"
            onClick={() => setSelectedDate(startOfDay(new Date()))}
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={() => moveDate(1)}
            aria-label="Próximo dia"
          >
            Próximo
          </button>
          <button
            className="button-primary"
            type="button"
            onClick={() => setIsFormOpen(true)}
          >
            Novo agendamento
          </button>
          <button type="button" onClick={handleLogout}>
            Sair
          </button>
        </div>
      </header>

      <section className="calendar-content" aria-live="polite">
        {isLoading && <p className="calendar-state">Carregando agenda...</p>}
        {!isLoading && error && (
          <div className="calendar-state calendar-error">
            <strong>Não foi possível carregar a agenda.</strong>
            <span>{error}</span>
          </div>
        )}
        {!isLoading && !error && schedules.length === 0 && (
          <p className="calendar-state">Nenhum agendamento para este dia.</p>
        )}
        {!isLoading && !error && schedules.length > 0 && (
          <div className="schedule-list">
            {schedules.map((schedule) => (
              <article className="schedule-item" key={schedule.id}>
                <time dateTime={schedule.startsAt}>
                  {new Date(schedule.startsAt).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
                <div>
                  <h2>{schedule.customerName}</h2>
                  <p>
                    {schedule.serviceName} com {schedule.employeeName}
                  </p>
                </div>
                <span
                  className={`schedule-status schedule-status-${schedule.status}`}
                >
                  {schedule.status}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>

      {isFormOpen && (
        <div
          className="calendar-modal-backdrop"
          role="presentation"
          onClick={() => setIsFormOpen(false)}
        >
          <form
            className="calendar-modal"
            onSubmit={handleCreate}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              type="button"
              onClick={() => setIsFormOpen(false)}
              aria-label="Fechar"
            >
              ×
            </button>
            <p className="eyebrow">Novo registro</p>
            <h2>Agendar horário</h2>
            <label>
              Cliente (ID)
              <input
                required
                type="number"
                min="1"
                value={form.customerId}
                onChange={(event) =>
                  setForm({ ...form, customerId: event.target.value })
                }
              />
            </label>
            <label>
              Profissional (ID)
              <input
                required
                type="number"
                min="1"
                value={form.employeeId}
                onChange={(event) =>
                  setForm({ ...form, employeeId: event.target.value })
                }
              />
            </label>
            <label>
              Serviço (ID)
              <input
                required
                type="number"
                min="1"
                value={form.serviceId}
                onChange={(event) =>
                  setForm({ ...form, serviceId: event.target.value })
                }
              />
            </label>
            <div className="time-fields">
              <label>
                Início
                <input
                  required
                  type="time"
                  value={form.startsAt}
                  onChange={(event) =>
                    setForm({ ...form, startsAt: event.target.value })
                  }
                />
              </label>
              <label>
                Fim
                <input
                  required
                  type="time"
                  value={form.endsAt}
                  onChange={(event) =>
                    setForm({ ...form, endsAt: event.target.value })
                  }
                />
              </label>
            </div>
            {formError && <p className="form-error">{formError}</p>}
            <button
              className="button-primary"
              type="submit"
              disabled={isSaving}
            >
              {isSaving ? 'Salvando...' : 'Salvar agendamento'}
            </button>
          </form>
        </div>
      )}
    </main>
  )
}

export default CalendarPage
