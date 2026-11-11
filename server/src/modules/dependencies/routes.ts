import type { FastifyInstance } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { container } from '@/di/bindings'
import {
  databaseServiceId,
  unitOfWorkServiceId,
  type IDatabaseService,
} from '@/core/db'
import { authHook } from '@/shared/middlewares/auth'
import { ok } from '@/shared/utils/response'
import { CustomerService } from '../customers/service'
import { isBookingOriginAllowed } from '../booking/origin'
import { DependencyService, PlanQuery, GroupSchema } from './service'
import { invalid } from './rules'
export default async function routes(app: FastifyInstance) {
  await app.register(rateLimit, { global: false })
  const db: IDatabaseService = container.get(databaseServiceId),
    work = container.get(unitOfWorkServiceId),
    s = new DependencyService(db, work),
    customers = new CustomerService(db, work)
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
      invalid('Cross-origin booking requests are not allowed.', 403)
  })
  app.post(
    '/booking/dependency-plan',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req, res) => {
      const p = PlanQuery.safeParse(req.body)
      if (!p.success) invalid('Select valid services or a package.')
      res.header('Cache-Control', 'no-store')
      return ok(
        res,
        await s.plan(p.data.rootIds, p.data.promotionId, p.data.separate),
      )
    },
  )
  app.post(
    '/customer/booking-groups',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req, res) => {
      const a = await s.booking.session(req.cookies.customerSession),
        p = GroupSchema.safeParse(req.body)
      if (!p.success || p.data.customerId)
        invalid('Invalid linked booking data.')
      return ok(res, await s.create(a, p.data))
    },
  )
  app.post(
    '/booking/staff-groups',
    { preHandler: authHook },
    async (req, res) => {
      const p = GroupSchema.safeParse(req.body)
      if (!p.success || !p.data.customerId)
        invalid('Choose a customer and all appointments.')
      await customers.authorizeCustomer(req.authUser, p.data.customerId)
      const a = (
        await s.booking.query(
          'SELECT id,customer_id AS "customerId" FROM customer_accounts WHERE customer_id=$1',
          [p.data.customerId],
        )
      ).rows[0]
      if (!a) invalid('Customer must register before booking.', 404)
      return ok(res, await s.create(a, p.data, req.authUser))
    },
  )
  app.get<{ Params: { id: string } }>(
    '/orders/:id/dependencies',
    { preHandler: authHook },
    async (req, res) => {
      const id = Number(req.params.id)
      if (!Number.isSafeInteger(id) || id <= 0) invalid('Invalid appointment.')
      await customers.authorizeOrder(req.authUser, id)
      const c = await db.getClient()
      try {
        return ok(res, await s.detail(c, id, req.authUser))
      } finally {
        c.release()
      }
    },
  )
}
