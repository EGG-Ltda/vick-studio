import { useState } from 'react'
import type { FormEvent } from 'react'

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
          <h1>Funcionários</h1>
          <p>Organize a equipe e a disponibilidade do estúdio.</p>
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? 'Cancelar' : 'Novo funcionário'}
        </button>
      </header>
      {showForm && (
        <form className="user-form" onSubmit={addEmployee}>
          <label>
            Nome
            <input
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
          <button className="primary-button" type="submit">
            Adicionar
          </button>
        </form>
      )}
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
                <td>{employee.name}</td>
                <td>{employee.role}</td>
                <td>{employee.phone}</td>
                <td>
                  <span
                    className={`status-tag ${employee.active ? 'status-active' : 'status-inactive'}`}
                  >
                    {employee.active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td>
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
