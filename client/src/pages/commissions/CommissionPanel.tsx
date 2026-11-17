import { useEffect, useRef, useState } from 'react'
import { SalonInput } from '../../components/selection/SalonInput'
import { SalonSelect } from '../../components/selection/SalonSelect'
import { SalonModal } from '../../components/SalonModal'
import { bookingDate, bookingRequest, money } from '../booking/bookingApi'
import { CommissionRates } from './CommissionRates'
import './commissions.css'
type Options = {
  employees: { id: number; name: string }[]
  treatments: { id: number; name: string }[]
  methods: { id: number; name: string }[]
  canManage: boolean
  canSettle: boolean
}
type Rate = {
  employeeId: number
  employeeName: string
  treatmentId: number
  name: string
  standardPercent: number | null
  packagePercent: number | null
}
type Movement = {
  id: string
  employeeName: string
  orderId: number
  name: string
  kind: string
  amount: number
  grossAmount: number
  percent: number
  date: string
  reason: string | null
  closingId: string | null
}
type Movements = {
  items: Movement[]
  hasNext: boolean
  totals: { recognized: number; adjustments: number; net: number }
}
type Closing = {
  id: number
  amount: number
  description: string
  author: string
  createdAt: string
}
export function CommissionPanel() {
  const [options, setOptions] = useState<Options | null>(null),
    [rates, setRates] = useState<{ items: Rate[]; hasNext: boolean } | null>(
      null,
    ),
    [moves, setMoves] = useState<Movements | null>(null),
    [error, setError] = useState(''),
    [employee, setEmployee] = useState(''),
    [treatment, setTreatment] = useState(''),
    [page, setPage] = useState(0),
    [tab, setTab] = useState<'rates' | 'movements'>('rates'),
    [editing, setEditing] = useState<number | null>(null),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false)
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
  }).format(new Date())
  const [from, setFrom] = useState(today.slice(0, 7) + '-01'),
    [to, setTo] = useState(today),
    [balance, setBalance] = useState<{ pending: number; count: number } | null>(
      null,
    ),
    [closings, setClosings] = useState<Closing[]>([]),
    [method, setMethod] = useState(''),
    [description, setDescription] = useState('Pagamento de comissões'),
    [confirm, setConfirm] = useState(false),
    [notice, setNotice] = useState('')
  const key = useRef<{ fingerprint: string; key: string } | null>(null)
  useEffect(() => {
    const c = new AbortController()
    bookingRequest<Options>('/commissions/options', { signal: c.signal })
      .then((o) => {
        if (c.signal.aborted) return
        setOptions(o)
        if (o.employees.length === 1) setEmployee(String(o.employees[0].id))
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message)
      })
    return () => c.abort()
  }, [revision])
  useEffect(() => {
    const c = new AbortController()
    setError('')
    setRates(null)
    setMoves(null)
    const q = new URLSearchParams({ page: String(page), from, to })
    if (employee) q.set('employeeId', employee)
    if (treatment) q.set('treatmentId', treatment)
    bookingRequest<{ items: Rate[]; hasNext: boolean } & Movements>(
      `/commissions/${tab === 'rates' ? 'rates' : 'movements'}?${q}`,
      { signal: c.signal },
    )
      .then((d) => {
        if (c.signal.aborted) return
        if (tab === 'rates') setRates(d)
        else setMoves(d)
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message)
      })
    return () => c.abort()
  }, [employee, treatment, page, tab, from, to, revision])
  useEffect(() => {
    setBalance(null)
    setClosings([])
    setConfirm(false)
    if (!employee) return
    const c = new AbortController()
    Promise.all([
      bookingRequest<{ pending: number; count: number }>(
        `/commissions/employees/${employee}/balance`,
        { signal: c.signal },
      ),
      bookingRequest<Closing[]>(`/commissions/employees/${employee}/closings`, {
        signal: c.signal,
      }),
    ])
      .then(([b, h]) => {
        if (!c.signal.aborted) {
          setBalance(b)
          setClosings(h)
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message)
      })
    return () => c.abort()
  }, [employee, revision])
  async function close() {
    if (!balance) return
    setBusy(true)
    setError('')
    setNotice('')
    const payload = {
      expectedAmount: balance.pending,
      methodId: Number(method),
      description,
    }
    const fingerprint = JSON.stringify({ employee, ...payload })
    if (key.current?.fingerprint !== fingerprint)
      key.current = { fingerprint, key: crypto.randomUUID() }
    try {
      await bookingRequest(`/commissions/employees/${employee}/closings`, {
        method: 'POST',
        body: JSON.stringify({ ...payload, requestKey: key.current.key }),
      })
      key.current = null
      setNotice(
        'Fechamento registrado. Os lançamentos foram vinculados ao pagamento informado.',
      )
      setConfirm(false)
      setRevision((n) => n + 1)
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Unable to register commission closing.',
      )
    } finally {
      setBusy(false)
    }
  }
  const changeFilter = (setter: (v: string) => void, value: string) => {
    setter(value)
    setPage(0)
  }
  const items = tab === 'rates' ? rates?.items : moves?.items
  return (
    <section className="commission-panel">
      <h2>Porcentagens dos funcionários</h2>
      <p>
        As comissões são reconhecidas na conclusão, mesmo com pagamento do
        cliente pendente. Devoluções e anulações aparecem como ajustes,
        preservando o lançamento original.
      </p>
      <nav className="availability-tabs" aria-label="Consulta de comissões">
        {(['rates', 'movements'] as const).map((t) => (
          <button
            key={t}
            aria-current={tab === t ? 'page' : undefined}
            onClick={() => {
              setTab(t)
              setPage(0)
            }}
          >
            {t === 'rates'
              ? 'Percentuais por procedimento'
              : 'Comissões e ajustes'}
          </button>
        ))}
      </nav>
      <div className="commission-filters">
        <label>
          Profissional
          <SalonSelect
            value={employee}
            onChange={(e) => changeFilter(setEmployee, e.target.value)}
          >
            <option value="">Todos os autorizados</option>
            {options?.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </SalonSelect>
        </label>
        <label>
          Procedimento
          <SalonSelect
            value={treatment}
            onChange={(e) => changeFilter(setTreatment, e.target.value)}
          >
            <option value="">Todos</option>
            {options?.treatments.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </SalonSelect>
        </label>
        {tab === 'movements' && (
          <>
            <label>
              De
              <SalonInput
                type="date"
                value={from}
                max={to}
                onChange={(e) => {
                  if (e.target.value) changeFilter(setFrom, e.target.value)
                }}
              />
            </label>
            <label>
              Até
              <SalonInput
                type="date"
                value={to}
                min={from}
                onChange={(e) => {
                  if (e.target.value) changeFilter(setTo, e.target.value)
                }}
              />
            </label>
          </>
        )}
      </div>
      {error && (
        <p className="booking-error" role="alert">
          {error}{' '}
          <button onClick={() => setRevision((n) => n + 1)}>
            Tentar novamente
          </button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!items && !error && <p role="status">Carregando…</p>}
      {moves && (
        <div className="commission-summary">
          <span>
            Reconhecido<strong>{money(moves.totals.recognized)}</strong>
          </span>
          <span>
            Ajustes<strong>− {money(moves.totals.adjustments)}</strong>
          </span>
          <span>
            Comissão líquida no período
            <strong>{money(moves.totals.net)}</strong>
          </span>
        </div>
      )}
      {items?.length === 0 && (
        <p>Nenhum registro para os filtros selecionados.</p>
      )}
      {!!items?.length && (
        <div className="commission-table-wrap">
          <table className="commission-table">
            <thead>
              <tr>
                <th>Profissional</th>
                <th>Procedimento</th>
                {tab === 'rates' ? (
                  <>
                    <th>Avulso</th>
                    <th>Em pacote</th>
                    <th>Ação</th>
                  </>
                ) : (
                  <>
                    <th>Data / comanda</th>
                    <th>Base bruta / percentual</th>
                    <th>Lançamento</th>
                    <th>Fechamento</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {tab === 'rates'
                ? rates?.items.map((r) => (
                    <tr key={`${r.employeeId}-${r.treatmentId}`}>
                      <td>{r.employeeName}</td>
                      <td>{r.name}</td>
                      <td>
                        {r.standardPercent === null ? (
                          <span className="commission-pending">Pendente</span>
                        ) : (
                          `${r.standardPercent}%`
                        )}
                      </td>
                      <td>
                        {r.packagePercent === null ? (
                          <span className="commission-pending">Pendente</span>
                        ) : (
                          `${r.packagePercent}%`
                        )}
                      </td>
                      <td>
                        <button onClick={() => setEditing(r.employeeId)}>
                          {options?.canManage ? 'Configurar' : 'Consultar'}
                        </button>
                      </td>
                    </tr>
                  ))
                : moves?.items.map((m) => (
                    <tr key={m.id}>
                      <td>{m.employeeName}</td>
                      <td>{m.name}</td>
                      <td>
                        {bookingDate(m.date)} · #{m.orderId}
                      </td>
                      <td>
                        {money(m.grossAmount)} · {m.percent}%
                      </td>
                      <td>
                        {m.kind === 'recognition'
                          ? 'Conclusão'
                          : m.kind === 'annulment'
                            ? 'Anulação'
                            : 'Devolução'}
                        : {money(m.amount)}
                        {m.reason && (
                          <small
                            style={{ display: 'block', whiteSpace: 'normal' }}
                          >
                            {m.reason}
                          </small>
                        )}
                      </td>
                      <td>
                        {m.closingId
                          ? `Fechamento #${m.closingId}`
                          : 'Pendente de fechamento'}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      )}
      {items && (
        <div className="commission-pagination">
          <button disabled={!page} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </button>
          <span>Página {page + 1}</span>
          <button
            disabled={!(tab === 'rates' ? rates?.hasNext : moves?.hasNext)}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </button>
        </div>
      )}
      {employee && balance && (
        <section className="order-section">
          <h3>
            Saldo a fechar ·{' '}
            {options?.employees.find((e) => String(e.id) === employee)?.name}
          </h3>
          <p>
            <strong>{money(balance.pending)}</strong> · Todos os lançamentos
            ainda não fechados, independentemente dos filtros de período e
            procedimento.
          </p>
          {balance.pending < 0 && (
            <p className="booking-alert">
              Compensação pendente: este valor será abatido das próximas
              comissões.
            </p>
          )}
          {options?.canSettle && (
            <form
              className="booking-form"
              onSubmit={(e) => {
                e.preventDefault()
                if (confirm) void close()
                else setConfirm(true)
              }}
            >
              <p>
                Registre somente um pagamento já realizado ao funcionário. Esta
                ação registra uma saída no Financeiro; não transfere dinheiro.
              </p>
              <fieldset
                disabled={busy || balance.pending < 0 || !balance.count}
              >
                <label>
                  Forma de pagamento
                  <SalonSelect
                    required
                    value={method}
                    onChange={(e) => {
                      setMethod(e.target.value)
                      setConfirm(false)
                    }}
                  >
                    <option value="">Selecione</option>
                    {options.methods.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </SalonSelect>
                </label>
                <label>
                  Descrição
                  <SalonInput
                    required
                    minLength={3}
                    maxLength={1000}
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value)
                      setConfirm(false)
                    }}
                  />
                </label>
                {confirm && (
                  <p className="booking-alert">
                    Confirmar o fechamento de {money(balance.pending)}? Créditos
                    e ajustes pendentes serão vinculados a este registro.
                  </p>
                )}
                <button className="primary-button">
                  {busy
                    ? 'Registrando…'
                    : confirm
                      ? 'Confirmar pagamento e fechamento'
                      : 'Registrar fechamento'}
                </button>
                {confirm && (
                  <button type="button" onClick={() => setConfirm(false)}>
                    Voltar
                  </button>
                )}
              </fieldset>
            </form>
          )}
          <h3>Últimos fechamentos</h3>
          {!closings.length && <p>Nenhum fechamento registrado.</p>}
          {closings.map((c) => (
            <article key={c.id} className="order-line">
              <strong>
                #{c.id} · {money(c.amount)}
              </strong>
              <small>
                {c.description} · {c.author} · {bookingDate(c.createdAt)}
              </small>
            </article>
          ))}
        </section>
      )}
      {editing !== null && (
        <SalonModal
          title="Porcentagens do funcionário"
          description="Configure as comissões dos procedimentos habilitados."
          onClose={() => setEditing(null)}
          busy={busy}
        >
          <CommissionRates
            id={editing}
            onBusyChange={setBusy}
            onSaved={() => setRevision((n) => n + 1)}
          />
        </SalonModal>
      )}
    </section>
  )
}
