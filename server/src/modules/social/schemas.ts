import z from 'zod'
export const PromotionSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    description: z.string().trim().min(3).max(3000),
    conditions: z.string().trim().min(3).max(3000),
    artId: z.coerce.number().int().positive(),
    altText: z.string().trim().min(3).max(255),
    startsOn: z.iso.date(),
    endsOn: z.iso.date(),
    active: z.boolean(),
    price: z.number().positive().max(99999.99).multipleOf(0.01),
    items: z
      .array(
        z.object({
          treatmentId: z.number().int().positive(),
          quantity: z.number().int().min(1).max(10),
        }),
      )
      .min(1)
      .max(20),
  })
  .refine((d) => d.endsOn >= d.startsOn, 'Invalid promotion period')
  .refine(
    (d) => new Set(d.items.map((i) => i.treatmentId)).size === d.items.length,
    'Duplicate treatments',
  )
  .refine(
    (d) => d.items.reduce((s, i) => s + i.quantity, 0) <= 20,
    'Maximum 20 appointments per package',
  )
export const AcquisitionSchema = z.object({
  promotionId: z.number().int().positive(),
  requestKey: z.uuid(),
  expectedPrice: z.number().positive(),
  expectedConditions: z.string(),
  expectedValidUntil: z.iso.datetime({ offset: true }),
  appointments: z
    .array(
      z.object({
        treatmentId: z.number().int().positive(),
        employeeId: z.number().int().positive(),
        startsAt: z.iso.datetime({ offset: true }),
      }),
    )
    .min(1)
    .max(20),
})
export const ChangeSchema = z.object({
  action: z.enum(['reschedule', 'cancel', 'no_show', 'return_use']),
  reason: z.string().trim().min(3).max(1000),
  employeeId: z.number().int().positive().optional(),
  startsAt: z.iso.datetime({ offset: true }).optional(),
  requestKey: z.uuid(),
})
// Largest-remainder allocation uses cents throughout; totals always match, including odd cents.
export function allocate(cents: number, weights: number[]): number[] {
  const sum = weights.reduce((s, n) => s + n, 0)
  if (
    !Number.isSafeInteger(cents) ||
    cents < 0 ||
    weights.some((n) => !Number.isSafeInteger(n) || n < 0) ||
    !weights.length
  )
    throw Error('Invalid allocation')
  const values = weights.map((n) =>
    Math.floor((cents * (sum ? n : 1)) / (sum || weights.length)),
  )
  const order = weights
    .map((n, i) => ({
      i,
      remainder: (cents * (sum ? n : 1)) % (sum || weights.length),
    }))
    .sort((a, b) => b.remainder - a.remainder || a.i - b.i)
  let rest = cents - values.reduce((s, n) => s + n, 0)
  for (let i = 0; i < rest; i++) values[order[i].i]++
  return values
}
