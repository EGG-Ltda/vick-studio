import { SalonInput } from '../../components/selection/SalonInput'
import { useEffect, useState } from 'react'
import { inventoryRequest } from './inventoryApi'
import type { Page, Supplier } from './inventoryApi'
export function SupplierPicker({
  value,
  label,
  onChange,
  disabled = false,
}: {
  value: number
  label?: string
  onChange: (id: number, name: string) => void
  disabled?: boolean
}) {
  const [search, setSearch] = useState(''),
    [page, setPage] = useState(0),
    [data, setData] = useState<Page<Supplier> | null>(null),
    [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    inventoryRequest<Page<Supplier>>(
      `/inventory/suppliers?${new URLSearchParams({ search, page: String(page) })}`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result)
          setError('')
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message)
      })
    return () => controller.abort()
  }, [search, page])
  return (
    <fieldset className="inventory-supplier-picker" disabled={disabled}>
      <legend>Fornecedor {label ? `selecionado: ${label}` : ''}</legend>
      <label>
        Buscar fornecedor
        <SalonInput
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(0)
            setData(null)
          }}
          placeholder="Nome do fornecedor"
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Carregando fornecedores…</p>}
      <div className="inventory-supplier-options">
        {data?.items.map((s) => (
          <button
            type="button"
            key={s.id}
            disabled={!s.active}
            aria-pressed={value === s.id}
            onClick={() => onChange(s.id, s.name)}
          >
            {s.name}
            {!s.active ? ' · Inativo' : ''}
          </button>
        ))}
      </div>
      {data && !data.items.length && (
        <p>Nenhum fornecedor encontrado. Cadastre na aba Fornecedores.</p>
      )}
      <div className="inventory-inline-actions">
        <button
          type="button"
          disabled={page === 0}
          onClick={() => {
            setPage(page - 1)
            setData(null)
          }}
        >
          Anterior
        </button>
        <span>Página {page + 1}</span>
        <button
          type="button"
          disabled={!data?.hasNext}
          onClick={() => {
            setPage(page + 1)
            setData(null)
          }}
        >
          Próxima
        </button>
      </div>
    </fieldset>
  )
}
