import z from 'zod'

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}, 'Invalid calendar date')
export const financeFilterSchema = z.object({
  start: dateSchema,
  end: dateSchema,
  employeeId: z.coerce.number().int().positive().optional(),
  treatmentId: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(100).default(''),
  page: z.coerce.number().int().min(0).max(100000).default(0),
  sort: z.enum(['quantity', 'value']).default('value'),
}).refine((value) => value.start <= value.end &&
  (Date.parse(value.end) - Date.parse(value.start)) / 86400000 < 366, 'Invalid period')
export type FinanceFilter = z.infer<typeof financeFilterSchema>
const cents = z.number().int().min(0).max(1000000000)
export const completeTreatmentSchema = z.object({
  scheduleItemId: z.number().int().positive(),
  performedOn: dateSchema,
  quantity: z.number().int().min(1).max(10000).default(1),
  discountCents: cents.default(0),
  actualStartedAt: z.iso.datetime({ offset: true }).optional(),
  actualEndedAt: z.iso.datetime({ offset: true }).optional(),
}).refine((value) => (!value.actualStartedAt && !value.actualEndedAt) ||
  (!!value.actualStartedAt && !!value.actualEndedAt && Date.parse(value.actualStartedAt) < Date.parse(value.actualEndedAt)
    && Date.parse(value.actualEndedAt) <= Date.now()), 'Invalid actual attendance interval')
export const productSchema = z.object({ name: z.string().trim().min(1).max(255), priceCents: cents })
export const productSaleSchema = z.object({
  employeeId: z.number().int().positive(),
  customerId: z.number().int().positive().optional(),
  soldOn: dateSchema,
  items: z.array(z.object({
    productId: z.number().int().positive(),
    quantity: z.number().int().min(1).max(10000),
    discountCents: cents.default(0),
  })).min(1).max(100),
}).refine((value) => new Set(value.items.map((item) => item.productId)).size === value.items.length, 'Duplicate product')

export type FinanceRecord = {
  id: number; scheduleId: number; employeeId: number; treatmentId: number
  date: string; employee: string; customer: string; treatment: string
  quantity: number; grossCents: number; discountCents: number; finalCents: number
  actualStartedAt: string | null; actualEndedAt: string | null
}
export type ProductRecord = {
  id: number; saleId: number; productId: number; product: string; date: string
  quantity: number; finalCents: number
}
export function financeError(message: string, statusCode = 400): Error {
  return Object.assign(new Error(message), { statusCode })
}
export function safeMoney(value: string | number): number {
  const amount = Number(value)
  if (!Number.isSafeInteger(amount)) throw financeError('Financial amount exceeds safe integer range', 422)
  return amount
}
export function previousPeriod(start: string, end: string) {
  const first = Date.parse(`${start}T00:00:00Z`)
  const days = (Date.parse(`${end}T00:00:00Z`) - first) / 86400000 + 1
  return { start: new Date(first - days * 86400000).toISOString().slice(0, 10),
    end: new Date(first - 86400000).toISOString().slice(0, 10) }
}
