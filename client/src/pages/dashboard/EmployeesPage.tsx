import { useState } from 'react'
import type { FormEvent } from 'react'
import { SalonModal } from '../../components/SalonModal'

type Employee = {
  id: number
  name: string
  role: string
  phone: string
  active: boolean
}
const initialEmployees: Employee[] = [
  {
    id: 1,
    name: 'Mariana Costa',
    role: 'Cabeleireira',
    phone: '(11) 99876-1234',
    active: true,
  },
  {
    id: 2,
    name: 'Juliana Alves',
    role: 'Manicure',
    phone: '(11) 98765-4321',
    active: true,
  },
  {
    id: 3,
    name: 'Carla Mendes',
    role: 'Designer de sobrancelhas',
    phone: '(11) 97654-2109',
    active: false,
  },
]

function EmployeesPage() {
  const [employees, setEmployees] = useState(initialEmployees)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', role: '', phone: '' })
  function addEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setEmployees((current) => [
      ...current,
      { id: Date.now(), ...form, active: true },
    ])
    setForm({ name: '', role: '', phone: '' })
    setShowForm(false)
  }
  function toggleEmployee(id: number) {
    setEmployees((current) =>
      current.map((employee) =>
        employee.id === id
          ? { ...employee, active: !employee.active }
          : employee,
      ),
    )
  }
  return (
    <section className="dashboard-view">
      <header className="dashboard-view-header">
        <div>
          <span className="salon-eyebrow">Talentos que fazem florescer</span>
          <h1>Funcionários</h1>
          <p>Organize a equipe e a disponibilidade do estúdio.</p>
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={() => setShowForm(true)}
        >
          <span aria-hidden="true">＋</span> Novo funcionário
        </button>
      </header>
      {showForm && (
        <SalonModal
          title="Novo funcionário"
          description="Adicione quem faz parte da história do seu salão."
          onClose={() => setShowForm(false)}
        >
          <form className="user-form" onSubmit={addEmployee}>
            <label>
              Nome
              <input
                autoFocus
                placeholder="Nome completo"
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                required
              />
            </label>
            <label>
              Função
              <input
                value={form.role}
                onChange={(event) =>
                  setForm({ ...form, role: event.target.value })
                }
                required
              />
            </label>
            <label>
              Telefone
              <input
                value={form.phone}
                onChange={(event) =>
                  setForm({ ...form, phone: event.target.value })
                }
                required
              />
            </label>
            <div className="modal-actions">
              <button type="button" onClick={() => setShowForm(false)}>
                Cancelar
              </button>
              <button className="primary-button" type="submit">
                Cadastrar funcionário
              </button>
            </div>
          </form>
        </SalonModal>
      )}
      <div className="list-toolbar">
        <div>
          <h2>Nossa equipe</h2>
          <span>Profissionais que transformam cuidado em beleza.</span>
        </div>
        <span className="count-tag">{employees.length} profissionais</span>
      </div>
      <div className="users-table-wrapper">
        <table className="users-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Função</th>
              <th>Telefone</th>
              <th>Status</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => (
              <tr key={employee.id}>
                <td data-label="Nome">
                  <div className="employee-identity">
                    <span className="employee-avatar" aria-hidden="true">
                      {employee.name
                        .split(' ')
                        .slice(0, 2)
                        .map((part) => part[0])
                        .join('')}
                    </span>
                    <strong className="table-person">{employee.name}</strong>
                  </div>
                </td>
                <td data-label="Função">{employee.role}</td>
                <td data-label="Telefone">{employee.phone}</td>
                <td data-label="Status">
                  <span
                    className={`status-tag ${employee.active ? 'status-active' : 'status-inactive'}`}
                  >
                    {employee.active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td data-label="Ação">
                  <button
                    type="button"
                    onClick={() => toggleEmployee(employee.id)}
                  >
                    {employee.active ? 'Desativar' : 'Ativar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default EmployeesPage
