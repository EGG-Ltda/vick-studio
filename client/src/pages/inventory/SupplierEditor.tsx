import { SalonInput } from '../../components/selection/SalonInput'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { SalonModal } from '../../components/SalonModal'
import { inventoryRequest } from './inventoryApi'
import type { Supplier } from './inventoryApi'
export function SupplierEditor({
  supplier,
  onClose,
  onSaved,
}: {
  supplier: Supplier | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
      name: supplier?.name ?? '',
      contact: supplier?.contact ?? '',
      notes: supplier?.notes ?? '',
      active: supplier?.active ?? true,
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await inventoryRequest(
        `/inventory/suppliers${supplier ? '/' + supplier.id : ''}`,
        { method: supplier ? 'PUT' : 'POST', body: JSON.stringify(form) },
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
      title={supplier ? 'Editar fornecedor' : 'Novo fornecedor'}
      description="Identificação e contato para as compras e os repasses."
      busy={busy}
      onClose={onClose}
    >
      <form className="booking-form" onSubmit={save}>
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
            Contato
            <SalonInput
              maxLength={500}
              placeholder="Telefone ou e-mail"
              value={form.contact}
              onChange={(e) => setForm({ ...form, contact: e.target.value })}
            />
          </label>
          <label>
            Observações
            <textarea
              maxLength={4000}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
          <label className="inventory-check">
            <SalonInput
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Fornecedor ativo
          </label>
        </fieldset>
        {error && (
          <p role="alert" className="booking-error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar fornecedor'}
          </button>
        </div>
      </form>
    </SalonModal>
  )
}
