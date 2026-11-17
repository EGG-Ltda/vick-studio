import { FastifyInstance } from 'fastify'
import z from 'zod'
import rateLimit from '@fastify/rate-limit'
import { container } from '@/di/bindings'
import { databaseServiceId, unitOfWorkServiceId } from '@/core/db'
import { ok } from '@/shared/utils/response'
import { isBookingOriginAllowed } from '../booking/origin'
import { bookingError } from '../booking/service'
import {
  PackageBookingService,
  PackageSelection,
  PackageReservation,
} from './service'
export default async function routes(app: FastifyInstance) {
  await app.register(rateLimit, { global: false })
  const s = new PackageBookingService(
    container.get(databaseServiceId),
    container.get(unitOfWorkServiceId),
  )
  const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
    const p = schema.safeParse(value)
    if (!p.success) bookingError('Invalid package selection.')
    return p.data
  }
  app.addHook('onRequest', async (req) => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers.origin &&
      !isBookingOriginAllowed(
        req.headers.origin,
        req.headers.host ?? '',
        req.protocol,
        process.env.NODE_ENV,
        process.env.PUBLIC_ORIGIN,
      )
    )
      bookingError('Cross-origin booking requests are not allowed.', 403)
  })
  app.post(
    '/customer/package-plan',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req, res) => {
      const a = await s.booking.session(req.cookies.customerSession)
      res.header('Cache-Control', 'no-store')
      return ok(res, await s.preview(a, parse(PackageSelection, req.body)))
    },
  )
  app.post(
    '/customer/package-reservations',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req, res) => {
      const a = await s.booking.session(req.cookies.customerSession)
      return ok(res, await s.reserve(a, parse(PackageReservation, req.body)))
    },
  )
  app.post(
    '/customer/package-slots',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req, res) => {
      const a = await s.booking.session(req.cookies.customerSession)
      const d = parse(
        PackageSelection.safeExtend({
          key: z.string().max(60),
          employeeId: z.number().int().positive(),
          date: z.iso.date(),
        }),
        req.body,
      )
      const c = await container.get(databaseServiceId).getClient()
      try {
        const x = await s.context(c, a, d),
          n = x.plan.nodes.find((n) => n.key === d.key)
        if (!n || n.blocked || (n.included && !x.available.includes(n.key)))
          bookingError('Utilization is unavailable.', 409)
        const times = (
          await c.query(
            `SELECT slot AS start FROM employee_booking_hours h CROSS JOIN LATERAL generate_series(($2::date+h.opens_at) AT TIME ZONE 'America/Sao_Paulo',($2::date+h.closes_at) AT TIME ZONE 'America/Sao_Paulo',interval '15 minutes') slot WHERE h.employee_id=$1 AND h.weekday=extract(dow FROM $2::date)`,
            [d.employeeId, d.date],
          )
        ).rows
        const result = []
        for (const time of times) {
          try {
            const q = await s.booking.quote(
              d.employeeId,
              [n.treatmentId],
              time.start.toISOString(),
              c,
              undefined,
              { duration: n.durationMinutes, noDeposit: n.included },
            )
            if (!n.included || q.endsAt <= new Date(x.terms.validUntil))
              result.push({
                startsAt: time.start.toISOString(),
                endsAt: q.endsAt.toISOString(),
                total: q.total,
                deposit: n.included ? 0 : q.deposit,
                duration: q.duration,
                deadline: q.deadline.toISOString(),
                instructions: q.instructions,
              })
          } catch (e) {
            if (![400, 409].includes((e as any).statusCode)) throw e
          }
        }
        return ok(res, result)
      } finally {
        c.release()
      }
    },
  )
}
