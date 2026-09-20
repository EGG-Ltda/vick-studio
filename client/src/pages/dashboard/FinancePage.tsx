import { useState } from 'react'
import type { FormEvent } from 'react'

type Transaction = {
  id: number
  description: string
  category: string
  date: string
  amount: number
  type: 'Entrada' | 'Saída'
}

const initialTransactions: Transaction[] = [
  {
    id: 1,
    description: 'Corte feminino',
    category: 'Atendimento',
    date: '18/09/2026',
    amount: 85,
    type: 'Entrada',
  },
  {
    id: 2,
    description: 'Compra de produtos',
    category: 'Estoque',
    date: '17/09/2026',
    amount: 240,
    type: 'Saída',
  },
  {
    id: 3,
    description: 'Manicure',
    category: 'Atendimento',
    date: '17/09/2026',
    amount: 55,
    type: 'Entrada',
  },
]

function FinancePage() {
  const [transactions, setTransactions] = useState(initialTransactions)
  const [form, setForm] = useState({
    description: '',
    category: 'Atendimento',
    amount: '',
    type: 'Entrada' as Transaction['type'],
  })

  const income = transactions
    .filter((item) => item.type === 'Entrada')
    .reduce((total, item) => total + item.amount, 0)
  const expenses = transactions
    .filter((item) => item.type === 'Saída')
    .reduce((total, item) => total + item.amount, 0)

  function addTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setTransactions((current) => [
      {
        id: Date.now(),
        description: form.description,
        category: form.category,
        date: new Date().toLocaleDateString('pt-BR'),
        amount: Number(form.amount),
        type: form.type,
      },
      ...current,
    ])
    setForm({
      description: '',
      category: 'Atendimento',
      amount: '',
      type: 'Entrada',
    })
  }

  return (
    <section className="dashboard-view">
      <header className="dashboard-view-header">
        <div>
          <h1>Financeiro</h1>
          <p>Acompanhe as entradas e saídas do estúdio.</p>
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={() =>
            document
              .getElementById('finance-form')
              ?.scrollIntoView({ behavior: 'smooth' })
          }
        >
          Novo lançamento
        </button>
      </header>
      <div className="metric-grid">
        <article>
          <span>Saldo atual</span>
          <strong>R$ {(income - expenses).toFixed(2).replace('.', ',')}</strong>
          <small>Resultado dos lançamentos</small>
        </article>
        <article>
          <span>Entradas</span>
          <strong className="metric-positive">
            R$ {income.toFixed(2).replace('.', ',')}
          </strong>
          <small>Receitas registradas</small>
        </article>
        <article>
          <span>Saídas</span>
          <strong className="metric-negative">
            R$ {expenses.toFixed(2).replace('.', ',')}
          </strong>
          <small>Despesas registradas</small>
        </article>
      </div>
      <form
        id="finance-form"
        className="user-form finance-form"
        onSubmit={addTransaction}
      >
        <label>
          Descrição
          <input
            value={form.description}
            onChange={(event) =>
              setForm({ ...form, description: event.target.value })
            }
            required
          />
        </label>
        <label>
          Categoria
          <select
            value={form.category}
            onChange={(event) =>
              setForm({ ...form, category: event.target.value })
            }
          >
            <option>Atendimento</option>
            <option>Estoque</option>
            <option>Despesas fixas</option>
          </select>
        </label>
        <label>
          Valor
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={form.amount}
            onChange={(event) =>
              setForm({ ...form, amount: event.target.value })
            }
            required
          />
        </label>
        <label>
          Tipo
          <select
            value={form.type}
            onChange={(event) =>
              setForm({
                ...form,
                type: event.target.value as Transaction['type'],
              })
            }
          >
            <option>Entrada</option>
            <option>Saída</option>
          </select>
        </label>
        <button className="primary-button" type="submit">
          Adicionar
        </button>
      </form>
      <div className="users-table-wrapper">
        <table className="users-table">
          <thead>
            <tr>
              <th>Descrição</th>
              <th>Categoria</th>
              <th>Data</th>
              <th>Tipo</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction) => (
              <tr key={transaction.id}>
                <td>{transaction.description}</td>
                <td>{transaction.category}</td>
                <td>{transaction.date}</td>
                <td>
                  <span
                    className={`transaction-tag transaction-${transaction.type === 'Entrada' ? 'in' : 'out'}`}
                  >
                    {transaction.type}
                  </span>
                </td>
                <td>R$ {transaction.amount.toFixed(2).replace('.', ',')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default FinancePage
