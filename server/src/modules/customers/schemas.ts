import z from 'zod'
import { CpfSchema } from '../booking/schemas'
export const ProfileSchema = z.object({
  name: z.string().trim().min(3).max(255),
  cpf: CpfSchema,
  email: z.email().trim().toLowerCase().max(255),
  phone: z
    .string()
    .transform((value) => value.replace(/[()\-\s+]/g, ''))
    .pipe(z.string().regex(/^\d{10,13}$/)),
})
export const NoteSchema = z.object({ body: z.string().trim().min(1).max(4000) })
export const ConsumptionSchema = z.object({
  description: z.string().trim().min(1).max(255),
  quantity: z.number().int().min(1).max(100),
  unitPrice: z.number().nonnegative().max(99999.99).multipleOf(0.01),
  requestKey: z.uuid(),
})
export const PaymentSchema = z.object({
  amount: z.number().positive().max(99999.99).multipleOf(0.01),
  methodId: z.number().int().positive(),
  description: z.string().trim().min(1).max(1023),
  requestKey: z.uuid(),
})
export const RefundSchema = z.object({
  amount: z.number().positive().max(99999.99).multipleOf(0.01),
  reason: z.string().trim().min(3).max(1000),
  requestKey: z.uuid(),
})
export const pageSchema = z.coerce.number().int().min(0).max(100000).default(0)
