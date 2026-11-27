import { SalonInput } from '../../components/selection/SalonInput'
import { SalonSelect } from '../../components/selection/SalonSelect'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { SalonModal } from '../../components/SalonModal'
import { inventoryRequest } from './inventoryApi'
import type { Product, ProductInput } from './inventoryApi'
import { SupplierPicker } from './SupplierPicker'
export function ProductEditor({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<ProductInput>({
      name: product?.name ?? '',
      description: product?.description ?? '',
      kind: product?.kind ?? 'consigned',
      active: product?.active ?? true,
      supplierId: product?.supplierId ?? 0,
      salePrice: product?.salePrice ?? 0,
      supplierPercent: product?.supplierPercent ?? 0,
      acquisitionCost: product?.acquisitionCost ?? 0,
    }),
    [supplierName, setSupplierName] = useState(product?.supplierName ?? ''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await inventoryRequest(
        `/inventory/products${product ? '/' + product.id : ''}`,
        { method: product ? 'PUT' : 'POST', body: JSON.stringify(form) },
      )
      onSaved()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Não foi possível salvar.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <SalonModal
      title={product ? 'Editar produto' : 'Novo produto'}
      description="Defina como o item entra no estoque e na comanda."
      busy={busy}
      onClose={onClose}
    >
      <form className="booking-form product-form" onSubmit={save}>
        <fieldset disabled={busy}>
          <label>
            Nome
            <SalonInput
              autoFocus
              required
              maxLength={255}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            Tipo do produto
            <SalonSelect
              value={form.kind}
              onChange={(e) =>
                setForm({
                  ...form,
                  kind: e.target.value as Product['kind'],
                  salePrice: 0,
                  supplierPercent: 0,
                  acquisitionCost: 0,
                })
              }
            >
              <option value="consigned">Consignado para venda</option>
              <option value="courtesy">Cortesia comprada pelo salão</option>
            </SalonSelect>
          </label>
          <label className="product-description">
            Descrição
            <textarea
              maxLength={4000}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <SupplierPicker
            value={form.supplierId}
            label={supplierName}
            onChange={(id, name) => {
              setForm({ ...form, supplierId: id })
              setSupplierName(name)
            }}
            disabled={busy}
          />
          {form.kind === 'consigned' ? (
            <div className="inventory-form-grid">
              <label>
                Preço de venda (R$)
                <SalonInput
                  required
                  type="number"
                  min="0.01"
                  max="99999.99"
                  step="0.01"
                  value={form.salePrice || ''}
                  onChange={(e) =>
                    setForm({ ...form, salePrice: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Percentual do fornecedor (%)
                <SalonInput
                  required
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={form.supplierPercent}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      supplierPercent: Number(e.target.value),
                    })
                  }
                />
              </label>
            </div>
          ) : (
            <label>
              Custo padrão de compra por unidade (R$)
              <SalonInput
                required
                type="number"
                min="0"
                max="99999.99"
                step="0.01"
                value={form.acquisitionCost}
                onChange={(e) =>
                  setForm({ ...form, acquisitionCost: Number(e.target.value) })
                }
              />
              <small>
                Não será cobrado da cliente. O custo real pode ser informado em
                cada entrada.
              </small>
            </label>
          )}
          <label className="inventory-check">
            <SalonInput
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Produto ativo
          </label>
        </fieldset>
        <p className="booking-note">
          O estoque inicial é zero. Após salvar, registre uma entrada em
          Movimentar estoque. Alterações de preço e percentual não modificam
          vendas anteriores.
        </p>
        {error && (
          <p role="alert" className="booking-error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button
            className="primary-button"
            disabled={busy || !form.supplierId}
          >
            {busy ? 'Salvando…' : 'Salvar produto'}
          </button>
        </div>
      </form>
    </SalonModal>
  )
}
