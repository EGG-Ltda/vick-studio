import z from 'zod'
const money = z.number().min(0).max(99999.99).multipleOf(0.01)
export const SupplierSchema = z.object({
  name: z.string().trim().min(1).max(255),
  contact: z.string().trim().max(500).default(''),
  notes: z.string().trim().max(4000).default(''),
  active: z.boolean().default(true),
})
export const ProductSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    description: z.string().trim().max(4000).default(''),
    supplierId: z.number().int().positive(),
    kind: z.enum(['consigned', 'courtesy']),
    salePrice: money,
    supplierPercent: z.number().min(0).max(100).multipleOf(0.01),
    acquisitionCost: money,
    active: z.boolean().default(true),
  })
  .refine(
    (d) =>
      d.kind === 'courtesy'
        ? d.salePrice === 0 && d.supplierPercent === 0
        : d.salePrice > 0 && d.acquisitionCost === 0,
    'Invalid conditions for the product model.',
  )
export const MovementSchema = z
  .object({
    kind: z.enum(['entry', 'supplier_return', 'loss', 'adjustment']),
    quantity: z
      .number()
      .int()
      .min(-100000)
      .max(100000)
      .refine((n) => n !== 0),
    reason: z.string().trim().min(3).max(1000),
    unitCost: money.optional(),
    requestKey: z.uuid(),
  })
  .refine(
    (d) => d.kind === 'adjustment' || d.quantity > 0,
    'Quantity must be positive.',
  )
export const OrderProductSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().min(1).max(100),
  requestKey: z.uuid(),
})
export const SettlementSchema = z.object({
  supplierId: z.number().int().positive(),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  amount: money.refine((n) => n > 0),
  methodId: z.number().int().positive(),
  description: z.string().trim().min(3).max(1000),
  requestKey: z.uuid(),
})
