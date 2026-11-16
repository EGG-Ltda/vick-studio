import z from 'zod'
export const ClockSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
export const WorkingDaySchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    opensAt: ClockSchema,
    closesAt: ClockSchema,
    lunchStart: ClockSchema.nullable().default(null),
  })
  .refine(
    (d) => d.opensAt < d.closesAt,
    'Closing time must follow opening time.',
  )
  .refine(
    (d) =>
      !d.lunchStart ||
      (d.lunchStart >= d.opensAt &&
        minutes(d.lunchStart) + 60 <= minutes(d.closesAt)),
    'Lunch must fit entirely within working hours.',
  )
export const AvailabilityRequestSchema = z
  .object({
    kind: z.enum(['lunch', 'absence', 'vacation']),
    date: z.iso.date(),
    endDate: z.iso.date().optional(),
    startsAt: ClockSchema.optional(),
    endsAt: ClockSchema.optional(),
    reason: z.string().trim().min(3).max(2000),
    requestKey: z.uuid(),
  })
  .refine(
    (d) =>
      d.kind === 'vacation'
        ? !!d.endDate && d.endDate >= d.date
        : !!d.startsAt &&
          (d.kind === 'lunch' || (!!d.endsAt && d.endsAt > d.startsAt)),
    'Invalid absence period.',
  )
export const DecisionSchema = z.object({
  action: z.enum(['approve', 'decline', 'cancel']),
  reason: z.string().trim().min(3).max(2000),
  requestKey: z.uuid(),
})
export function minutes(time: string) {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}
export function addHour(time: string) {
  const value = minutes(time) + 60
  return value < 1440
    ? String(Math.floor(value / 60)).padStart(2, '0') +
        ':' +
        String(value % 60).padStart(2, '0')
    : null
}
