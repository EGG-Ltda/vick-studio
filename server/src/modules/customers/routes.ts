import { FastifyInstance } from 'fastify'
import z from 'zod'
import { container } from '@/di/bindings'
import { databaseServiceId, unitOfWorkServiceId } from '@/core/db'
import { authHook } from '@/shared/middlewares/auth'
import { ok } from '@/shared/utils/response'
import { bookingError } from '../booking/service'
import { CustomerService } from './service'
import {
  ConsumptionSchema,
  NoteSchema,
  PaymentSchema,
  ProfileSchema,
  RefundSchema,
  pageSchema,
} from './schemas'
export default async function customerRoutes(app: FastifyInstance) {
  const service = new CustomerService(
    container.get(databaseServiceId),
    container.get(unitOfWorkServiceId),
  )
  const secured = { preHandler: authHook }
  const id = (value: string) => {
    const result = z.coerce.number().int().positive().safeParse(value)
    if (!result.success) bookingError('Invalid identifier.')
    return result.data
  }
  const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
    const result = schema.safeParse(body)
    if (!result.success)
      bookingError(
        'Invalid data: ' +
          result.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('; '),
      )
    return result.data
  }
  app.get('/customers/access', secured, async (req, res) =>
    ok(res, await service.access(req.authUser)),
  )
  app.get('/customers', secured, async (req, res) => {
    const query = parse(
      z.object({
        page: pageSchema,
        search: z.string().trim().max(100).default(''),
      }),
      req.query,
    )
    return ok(res, await service.list(req.authUser, query.search, query.page))
  })
  app.get<{ Params: { id: string } }>(
    '/customers/:id',
    secured,
    async (req, res) =>
      ok(res, await service.detail(req.authUser, id(req.params.id))),
  )
  app.put<{ Params: { id: string } }>(
    '/customers/:id',
    secured,
    async (req, res) =>
      ok(
        res,
        await service.edit(
          req.authUser,
          id(req.params.id),
          parse(ProfileSchema, req.body),
        ),
      ),
  )
  app.get<{ Params: { id: string } }>(
    '/customers/:id/history',
    secured,
    async (req, res) => {
      const query = parse(
        z.object({
          page: pageSchema,
          view: z.enum(['all', 'upcoming', 'past', 'completed']).default('all'),
        }),
        req.query,
      )
      return ok(
        res,
        await service.history(
          req.authUser,
          id(req.params.id),
          query.view,
          query.page,
        ),
      )
    },
  )
  app.get<{ Params: { id: string } }>(
    '/customers/:id/payments',
    secured,
    async (req, res) => {
      const query = parse(z.object({ page: pageSchema }), req.query)
      return ok(
        res,
        await service.payments(req.authUser, id(req.params.id), query.page),
      )
    },
  )
  app.get<{ Params: { id: string } }>(
    '/customers/:id/notes',
    secured,
    async (req, res) =>
      ok(res, await service.notes(req.authUser, id(req.params.id))),
  )
  app.post<{ Params: { id: string } }>(
    '/customers/:id/notes',
    secured,
    async (req, res) =>
      ok(
        res,
        await service.addNote(
          req.authUser,
          id(req.params.id),
          parse(NoteSchema, req.body).body,
        ),
      ),
  )
  app.get<{ Params: { id: string } }>(
    '/orders/:id',
    secured,
    async (req, res) =>
      ok(res, await service.order(req.authUser, id(req.params.id))),
  )
  app.post<{ Params: { id: string } }>(
    '/orders/:id/consumptions',
    secured,
    async (req, res) =>
      ok(
        res,
        await service.addConsumption(
          req.authUser,
          id(req.params.id),
          parse(ConsumptionSchema, req.body),
        ),
      ),
  )
  app.post<{ Params: { id: string; itemId: string } }>(
    '/orders/:id/consumptions/:itemId/void',
    secured,
    async (req, res) =>
      ok(
        res,
        await service.voidConsumption(
          req.authUser,
          id(req.params.id),
          id(req.params.itemId),
          parse(
            z.object({ reason: z.string().trim().min(3).max(1000) }),
            req.body,
          ).reason,
        ),
      ),
  )
  app.post<{ Params: { id: string } }>(
    '/orders/:id/notes',
    secured,
    async (req, res) =>
      ok(
        res,
        await service.orderNote(
          req.authUser,
          id(req.params.id),
          parse(NoteSchema, req.body).body,
        ),
      ),
  )
  app.post<{ Params: { id: string } }>(
    '/orders/:id/payments',
    secured,
    async (req, res) =>
      ok(
        res,
        await service.recordPayment(
          req.authUser,
          id(req.params.id),
          parse(PaymentSchema, req.body),
        ),
      ),
  )
  app.post<{ Params: { id: string; paymentId: string } }>(
    '/orders/:id/payments/:paymentId/refund',
    secured,
    async (req, res) =>
      ok(
        res,
        await service.refund(
          req.authUser,
          id(req.params.id),
          id(req.params.paymentId),
          parse(RefundSchema, req.body),
        ),
      ),
  )
  app.post<{ Params: { id: string } }>(
    '/orders/:id/complete',
    secured,
    async (req, res) =>
      ok(res, await service.complete(req.authUser, id(req.params.id))),
  )
}
