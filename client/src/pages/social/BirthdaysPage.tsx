import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { bookingRequest } from '../booking/bookingApi'
import { dateOnly } from './socialApi'
import './social.css'
type Birthday = {
  id: number
  name: string
  birthDate: string
  phone: string | null
  isToday: boolean
}
export default function BirthdaysPage() {
  const [month, setMonth] = useState(
    Number(
      new Intl.DateTimeFormat('en-US', {
        month: 'numeric',
        timeZone: 'America/Sao_Paulo',
      }).format(new Date()),
    ),
  )
  const [page, setPage] = useState(0),
    [data, setData] = useState<{
      items: Birthday[]
      total: number
      hasNext: boolean
    } | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true)
  useEffect(() => {
    const c = new AbortController()
    bookingRequest<{ items: Birthday[]; total: number; hasNext: boolean }>(
      `/social/birthdays?month=${month}&page=${page}`,
      { signal: c.signal },
    )
      .then((d) => {
        if (!c.signal.aborted) setData(d)
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message)
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false)
      })
    return () => c.abort()
  }, [month, page])
  return (
    <section className="dashboard-view social-view">
      <header className="dashboard-view-header">
        <div>
          <span className="salon-eyebrow">Social · momentos especiais</span>
          <h1>Aniversariantes</h1>
          <p>Um cuidado para celebrar cada cliente.</p>
        </div>
      </header>
      <label className="social-month">
        Mês
        <select
          value={month}
          onChange={(e) => {
            setLoading(true)
            setError('')
            setMonth(Number(e.target.value))
            setPage(0)
          }}
        >
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i} value={i + 1}>
              {new Intl.DateTimeFormat('pt-BR', {
                month: 'long',
                timeZone: 'UTC',
              }).format(new Date(Date.UTC(2024, i, 1)))}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="booking-error">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Consultando aniversários…</p>
      ) : (
        !error &&
        data && (
          <>
            <p>
              {data.total}{' '}
              {data.total === 1 ? 'aniversariante' : 'aniversariantes'} neste
              mês.
            </p>
            <div className="social-grid">
              {data.items.map((c) => (
                <Link
                  className={`social-card birthday-card ${c.isToday ? 'birthday-today' : ''}`}
                  key={c.id}
                  to={`/dashboard/clientes/${c.id}`}
                >
                  <span className="birthday-day">{c.birthDate.slice(-2)}</span>
                  <div>
                    {c.isToday && <small>Aniversário hoje!</small>}
                    <h2>{c.name}</h2>
                    <p>{dateOnly(c.birthDate)}</p>
                    <p>{c.phone ?? 'Telefone não informado'}</p>
                  </div>
                  <span aria-hidden="true">→</span>
                </Link>
              ))}
            </div>
            {!data.items.length && (
              <p>Nenhum aniversário cadastrado para este mês.</p>
            )}
            <div className="social-actions">
              <button
                disabled={page === 0}
                onClick={() => {
                  setLoading(true)
                  setError('')
                  setPage((p) => p - 1)
                }}
              >
                Anterior
              </button>
              <span>Página {page + 1}</span>
              <button
                disabled={!data.hasNext}
                onClick={() => {
                  setLoading(true)
                  setError('')
                  setPage((p) => p + 1)
                }}
              >
                Próxima
              </button>
            </div>
          </>
        )
      )}
    </section>
  )
}
