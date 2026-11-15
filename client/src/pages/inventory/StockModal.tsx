import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { SalonModal } from '../../components/SalonModal'
import { bookingDate, money } from '../booking/bookingApi'
import { inventoryRequest, inventoryKind } from './inventoryApi'
import type { Product, Movement, Page } from './inventoryApi'
export function StockModal({
  product,
  canStock,
  onClose,
  onChanged,
}: {
  product: Product
  canStock: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [data, setData] = useState<Page<Movement> | null>(null),
    [page, setPage] = useState(0),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const [kind, setKind] = useState(product.active ? 'entry' : 'loss'),
    [quantity, setQuantity] = useState('1'),
    [cost, setCost] = useState(String(product.acquisitionCost ?? 0)),
    [reason, setReason] = useState('')
  const request = useRef<{ body: string; key: string } | null>(null)
  useEffect(() => {
    const c = new AbortController()
    inventoryRequest<Page<Movement>>(
      `/inventory/products/${product.id}/movements?page=${page}`,
      { signal: c.signal },
    )
      .then((d) => {
        if (!c.signal.aborted) setData(d)
      })
      .catch((cause) => {
        if (!c.signal.aborted) setError(cause.message)
      })
    return () => c.abort()
  }, [product.id, page, revision])
  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    const body = JSON.stringify({
      kind,
      quantity: Number(quantity),
      reason,
      ...(product.kind === 'courtesy' &&
      ['entry', 'supplier_return'].includes(kind)
        ? { unitCost: Number(cost) }
        : {}),
    })
    if (request.current?.body !== body)
      request.current = { body, key: crypto.randomUUID() }
    try {
      await inventoryRequest(`/inventory/products/${product.id}/movements`, {
        method: 'POST',
        body: JSON.stringify({
          ...JSON.parse(body),
          requestKey: request.current.key,
        }),
      })
      request.current = null
      setReason('')
      setQuantity('1')
      setNotice('Movimentação registrada.')
      setPage(0)
      setRevision((r) => r + 1)
      onChanged()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Não foi possível movimentar.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <SalonModal
      title={product.name}
      description="Entradas e saídas ficam registradas com motivo e responsável."
      busy={busy}
      onClose={onClose}
    >
      {error && (
        <p role="alert" className="booking-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {canStock && (
        <form className="booking-form" onSubmit={save}>
          <fieldset disabled={busy}>
            <legend>Movimentar estoque</legend>
            <label>
              Tipo
              <select
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value)
                  setQuantity('1')
                }}
              >
                <option value="entry" disabled={!product.active}>
                  Entrada
                </option>
                <option value="supplier_return">Devolução ao fornecedor</option>
                <option value="loss">Perda / vencimento / dano</option>
                <option value="adjustment">Ajuste de inventário</option>
              </select>
            </label>
            <label>
              {kind === 'adjustment'
                ? 'Variação do estoque (ex.: -2 ou 3)'
                : 'Quantidade'}
              <input
                required
                type="number"
                min={kind === 'adjustment' ? '-100000' : '1'}
                max="100000"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>
            {product.kind === 'courtesy' &&
              ['entry', 'supplier_return'].includes(kind) && (
                <label>
                  {kind === 'supplier_return'
                    ? 'Crédito acordado por unidade devolvida (R$)'
                    : 'Custo real por unidade (R$)'}
                  <input
                    required
                    type="number"
                    min="0"
                    max="99999.99"
                    step="0.01"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                  />
                  <small>
                    {kind === 'supplier_return'
                      ? 'Informe somente o crédito aceito pelo fornecedor. A devolução não devolve dinheiro automaticamente.'
                      : 'A entrada registra a compra a pagar ao fornecedor. Registre o pagamento em Fechamento mensal.'}
                  </small>
                </label>
              )}
            <label>
              Motivo
              <input
                required
                minLength={3}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          </fieldset>
          <button className="primary-button" disabled={busy}>
            {busy ? 'Registrando…' : 'Registrar movimentação'}
          </button>
          <p className="booking-note">
            Vendas e cortesias são lançadas na comanda. Ajustes alteram o
            estoque, sem criar ou desfazer pagamentos.
          </p>
        </form>
      )}
      <h3>Histórico de movimentações</h3>
      {!data && !error && <p role="status">Carregando…</p>}
      {data && !data.items.length && <p>Nenhuma movimentação registrada.</p>}
      {data?.items.map((m) => (
        <article className="inventory-ledger-line" key={m.id}>
          <strong>
            {inventoryKind(m.kind)} · {m.quantity > 0 ? '+' : ''}
            {m.quantity} un.
          </strong>
          <span>{m.reason}</span>
          <small>
            {bookingDate(m.createdAt)} · {m.author}
            {m.unitCost !== null
              ? ` · Custo unitário: ${money(m.unitCost)}`
              : ''}
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
          disabled={busy || !data?.hasNext}
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
