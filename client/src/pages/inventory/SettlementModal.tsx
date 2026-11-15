import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { SalonModal } from '../../components/SalonModal'
import { money, bookingDate } from '../booking/bookingApi'
import { inventoryRequest, inventoryKind } from './inventoryApi'
import type { Closing } from './inventoryApi'
type Statement = {
  items: {
    id: number
    kind: string
    amountCents: string
    grossCents: string
    description: string
    createdAt: string
    orderId: number | null
    quantity: number | null
    supplierPercent: number | null
    author: string
  }[]
  hasNext: boolean
  payments: {
    id: number
    amountCents: string
    description: string
    createdAt: string
    author: string
    method: string
  }[]
  paymentsHasNext: boolean
}
export function SettlementModal({
  supplier,
  period,
  onClose,
  onChanged,
}: {
  supplier: Closing
  period: string
  onClose: () => void
  onChanged: () => void
}) {
  const [data, setData] = useState<Statement | null>(null),
    [methods, setMethods] = useState<{ id: number; name: string }[]>([]),
    [page, setPage] = useState(0),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const [amount, setAmount] = useState(''),
    [method, setMethod] = useState(''),
    [description, setDescription] = useState(
      `Repasse ${period} · ${supplier.name}`,
    )
  const request = useRef<{ body: string; key: string } | null>(null)
  useEffect(() => {
    const c = new AbortController()
    Promise.all([
      inventoryRequest<Statement>(
        `/inventory/suppliers/${supplier.id}/statement?period=${period}&page=${page}`,
        { signal: c.signal },
      ),
      inventoryRequest<{ id: number; name: string }[]>(
        '/inventory/payment-methods',
        { signal: c.signal },
      ),
    ])
      .then(([s, m]) => {
        if (!c.signal.aborted) {
          setData(s)
          setMethods(m)
        }
      })
      .catch((cause) => {
        if (!c.signal.aborted) setError(cause.message)
      })
    return () => c.abort()
  }, [supplier.id, period, page, revision])
  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const body = JSON.stringify({
      supplierId: supplier.id,
      period,
      amount: Number(amount),
      methodId: Number(method),
      description,
    })
    if (request.current?.body !== body)
      request.current = { body, key: crypto.randomUUID() }
    try {
      await inventoryRequest('/inventory/settlements', {
        method: 'POST',
        body: JSON.stringify({
          ...JSON.parse(body),
          requestKey: request.current.key,
        }),
      })
      request.current = null
      setAmount('')
      setNotice('Pagamento ao fornecedor registrado no financeiro.')
      setPage(0)
      setRevision((r) => r + 1)
      onChanged()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Não foi possível registrar.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <SalonModal
      title={supplier.name}
      description={`Fechamento de ${period.split('-').reverse().join('/')} · valores em reais`}
      busy={busy}
      onClose={onClose}
    >
      {error && (
        <p role="alert" className="booking-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <p className="inventory-balance">
        Saldo acumulado até o mês:{' '}
        <strong>{money(Number(supplier.balanceCents) / 100)}</strong>
      </p>
      <p className="booking-note">
        O saldo inclui pendências anteriores e desconta todos os repasses já
        registrados. Saldo negativo representa crédito do salão após devoluções.
        Este registro não faz transferência bancária.
      </p>
      {Number(supplier.balanceCents) > 0 && (
        <form className="booking-form" onSubmit={save}>
          <fieldset disabled={busy}>
            <legend>Registrar pagamento realizado</legend>
            <label>
              Valor pago (R$)
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                max={Math.min(99999.99, Number(supplier.balanceCents) / 100)}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label>
              Forma de pagamento
              <select
                required
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option value="">Selecione</option>
                {methods.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Descrição / referência
              <input
                required
                minLength={3}
                maxLength={1000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
          </fieldset>
          <button className="primary-button" disabled={busy}>
            {busy ? 'Registrando…' : 'Registrar pagamento ao fornecedor'}
          </button>
        </form>
      )}
      <h3>Vendas, compras e cancelamentos do mês</h3>
      {!data && !error && <p role="status">Carregando extrato…</p>}
      {data && !data.items.length && <p>Nenhum lançamento neste mês.</p>}
      {data?.items.map((e) => (
        <article className="inventory-ledger-line" key={e.id}>
          <strong>
            {inventoryKind(e.kind)} · {money(Number(e.amountCents) / 100)}
          </strong>
          <span>
            {e.quantity ? `${e.quantity} × ` : ''}
            {e.description}
            {e.orderId ? ` · Comanda #${e.orderId}` : ''}
          </span>
          {e.supplierPercent !== null && (
            <span>
              Fornecedor: {e.supplierPercent}% · Venda:{' '}
              {money(Number(e.grossCents) / 100)}
            </span>
          )}
          <small>
            {bookingDate(e.createdAt)} · {e.author}
          </small>
        </article>
      ))}
      <h3>Pagamentos registrados para o mês</h3>
      {data && !data.payments.length && <p>Nenhum pagamento registrado.</p>}
      {data?.payments.map((p) => (
        <article className="inventory-ledger-line" key={p.id}>
          <strong>
            {money(Number(p.amountCents) / 100)} · {p.method}
          </strong>
          <span>{p.description}</span>
          <small>
            {bookingDate(p.createdAt)} · {p.author}
          </small>
        </article>
      ))}
      <div className="inventory-inline-actions">
        <button
          disabled={busy || page === 0}
          onClick={() => {
            setPage(page - 1)
            setData(null)
          }}
        >
          Anterior
        </button>
        <span>Página {page + 1}</span>
        <button
          disabled={busy || !(data?.hasNext || data?.paymentsHasNext)}
          onClick={() => {
            setPage(page + 1)
            setData(null)
          }}
        >
          Próxima
        </button>
      </div>
    </SalonModal>
  )
}
