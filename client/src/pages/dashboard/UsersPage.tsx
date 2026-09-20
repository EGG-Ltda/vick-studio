import { useState } from 'react'
import type { FormEvent } from 'react'

type User = {
  id: number
  name: string
  login: string
  email: string
  role: string
  active: boolean
}

const initialUsers: User[] = [
  {
    id: 1,
    name: 'Administrador',
    login: 'admin',
    email: 'admin@vickstudio.local',
    role: 'Administrador',
    active: true,
  },
]

function UsersPage() {
  const [users, setUsers] = useState(initialUsers)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [login, setLogin] = useState('')
  const [email, setEmail] = useState('')

  function addUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setUsers((currentUsers) => [
      ...currentUsers,
      {
        id: Date.now(),
        name,
        login,
        email,
        role: 'Usuário',
        active: true,
      },
    ])
    setName('')
    setLogin('')
    setEmail('')
    setShowForm(false)
  }

  return (
    <section className="dashboard-view">
      <header className="dashboard-view-header">
        <div>
          <h1>Usuários</h1>
          <p>Gerencie os acessos ao sistema.</p>
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? 'Cancelar' : 'Novo usuário'}
        </button>
      </header>

      {showForm && (
        <form className="user-form" onSubmit={addUser}>
          <label>
            Nome
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <label>
            Login
            <input
              value={login}
              onChange={(event) => setLogin(event.target.value)}
              required
            />
          </label>
          <label>
            E-mail
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <button type="submit" className="primary-button">
            Adicionar
          </button>
        </form>
      )}

      <div className="users-table-wrapper">
        <table className="users-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Login</th>
              <th>E-mail</th>
              <th>Perfil</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.login}</td>
                <td>{user.email}</td>
                <td>{user.role}</td>
                <td>{user.active ? 'Ativo' : 'Inativo'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default UsersPage
