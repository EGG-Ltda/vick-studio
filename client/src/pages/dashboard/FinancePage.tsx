import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { SalonModal } from '../../components/SalonModal'
import { useAuth } from '../../core/auth/useAuth'
import { allowed } from '../../core/auth/permissions'
import { apiRequest } from '../../core/api/http'
import { bookingDate, money } from '../booking/bookingApi'
import '../access/access.css'
type Finance = {
  income: number
  expenses: number
  net: number
  scope: 'all' | 'own'
  note: string | null
  page: number
  hasNext: boolean
  total: number
  items: {
    id: number
    orderId: number | null
    description: string
    createdAt: string
    isDebit: boolean
    amount: number
    method: string | null
  }[]
}
type Options = {
  methods: { id: number; name: string }[]
  types: { id: number; name: string }[]
}
const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date())
export default function FinancePage() {
  const { user } = useAuth(),
    [from, setFrom] = useState(() => today().slice(0, 8) + '01'),
    [to, setTo] = useState(today),
    [page, setPage] = useState(0),
    [data, setData] = useState<Finance | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0),
    [showForm, setShowForm] = useState(false),
    [busy, setBusy] = useState(false),
    [formError, setFormError] = useState(''),
    [options, setOptions] = useState<Options | null>(null),
    [form, setForm] = useState({
      description: '',
      amount: '',
      methodId: '',
      typeId: '',
      isDebit: 'false',
    })
  const key = useRef<{ body: string; key: string } | null>(null)
  useEffect(() => {
    const c = new AbortController()
    apiRequest<Finance>(
      `/finance?${new URLSearchParams({ from, to, page: String(page) })}`,
      { signal: c.signal },
    )
      .then((d) => {
        if (!c.signal.aborted) {
          setData(d)
          setError('')
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message)
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false)
      })
    return () => c.abort()
  }, [from, to, page, revision])
  async function open() {
    setShowForm(true)
    setFormError('')
    try {
      setOptions(await apiRequest<Options>('/finance/options'))
    } catch (e) {
      setFormError(
        e instanceof Error ? e.message : 'Unable to load entry options.',
      )
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setFormError('')
    try {
      const body = {
          ...form,
          amount: Number(form.amount),
          methodId: Number(form.methodId),
          typeId: Number(form.typeId),
          isDebit: form.isDebit === 'true',
        },
        text = JSON.stringify(body)
      if (key.current?.body !== text)
        key.current = { body: text, key: crypto.randomUUID() }
      await apiRequest('/finance/manual', {
        method: 'POST',
        body: JSON.stringify({ ...body, requestKey: key.current.key }),
      })
      key.current = null
      setShowForm(false)
      setForm({
        description: '',
        amount: '',
        methodId: '',
        typeId: '',
        isDebit: 'false',
      })
      setPage(0)
      setLoading(true)
      setRevision((r) => r + 1)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Unable to record entry.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="dashboard-view finance-view">
      <header className="dashboard-view-header">
        <div>
          <span className="salon-eyebrow">Valores registrados</span>
          <h1>
            {user?.role === 'OPERATIONAL' ? 'Meu financeiro' : 'Financeiro'}
          </h1>
          <p>
            {data?.scope === 'own'
              ? 'Acompanhe somente os valores atribuídos aos seus atendimentos.'
              : 'Acompanhe as entradas e saídas efetivamente registradas no salão.'}
          </p>
        </div>
        {allowed(user, 'finance.manage') && (
          <button className="primary-button" onClick={() => void open()}>
            Novo lançamento
          </button>
        )}
      </header>
      <div className="social-actions finance-period">
        <label>
          De{' '}
          <input
            type="date"
            required
            value={from}
            max={to}
            onChange={(e) => {
              setFrom(e.target.value)
              setPage(0)
              setLoading(true)
            }}
          />
        </label>
        <label>
          Até{' '}
          <input
            type="date"
            required
            value={to}
            min={from}
            onChange={(e) => {
              setTo(e.target.value)
              setPage(0)
              setLoading(true)
            }}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="booking-error">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Consultando lançamentos…</p>
      ) : (
        !error &&
        data && (
          <>
            {data.note && (
              <p className="booking-availability-notice">{data.note}</p>
            )}
            <div className="metric-grid">
              <article>
                <span>
                  {data.scope === 'own'
                    ? 'Recebimentos líquidos atribuídos'
                    : 'Resultado do período'}
                </span>
                <strong>{money(data.net)}</strong>
                <small>Entradas menos saídas registradas</small>
              </article>
              <article>
                <span>Entradas</span>
                <strong>{money(data.income)}</strong>
                <small>Recebimentos registrados</small>
              </article>
              <article>
                <span>{data.scope === 'own' ? 'Devoluções' : 'Saídas'}</span>
                <strong>{money(data.expenses)}</strong>
                <small>
                  {data.scope === 'own'
                    ? 'Estornos atribuídos aos seus atendimentos'
                    : 'Despesas e estornos registrados'}
                </small>
              </article>
            </div>
            <div className="users-table-wrapper">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Descrição</th>
                    <th>Data</th>
                    <th>Tipo</th>
                    <th>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((t) => (
                    <tr key={t.id}>
                      <td data-label="Descrição">
                        {t.description}
                        <small className="customer-muted">
                          {t.orderId
                            ? ` · Comanda #${t.orderId}`
                            : ' · Lançamento geral'}
                        </small>
                      </td>
                      <td data-label="Data">{bookingDate(t.createdAt)}</td>
                      <td data-label="Tipo">
                        {t.isDebit ? 'Saída' : 'Entrada'} ·{' '}
                        {t.method ?? 'Não informado'}
                      </td>
                      <td data-label="Valor">{money(t.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.items.length && (
              <p>Nenhum lançamento disponível neste período.</p>
            )}
            <nav className="social-actions" aria-label="Paginação financeira">
              <button
                disabled={!page}
                onClick={() => {
                  setPage((p) => p - 1)
                  setLoading(true)
                }}
              >
                Anterior
              </button>
              <span>Página {page + 1}</span>
              <button
                disabled={!data.hasNext}
                onClick={() => {
                  setPage((p) => p + 1)
                  setLoading(true)
                }}
              >
                Próxima
              </button>
            </nav>
          </>
        )
      )}
      {showForm && allowed(user, 'finance.manage') && (
        <SalonModal
          title="Novo lançamento"
          description="Lançamentos gerais do salão. Recebimentos de clientes devem ser registrados nas comandas para compor o histórico."
          onClose={() => setShowForm(false)}
          busy={busy}
        >
          <form className="booking-form" onSubmit={save}>
            <fieldset disabled={busy || !options}>
              <label>
                Descrição
                <input
                  required
                  maxLength={1023}
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </label>
              <label>
                Valor (R$)
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="99999.99"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </label>
              <label>
                Tipo
                <select
                  value={form.isDebit}
                  onChange={(e) =>
                    setForm({ ...form, isDebit: e.target.value })
                  }
                >
                  <option value="false">Entrada</option>
                  <option value="true">Saída</option>
                </select>
              </label>
              <label>
                Forma de pagamento
                <select
                  required
                  value={form.methodId}
                  onChange={(e) =>
                    setForm({ ...form, methodId: e.target.value })
                  }
                >
                  <option value="">Selecione</option>
                  {options?.methods.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Categoria
                <select
                  required
                  value={form.typeId}
                  onChange={(e) => setForm({ ...form, typeId: e.target.value })}
                >
                  <option value="">Selecione</option>
                  {options?.types.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
            {formError && <p role="alert">{formError}</p>}
            <button disabled={busy || !options} className="primary-button">
              {busy ? 'Registrando…' : 'Registrar lançamento'}
            </button>
          </form>
        </SalonModal>
      )}
    </section>
  )
}
