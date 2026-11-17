import { SalonInput } from '../../components/selection/SalonInput'
import { SalonSelect } from '../../components/selection/SalonSelect'
import { allowed } from '../../core/auth/permissions'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { SalonModal } from '../../components/SalonModal'
import { useAuth } from '../../core/auth/useAuth'
import { bookingRequest } from '../booking/bookingApi'
import type { BookingEmployee, BookingTreatment } from '../booking/bookingApi'
import '../booking/booking.css'
import './employees.css'

const weekdayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return [parts[0]?.[0], parts.length > 1 ? parts.at(-1)?.[0] : '']
    .join('')
    .toUpperCase()
}
type Employee = BookingEmployee & {
  cpf: string
  userId: number
  email: string
  active: boolean
}
type EmployeeData = {
  employees: Employee[]
  users: { id: number; login: string; email: string }[]
}
const empty = {
  name: '',
  cpf: '',
  userId: 0,
  active: true,
  treatmentIds: [] as number[],
  weekdays: [1, 2, 3, 4, 5, 6],
  opensAt: '09:00',
  closesAt: '18:00',
}
export default function EmployeesPage() {
  const cpfInput = useRef<HTMLInputElement>(null)
  const { user } = useAuth()
  const canView = allowed(user, 'employees.view')
  const [data, setData] = useState<EmployeeData>({ employees: [], users: [] }),
    [treatments, setTreatments] = useState<BookingTreatment[]>([]),
    [form, setForm] = useState(empty),
    [editing, setEditing] = useState<number | null>(null),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [search, setSearch] = useState(''),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!busy && error.startsWith('Invalid CPF.')) cpfInput.current?.focus()
  }, [busy, error])
  useEffect(() => {
    if (!canView) return
    const controller = new AbortController()
    Promise.all([
      bookingRequest<EmployeeData>('/booking/employees', {
        signal: controller.signal,
      }),
      bookingRequest<{ treatments: BookingTreatment[] }>('/booking/catalog', {
        signal: controller.signal,
      }),
    ])
      .then(([employees, catalog]) => {
        if (!controller.signal.aborted) {
          setData(employees)
          setTreatments(catalog.treatments)
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [canView, revision])
  function edit(employee: Employee) {
    setEditing(employee.id)
    setForm({
      name: employee.name,
      cpf: employee.cpf,
      userId: employee.userId,
      active: employee.active,
      treatmentIds: employee.treatmentIds,
      weekdays: employee.hours.map((h) => h.weekday),
      opensAt: employee.hours[0]?.opensAt.slice(0, 5) ?? '09:00',
      closesAt: employee.hours[0]?.closesAt.slice(0, 5) ?? '18:00',
    })
    setError('')
    setOpen(true)
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await bookingRequest(
        editing ? `/booking/employees/${editing}` : '/booking/employees',
        { method: editing ? 'PUT' : 'POST', body: JSON.stringify(form) },
      )
      setOpen(false)
      setRevision((value) => value + 1)
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : 'Unable to save employee.'
      setError(message)
    } finally {
      setBusy(false)
    }
  }
  if (!canView)
    return (
      <p>
        Somente ADMIN ou MASTER pode gerenciar profissionais e habilitações.
      </p>
    )
  const filtered = data.employees.filter((employee) =>
    `${employee.name} ${employee.email}`
      .toLocaleLowerCase('pt-BR')
      .includes(search.trim().toLocaleLowerCase('pt-BR')),
  )
  return (
    <section className="dashboard-view employees-view">
      <header className="dashboard-view-header">
        <div>
          <span className="salon-eyebrow">Talentos que fazem florescer</span>
          <h1>Funcionários</h1>
          <p>
            Vincule o acesso, os procedimentos e os horários de trabalho de cada
            profissional.
          </p>
        </div>
        {allowed(user, 'employees.manage') && (
          <button
            className="primary-button"
            onClick={() => {
              setEditing(null)
              setForm(empty)
              setError('')
              setOpen(true)
            }}
          >
            Novo funcionário
          </button>
        )}
      </header>
      {!open && error && <p role="alert">{error}</p>}
      {loading && <p role="status">Carregando profissionais…</p>}
      {open && (
        <SalonModal
          title={editing ? 'Editar funcionário' : 'Novo funcionário'}
          description="Os horários e habilitações determinam a disponibilidade para reservas."
          busy={busy}
          onClose={() => setOpen(false)}
        >
          <form className="booking-form employee-booking-form" onSubmit={save}>
            <fieldset disabled={busy}>
              <label>
                Nome completo
                <SalonInput
                  required
                  minLength={3}
                  maxLength={255}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              {!editing && (
                <label>
                  CPF
                  <SalonInput
                    ref={cpfInput}
                    required
                    inputMode="numeric"
                    maxLength={14}
                    aria-invalid={error.startsWith('Invalid CPF.') || undefined}
                    aria-describedby={
                      error.startsWith('Invalid CPF.')
                        ? 'employee-cpf-error'
                        : undefined
                    }
                    value={form.cpf}
                    onChange={(e) => setForm({ ...form, cpf: e.target.value })}
                  />
                  {error.startsWith('Invalid CPF.') && (
                    <small
                      id="employee-cpf-error"
                      className="employee-field-error"
                    >
                      {error}
                    </small>
                  )}
                </label>
              )}
              <label>
                Usuário de acesso
                <SalonSelect
                  required
                  disabled={editing !== null}
                  value={form.userId || ''}
                  onChange={(e) =>
                    setForm({ ...form, userId: Number(e.target.value) })
                  }
                >
                  <option value="">Selecione um usuário cadastrado</option>
                  {data.users.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.login} · {account.email}
                    </option>
                  ))}
                </SalonSelect>
              </label>
              <label>
                Disponível para reservas
                <SalonSelect
                  value={String(form.active)}
                  onChange={(e) =>
                    setForm({ ...form, active: e.target.value === 'true' })
                  }
                >
                  <option value="true">Sim</option>
                  <option value="false">Não</option>
                </SalonSelect>
              </label>
              <fieldset className="employee-options-group">
                <legend>Procedimentos habilitados</legend>
                {treatments.map((treatment) => (
                  <label className="booking-choice" key={treatment.id}>
                    <SalonInput
                      type="checkbox"
                      checked={form.treatmentIds.includes(treatment.id)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          treatmentIds: e.target.checked
                            ? [...form.treatmentIds, treatment.id]
                            : form.treatmentIds.filter(
                                (id) => id !== treatment.id,
                              ),
                        })
                      }
                    />
                    {treatment.name}
                  </label>
                ))}
              </fieldset>
              <fieldset className="employee-options-group">
                <legend>Dias de trabalho</legend>
                <div className="booking-checks">
                  {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(
                    (day, index) => (
                      <label key={day}>
                        <SalonInput
                          type="checkbox"
                          checked={form.weekdays.includes(index)}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              weekdays: e.target.checked
                                ? [...form.weekdays, index]
                                : form.weekdays.filter(
                                    (value) => value !== index,
                                  ),
                            })
                          }
                        />
                        {day}
                      </label>
                    ),
                  )}
                </div>
              </fieldset>
              <label>
                Início do expediente (Brasília)
                <SalonInput
                  required
                  type="time"
                  value={form.opensAt}
                  onChange={(e) =>
                    setForm({ ...form, opensAt: e.target.value })
                  }
                />
              </label>
              <label>
                Fim do expediente (Brasília)
                <SalonInput
                  required
                  type="time"
                  value={form.closesAt}
                  onChange={(e) =>
                    setForm({ ...form, closesAt: e.target.value })
                  }
                />
              </label>
            </fieldset>
            {error && (
              <p className="booking-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary-button" disabled={busy}>
              {busy ? 'Salvando…' : 'Salvar funcionário'}
            </button>
          </form>
        </SalonModal>
      )}
      <div className="employees-toolbar">
        <div>
          <h2>Profissionais do estúdio</h2>
          <p>
            {loading
              ? 'Consultando equipe…'
              : `${data.employees.length} profissional(is) cadastrado(s)`}
          </p>
        </div>
        <label className="employees-search">
          <span>Buscar profissional</span>
          <SalonInput
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nome ou e-mail"
          />
        </label>
      </div>
      {!loading && (
        <div className="employees-grid">
          {filtered.map((employee) => {
            const qualifications = employee.treatmentIds.map(
              (id) =>
                treatments.find((treatment) => treatment.id === id)?.name ??
                'Procedimento indisponível',
            )
            const hours = [...employee.hours].sort(
              (a, b) => a.weekday - b.weekday,
            )
            const sameHours =
              hours.length > 0 &&
              hours.every(
                (hour) =>
                  hour.opensAt === hours[0].opensAt &&
                  hour.closesAt === hours[0].closesAt,
              )
            return (
              <article className="employee-card" key={employee.id}>
                <header className="employee-card-header">
                  <span className="employee-avatar" aria-hidden="true">
                    {initials(employee.name)}
                  </span>
                  <div className="employee-identity">
                    <h3>{employee.name}</h3>
                    <p>{employee.email}</p>
                  </div>
                  <span
                    className={`employee-availability ${employee.active ? 'is-active' : 'is-inactive'}`}
                  >
                    <span aria-hidden="true" />
                    {employee.active ? 'Ativo' : 'Indisponível'}
                  </span>
                </header>
                <section
                  className="employee-card-section"
                  aria-label="Procedimentos habilitados"
                >
                  <div className="employee-section-heading">
                    <h4>Procedimentos</h4>
                    <span>{qualifications.length} habilitado(s)</span>
                  </div>
                  <div className="employee-treatment-tags">
                    {qualifications.length ? (
                      qualifications.map((name, index) => (
                        <span key={employee.treatmentIds[index]}>{name}</span>
                      ))
                    ) : (
                      <p>Nenhum procedimento habilitado.</p>
                    )}
                  </div>
                </section>
                <section
                  className="employee-card-section"
                  aria-label="Expediente"
                >
                  <div className="employee-section-heading">
                    <h4>Expediente</h4>
                    <span>Horário de Brasília</span>
                  </div>
                  <div className="employee-weekdays">
                    {weekdayLabels.map((day, weekday) => {
                      const working = hours.some(
                        (hour) => hour.weekday === weekday,
                      )
                      return (
                        <span
                          key={day}
                          className={working ? 'is-working' : ''}
                          aria-label={`${day}: ${working ? 'dia de trabalho' : 'sem expediente'}`}
                        >
                          {day}
                        </span>
                      )
                    })}
                  </div>
                  {sameHours ? (
                    <p className="employee-working-time">
                      {hours[0].opensAt.slice(0, 5)} <span>às</span>{' '}
                      {hours[0].closesAt.slice(0, 5)}
                    </p>
                  ) : hours.length ? (
                    <div className="employee-variable-hours">
                      {hours.map((hour) => (
                        <span key={hour.weekday}>
                          {weekdayLabels[hour.weekday]} ·{' '}
                          {hour.opensAt.slice(0, 5)}–{hour.closesAt.slice(0, 5)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="employee-no-hours">
                      Nenhum expediente configurado.
                    </p>
                  )}
                </section>
                {allowed(user, 'employees.manage') && (
                  <footer className="employee-card-footer">
                    <button
                      type="button"
                      onClick={() => edit(employee)}
                      aria-label={`Editar cadastro e disponibilidade de ${employee.name}`}
                    >
                      Editar cadastro e disponibilidade{' '}
                      <span aria-hidden="true">↗</span>
                    </button>
                  </footer>
                )}
              </article>
            )
          })}
        </div>
      )}
      {!loading && !filtered.length && (
        <div className="employees-empty">
          <h3>
            {data.employees.length
              ? 'Nenhum profissional encontrado'
              : 'Sua equipe começa aqui'}
          </h3>
          <p>
            {data.employees.length
              ? 'Tente buscar por outro nome ou e-mail.'
              : 'Cadastre primeiro um usuário de acesso e depois vincule o funcionário, os procedimentos e o expediente.'}
          </p>
        </div>
      )}
    </section>
  )
}
