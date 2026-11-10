import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { SalonModal } from '../../components/SalonModal'
import { useAuth } from '../../core/auth/useAuth'
import { bookingRequest } from '../booking/bookingApi'
import type { BookingEmployee, BookingTreatment } from '../booking/bookingApi'
import '../booking/booking.css'
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
  const [data, setData] = useState<EmployeeData>({ employees: [], users: [] }),
    [treatments, setTreatments] = useState<BookingTreatment[]>([]),
    [form, setForm] = useState(empty),
    [editing, setEditing] = useState<number | null>(null),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!busy && error.startsWith('Invalid CPF.')) cpfInput.current?.focus()
  }, [busy, error])
  useEffect(() => {
    if (!user?.canManagePasswords) return
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
  }, [user?.canManagePasswords, revision])
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
  if (!user?.canManagePasswords)
    return (
      <p>
        Somente ADMIN ou MASTER pode gerenciar profissionais e habilitações.
      </p>
    )
  return (
    <section className="dashboard-view">
      <header className="dashboard-view-header">
        <div>
          <span className="salon-eyebrow">Talentos que fazem florescer</span>
          <h1>Funcionários</h1>
          <p>
            Vincule o acesso, os procedimentos e os horários de trabalho de cada
            profissional.
          </p>
        </div>
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
                <input
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
                  <input
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
                <select
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
                </select>
              </label>
              <label>
                Disponível para reservas
                <select
                  value={String(form.active)}
                  onChange={(e) =>
                    setForm({ ...form, active: e.target.value === 'true' })
                  }
                >
                  <option value="true">Sim</option>
                  <option value="false">Não</option>
                </select>
              </label>
              <fieldset className="employee-options-group">
                <legend>Procedimentos habilitados</legend>
                {treatments.map((treatment) => (
                  <label className="booking-choice" key={treatment.id}>
                    <input
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
                        <input
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
                <input
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
                <input
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
      <div className="booking-list">
        {data.employees.map((employee) => (
          <button
            key={employee.id}
            type="button"
            onClick={() => edit(employee)}
          >
            <strong>{employee.name}</strong>
            <span>
              {employee.email} · {employee.active ? 'Ativo' : 'Indisponível'}
            </span>
            <span>
              {employee.treatmentIds.length} procedimentos ·{' '}
              {employee.hours.length} dias de trabalho
            </span>
            <small>Editar horários e habilitações</small>
          </button>
        ))}
      </div>
      {!loading && !data.employees.length && (
        <p>
          Nenhum funcionário cadastrado. Cadastre primeiro o usuário de acesso e
          depois vincule-o aqui.
        </p>
      )}
    </section>
  )
}
