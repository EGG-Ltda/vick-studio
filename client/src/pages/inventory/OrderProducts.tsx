import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { money } from '../booking/bookingApi'
import { inventoryRequest } from './inventoryApi'
type Choice = {
  id: number
  name: string
  kind: 'consigned' | 'courtesy'
  stock: number
  salePrice: number
}
export function OrderProducts({
  id,
  onAdded,
  onBusyChange,
}: {
  id: number
  onAdded: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const [items, setItems] = useState<Choice[] | null>(null),
    [productId, setProductId] = useState(''),
    [quantity, setQuantity] = useState('1'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0)
  const request = useRef<{ body: string; key: string } | null>(null)
  useEffect(() => {
    const c = new AbortController()
    inventoryRequest<Choice[]>(`/orders/${id}/products`, { signal: c.signal })
      .then((d) => {
        if (!c.signal.aborted) {
          setItems(d)
        }
      })
      .catch((cause) => {
        if (!c.signal.aborted) setError(cause.message)
      })
    return () => c.abort()
  }, [id, revision])
  const product = items?.find((p) => p.id === Number(productId))
  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    onBusyChange(true)
    setError('')
    const body = JSON.stringify({
      productId: Number(productId),
      quantity: Number(quantity),
    })
    if (request.current?.body !== body)
      request.current = { body, key: crypto.randomUUID() }
    try {
      await inventoryRequest(`/orders/${id}/products`, {
        method: 'POST',
        body: JSON.stringify({
          ...JSON.parse(body),
          requestKey: request.current.key,
        }),
      })
      request.current = null
      setProductId('')
      setQuantity('1')
      setRevision((r) => r + 1)
      onAdded()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível adicionar o produto.',
      )
      setRevision((r) => r + 1)
    } finally {
      setBusy(false)
      onBusyChange(false)
    }
  }
  return (
    <section className="order-section">
      <h3>Produtos e cortesias do estoque</h3>
      <p className="booking-note">
        Selecione o item cadastrado. A quantidade será retirada do estoque;
        cortesias não serão cobradas.
      </p>
      {error && (
        <p role="alert" className="booking-error">
          {error}
        </p>
      )}
      {!items && !error && <p role="status">Carregando estoque…</p>}
      {items && !items.length && (
        <p>
          Sem produtos ativos com estoque. Cadastre os itens e registre as
          entradas em Produtos.
        </p>
      )}
      {!!items?.length && (
        <form className="booking-form" onSubmit={save}>
          <fieldset disabled={busy}>
            <label>
              Produto
              <select
                required
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
              >
                <option value="">Selecione</option>
                {items.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ·{' '}
                    {p.kind === 'courtesy' ? 'Cortesia' : money(p.salePrice)} ·{' '}
                    {p.stock} un.
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quantidade
              <input
                required
                type="number"
                min="1"
                max={Math.min(100, product?.stock ?? 100)}
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>
          </fieldset>
          {product && (
            <p>
              Total:{' '}
              <strong>
                {product.kind === 'courtesy'
                  ? 'Cortesia — sem cobrança'
                  : money(product.salePrice * Number(quantity))}
              </strong>
            </p>
          )}
          <button className="primary-button" disabled={busy || !product}>
            {busy ? 'Adicionando…' : 'Adicionar e baixar estoque'}
          </button>
        </form>
      )}
    </section>
  )
}
