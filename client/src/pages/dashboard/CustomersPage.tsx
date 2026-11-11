import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { customerRequest } from './customersApi'
import type { Customer, Page } from './customersApi'
import './customers.css'
export default function CustomersPage() {
  const [search, setSearch] = useState(''),
    [page, setPage] = useState(0),
    [data, setData] = useState<Page<Customer>>({
      items: [],
      page: 0,
      total: 0,
      hasNext: false,
    }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    const timer = setTimeout(() => {
      customerRequest<Page<Customer>>(
        `/customers?${new URLSearchParams({ search, page: String(page) })}`,
        { signal: controller.signal },
      )
        .then((result) => {
          if (!controller.signal.aborted) setData(result)
        })
        .catch((cause) => {
          if (!controller.signal.aborted) setError(cause.message)
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [search, page])
  return (
    <section className="dashboard-view customer-view">
      <header className="dashboard-view-header">
        <div>
          <span className="salon-eyebrow">Relacionamentos que florescem</span>
          <h1>Clientes</h1>
          <p>Cadastros, atendimentos e histórico de cada cliente do estúdio.</p>
        </div>
      </header>
      <label className="customer-search">
        Buscar cliente
        <input
          type="search"
          placeholder="Nome, CPF, telefone ou e-mail"
          value={search}
          maxLength={100}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(0)
          }}
        />
      </label>
      {loading && <p role="status">Carregando clientes…</p>}
      {error && (
        <p role="alert" className="booking-error">
          {error}
        </p>
      )}
      {!loading && !error && (
        <>
          <p className="customer-muted">Clientes encontrados: {data.total}</p>
          <div className="customer-table-scroll">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>CPF</th>
                  <th>Contato</th>
                  <th>Histórico</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <strong>{customer.name}</strong>
                    </td>
                    <td>{customer.cpf}</td>
                    <td>
                      {customer.email ?? 'Sem e-mail'}
                      <br />
                      {customer.phone ?? 'Sem telefone'}
                    </td>
                    <td>
                      <Link
                        className="customer-link"
                        to={`/dashboard/clientes/${customer.id}`}
                      >
                        Ver cliente →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.items.length && (
            <p className="customer-empty">
              {search
                ? 'Nenhum cliente corresponde à busca.'
                : 'Nenhum cliente disponível. Cadastros do agendamento público aparecerão aqui conforme sua permissão de acesso.'}
            </p>
          )}
          <nav
            className="customer-pagination"
            aria-label="Paginação de clientes"
          >
            <button
              disabled={page === 0}
              onClick={() => setPage((value) => value - 1)}
            >
              Anterior
            </button>
            <span>Página {page + 1}</span>
            <button
              disabled={!data.hasNext}
              onClick={() => setPage((value) => value + 1)}
            >
              Próxima
            </button>
          </nav>
        </>
      )}
    </section>
  )
}
