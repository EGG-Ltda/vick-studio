import { FastifyInstance } from 'fastify'
import z from 'zod'
import { container } from '@/di/bindings'
import { databaseServiceId, unitOfWorkServiceId } from '@/core/db'
import { authHook } from '@/shared/middlewares/auth'
import { ok } from '@/shared/utils/response'
import { bookingError } from '../booking/service'
import { AvailabilityService } from './service'
import { AvailabilityRequestSchema, DecisionSchema } from './schemas'
export default async function routes(app: FastifyInstance) {
  const s = new AvailabilityService(
      container.get(databaseServiceId),
      container.get(unitOfWorkServiceId),
    ),
    secured = { preHandler: authHook }
  const parse = <T>(schema: z.ZodType<T>, data: unknown): T => {
    const p = schema.safeParse(data)
    if (!p.success)
      bookingError(
        'Invalid availability data: ' +
          p.error.issues.map((i) => i.message).join('; '),
      )
    return p.data
  }
  const id = (value: string) => parse(z.coerce.number().int().positive(), value)
  app.get('/availability/me', secured, async (req, res) =>
    ok(res, await s.me(req.authUser)),
  )
  app.get('/availability/requests', secured, async (req, res) => {
    const q = parse(
      z
        .object({
          page: z.coerce.number().int().min(0).max(100000).default(0),
          status: z
            .enum(['', 'pending', 'approved', 'declined', 'cancelled'])
            .default(''),
          kind: z.enum(['', 'lunch', 'absence', 'vacation']).default(''),
          search: z.string().trim().max(100).default(''),
          from: z.iso.date().optional(),
          to: z.iso.date().optional(),
        })
        .refine(
          (q) => !q.from || !q.to || q.from <= q.to,
          'Invalid date range.',
        ),
      req.query,
    )
    return ok(res, await s.requests(req.authUser, q))
  })
  app.post('/availability/requests', secured, async (req, res) =>
    ok(
      res,
      await s.create(req.authUser, parse(AvailabilityRequestSchema, req.body)),
    ),
  )
  app.post<{ Params: { id: string } }>(
    '/availability/requests/:id/decision',
    secured,
    async (req, res) =>
      ok(
        res,
        await s.decide(
          req.authUser,
          id(req.params.id),
          parse(DecisionSchema, req.body),
        ),
      ),
  )
  app.get<{ Params: { id: string } }>(
    '/availability/requests/:id/events',
    secured,
    async (req, res) =>
      ok(res, await s.events(req.authUser, id(req.params.id))),
  )
  app.get('/availability/notices', secured, async (req, res) =>
    ok(res, await s.notices(req.authUser)),
  )
  app.post<{ Params: { id: string } }>(
    '/availability/notices/:id/read',
    secured,
    async (req, res) =>
      ok(res, await s.readNotice(req.authUser, id(req.params.id))),
  )
  app.get('/availability/blocks', secured, async (req, res) => {
    const q = parse(
      z
        .object({
          start: z.iso.datetime({ offset: true }),
          end: z.iso.datetime({ offset: true }),
        })
        .refine(
          (q) =>
            Date.parse(q.end) > Date.parse(q.start) &&
            Date.parse(q.end) - Date.parse(q.start) <= 32 * 86400000,
          'Calendar range must be at most 32 days.',
        ),
      req.query,
    )
    return ok(res, await s.blocks(req.authUser, q.start, q.end))
  })
}
