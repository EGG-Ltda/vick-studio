import { useEffect, useState } from 'react'
import {
  bookingDate,
  bookingRequest,
  money,
  bookingStatus,
} from '../booking/bookingApi'
import { packageUseLabel } from './socialApi'
import type { PackagePurchase } from './socialApi'
import './social.css'
export function PackageHistory({
  customerId,
  revision = 0,
  onOrder,
}: {
  customerId?: number
  revision?: number
  onOrder?: (id: number) => void
}) {
  const [items, setItems] = useState<PackagePurchase[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true)
  useEffect(() => {
    const c = new AbortController()
    const refresh = () =>
      bookingRequest<PackagePurchase[]>(
        customerId ? `/customers/${customerId}/packages` : '/customer/packages',
        { signal: c.signal },
      )
        .then((d) => {
          if (!c.signal.aborted) {
            setItems(d)
            setError('')
          }
        })
        .catch((e) => {
          if (!c.signal.aborted) setError(e.message)
        })
        .finally(() => {
          if (!c.signal.aborted) setLoading(false)
        })
    void refresh()
    const timer = setInterval(() => void refresh(), 30000)
    return () => {
      c.abort()
      clearInterval(timer)
    }
  }, [customerId, revision])
  return (
    <section className="package-panel">
      <h2>{customerId ? 'Pacotes adquiridos' : 'Meus pacotes'}</h2>
      {loading && <p role="status">Carregando pacotes…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && !items.length && <p>Nenhum pacote adquirido.</p>}
      {items.map((p) => (
        <article key={p.id}>
          <span className="salon-eyebrow">
            Pacote #{p.id}
            {p.expired ? ' · Validade encerrada' : ''}
          </span>
          <h3>{p.title}</h3>
          {p.price !== null && (
            <p>
              Total: {money(p.price)} · Efetivamente pago: {money(p.totalPaid)}
            </p>
          )}
          <p>
            Adquirido em {bookingDate(p.acquiredAt)} · Validade até{' '}
            {bookingDate(p.validUntil)}
          </p>
          {p.conditions && <p>{p.conditions}</p>}
          {p.uses?.map((u) => (
            <div key={u.id} className="package-use">
              <strong>
                {u.name} · {packageUseLabel(u.state)}
              </strong>
              <p>
                {bookingDate(u.startsAt)} · {u.employeeName} ·{' '}
                {bookingStatus(u.status)}
              </p>
              {onOrder && (
                <button onClick={() => onOrder(u.scheduleId)}>
                  Abrir comanda #{u.scheduleId}
                </button>
              )}
            </div>
          ))}
          {p.receipts?.length ? (
            <div>
              <h4>Recebimentos e estornos do pacote</h4>
              {p.receipts.map((r) => (
                <p key={r.id}>
                  {r.kind === 'refund' ? 'Estorno' : 'Recebimento'}:{' '}
                  {money(r.amount)} · {r.method} · {bookingDate(r.createdAt)}
                </p>
              ))}
              <small>
                Os valores são distribuídos entre os procedimentos; não
                representam cobranças adicionais.
              </small>
            </div>
          ) : (
            p.price !== null && (
              <p>Nenhum recebimento registrado para este pacote.</p>
            )
          )}
        </article>
      ))}
    </section>
  )
}
