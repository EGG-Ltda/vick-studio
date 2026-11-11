import { apiRequest, SESSION_EXPIRED_EVENT } from '../../core/api/http'

export type FinanceFilters = {
  start: string
  end: string
  employeeId: string
  treatmentId: string
  search: string
  sort: 'value' | 'quantity'
  page: number
}
export type FinanceAccess = { read: boolean; write: boolean; export: boolean }
export type Choice = { id: number; name: string }
export type FinanceOptions = {
  employees: Choice[]
  treatments: Choice[]
  customers: Choice[]
  products: (Choice & { priceCents: number })[]
}
export type TreatmentRecord = {
  id: number
  date: string
  employee: string
  customer: string
  treatment: string
  quantity: number
  grossCents: number
  discountCents: number
  finalCents: number
}
export type Ranking = {
  id: number
  name: string
  quantity: number
  totalCents: number
  share?: number | null
  minutes?: number | null
  hourlyCents?: number | null
}
type Summary = {
  totalCents: number
  grossCents: number
  discountCents: number
  attendanceCount: number
  quantity: number
  ticketCents: number | null
  minutes: number | null
  hourlyCents: number | null
}
export type FinanceReport = {
  items: TreatmentRecord[]
  total: number
  pageSize: number
  summary: Summary
  previous: Summary & { start: string; end: string }
  variation: {
    total: number | null
    quantity: number | null
    attendances: number | null
    ticket: number | null
  }
  employees: Ranking[]
  treatments: Ranking[]
  productRanking: Ranking[]
  productTotalCents: number
  sales: { id: number; date: string }[]
}
export type PendingTreatment = {
  id: number
  scheduleId: number
  date: string
  employee: string
  customer: string
  treatment: string
  price: string
}
export function financeQuery(filters: FinanceFilters) {
  const params = new URLSearchParams({
    start: filters.start,
    end: filters.end,
    search: filters.search,
    sort: filters.sort,
    page: String(filters.page),
  })
  if (filters.employeeId) params.set('employeeId', filters.employeeId)
  if (filters.treatmentId) params.set('treatmentId', filters.treatmentId)
  return params.toString()
}
export async function financeRequest<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  try {
    return await apiRequest<T>(`/finance/${path}`, options)
  } catch {
    throw new Error(
      'Não foi possível concluir a operação financeira. Verifique os dados e suas permissões e tente novamente.',
    )
  }
}
export async function exportFinance(filters: FinanceFilters) {
  const response = await fetch(`/api/finance/export?${financeQuery(filters)}`, {
    credentials: 'include',
  })
  if (response.status === 401)
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
  if (!response.ok)
    throw new Error(
      'Não foi possível exportar. Verifique sua permissão e tente novamente.',
    )
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = `financeiro_${filters.start}_${filters.end}.xlsx`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function inputCents(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new Error('Informe um valor válido com até duas casas decimais.')
  const [whole, decimal = ''] = value.split('.')
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents) || cents > 1000000000)
    throw new Error('O valor informado excede o limite permitido.')
  return cents
}
export const brl = (cents: number | null) =>
  cents === null
    ? 'Sem dados'
    : new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(cents / 100)
export const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
export const dateLabel = (value: string) =>
  value.slice(0, 10).split('-').reverse().join('/')
