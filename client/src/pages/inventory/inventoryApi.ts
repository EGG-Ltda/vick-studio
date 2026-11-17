import { apiRequest } from '../../core/api/http'
export { apiRequest as inventoryRequest }
export type Page<T> = { items: T[]; hasNext: boolean }
export type Supplier = {
  id: number
  name: string
  contact: string
  notes: string
  active: boolean
}
export type Product = {
  id: number
  name: string
  description: string
  kind: 'consigned' | 'courtesy'
  stock: number
  active: boolean
  supplierId?: number
  supplierName?: string
  salePrice: number
  supplierPercent?: number
  acquisitionCost?: number
}
export type ProductInput = {
  name: string
  description: string
  kind: Product['kind']
  active: boolean
  supplierId: number
  salePrice: number
  supplierPercent: number
  acquisitionCost: number
}
export type Movement = {
  id: number
  kind: string
  quantity: number
  reason: string
  createdAt: string
  author: string
  unitCost: number | null
}
export type Closing = {
  id: number
  name: string
  periodDueCents: string
  grossCents: string
  consignmentCents: string
  paidCents: string
  balanceCents: string
  unpaidItems: number
}
export const inventoryKind = (kind: string) =>
  ({
    entry: 'Entrada',
    sale: 'Venda na comanda',
    courtesy: 'Cortesia',
    supplier_return: 'Devolução ao fornecedor',
    loss: 'Perda',
    adjustment: 'Ajuste',
    customer_return: 'Retorno ao estoque',
    consignment: 'Venda recebida',
    purchase: 'Compra de cortesias',
    purchase_return: 'Crédito por devolução ao fornecedor',
    reversal: 'Cancelamento de venda',
  })[kind] ?? kind
