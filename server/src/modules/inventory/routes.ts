import { FastifyInstance } from 'fastify'
import z from 'zod'
import { container } from '@/di/bindings'
import { databaseServiceId, unitOfWorkServiceId } from '@/core/db'
import { authHook } from '@/shared/middlewares/auth'
import { ok } from '@/shared/utils/response'
import { bookingError } from '../booking/service'
import { InventoryService } from './service'
import {
  ProductSchema,
  SupplierSchema,
  MovementSchema,
  OrderProductSchema,
  SettlementSchema,
} from './schemas'
export default async function routes(app: FastifyInstance) {
  const service = new InventoryService(
    container.get(databaseServiceId),
    container.get(unitOfWorkServiceId),
  )
  const secured = { preHandler: authHook }
  const parse = <T>(schema: z.ZodType<T>, data: unknown): T => {
    const r = schema.safeParse(data)
    if (!r.success)
      bookingError(
        'Invalid inventory data: ' +
          r.error.issues
            .map((i) => i.path.join('.') + ': ' + i.message)
            .join('; '),
      )
    return r.data
  }
  const id = (value: string) => parse(z.coerce.number().int().positive(), value)
  const page = z.coerce.number().int().min(0).max(100000).default(0)
  const period = z.string().regex(/^(20\d{2})-(0[1-9]|1[0-2])$/)
  app.get('/inventory/access', secured, async (req, res) =>
    ok(res, await service.access(req.authUser)),
  )
  app.get('/inventory/products', secured, async (req, res) => {
    const q = parse(
      z.object({
        search: z.string().trim().max(100).default(''),
        page,
        inactive: z.enum(['true', 'false']).default('false'),
      }),
      req.query,
    )
    return ok(
      res,
      await service.products(
        req.authUser,
        q.search,
        q.page,
        q.inactive === 'true',
      ),
    )
  })
  app.post('/inventory/products', secured, async (req, res) =>
    ok(
      res,
      await service.product(req.authUser, null, parse(ProductSchema, req.body)),
    ),
  )
  app.put<{ Params: { id: string } }>(
    '/inventory/products/:id',
    secured,
    async (req, res) =>
      ok(
        res,
        await service.product(
          req.authUser,
          id(req.params.id),
          parse(ProductSchema, req.body),
        ),
      ),
  )
  app.get<{ Params: { id: string } }>(
    '/inventory/products/:id/movements',
    secured,
    async (req, res) =>
      ok(
        res,
        await service.movements(
          req.authUser,
          id(req.params.id),
          parse(z.object({ page }), req.query).page,
        ),
      ),
  )
  app.post<{ Params: { id: string } }>(
    '/inventory/products/:id/movements',
    secured,
    async (req, res) =>
      ok(
        res,
        await service.move(
          req.authUser,
          id(req.params.id),
          parse(MovementSchema, req.body),
        ),
      ),
  )
  app.get('/inventory/suppliers', secured, async (req, res) => {
    const q = parse(
      z.object({ search: z.string().trim().max(100).default(''), page }),
      req.query,
    )
    return ok(res, await service.suppliers(req.authUser, q.search, q.page))
  })
  app.post('/inventory/suppliers', secured, async (req, res) =>
    ok(
      res,
      await service.supplier(
        req.authUser,
        null,
        parse(SupplierSchema, req.body),
      ),
    ),
  )
  app.put<{ Params: { id: string } }>(
    '/inventory/suppliers/:id',
    secured,
    async (req, res) =>
      ok(
        res,
        await service.supplier(
          req.authUser,
          id(req.params.id),
          parse(SupplierSchema, req.body),
        ),
      ),
  )
  app.get('/inventory/settlements', secured, async (req, res) => {
    const q = parse(
      z.object({
        period,
        supplierId: z.coerce.number().int().positive().optional(),
        page,
      }),
      req.query,
    )
    return ok(
      res,
      await service.report(req.authUser, q.period, q.supplierId, q.page),
    )
  })
  app.get<{ Params: { id: string } }>(
    '/inventory/suppliers/:id/statement',
    secured,
    async (req, res) => {
      const q = parse(z.object({ period, page }), req.query)
      return ok(
        res,
        await service.statement(
          req.authUser,
          id(req.params.id),
          q.period,
          q.page,
        ),
      )
    },
  )
  app.post('/inventory/settlements', secured, async (req, res) =>
    ok(
      res,
      await service.settle(req.authUser, parse(SettlementSchema, req.body)),
    ),
  )
  app.get('/inventory/payment-methods', secured, async (req, res) => {
    service.finance(req.authUser)
    return ok(
      res,
      (
        await service.query(
          'SELECT id,name FROM payment_methods WHERE removed_at IS NULL ORDER BY name',
        )
      ).rows,
    )
  })
  app.get<{ Params: { id: string } }>(
    '/orders/:id/products',
    secured,
    async (req, res) =>
      ok(res, await service.orderCatalog(req.authUser, id(req.params.id))),
  )
  app.post<{ Params: { id: string } }>(
    '/orders/:id/products',
    secured,
    async (req, res) =>
      ok(
        res,
        await service.sell(
          req.authUser,
          id(req.params.id),
          parse(OrderProductSchema, req.body),
        ),
      ),
  )
}
