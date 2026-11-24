import { FastifyInstance } from 'fastify'
import z from 'zod'
import { container } from '@/di/bindings'
import { databaseServiceId, unitOfWorkServiceId } from '@/core/db'
import { authHook } from '@/shared/middlewares/auth'
import { ok } from '@/shared/utils/response'
import { bookingError } from '../booking/service'
import { CommissionService } from './service'
import type { Rate } from './service'
const percentage = z.number().min(0).max(100).multipleOf(0.01).nullable()
export default async function routes(app: FastifyInstance) {
  const s = new CommissionService(
      container.get(databaseServiceId),
      container.get(unitOfWorkServiceId),
    ),
    secured = { preHandler: authHook }
  const parse = <T>(schema: z.ZodType<T>, data: unknown): T => {
    const p = schema.safeParse(data)
    if (!p.success) bookingError('Invalid commission data.')
    return p.data
  }
  const id = (v: string) => parse(z.coerce.number().int().positive(), v)
  const filters = z.object({
    employeeId: z.coerce.number().int().positive().optional(),
    treatmentId: z.coerce.number().int().positive().optional(),
    page: z.coerce.number().int().min(0).max(100000).default(0),
  })
  app.get('/commissions/options', secured, async (req, res) => {
    const data = await s.options(req.authUser)
    return ok(res, {
      ...data,
      methods: data.canSettle
        ? (
            await s.query(
              'SELECT id,name FROM payment_methods WHERE removed_at IS NULL ORDER BY name',
            )
          ).rows
        : [],
    })
  })
  app.get('/commissions/rates', secured, async (req, res) =>
    ok(res, await s.listRates(req.authUser, parse(filters, req.query))),
  )
  app.get<{ Params: { id: string } }>(
    '/commissions/employees/:id',
    secured,
    async (req, res) => ok(res, await s.rates(req.authUser, id(req.params.id))),
  )
  app.put<{ Params: { id: string } }>(
    '/commissions/employees/:id/rates',
    secured,
    async (req, res) => {
      const d = parse(
        z.object({
          version: z.number().int().positive(),
          rates: z
            .array(
              z.object({
                treatmentId: z.number().int().positive(),
                standardPercent: percentage,
                packagePercent: percentage,
              }),
            )
            .max(100),
        }),
        req.body,
      )
      return ok(
        res,
        await s.saveRates(
          req.authUser,
          id(req.params.id),
          d.version,
          d.rates as Rate[],
        ),
      )
    },
  )
  app.get('/commissions/movements', secured, async (req, res) => {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
    }).format(new Date())
    const d = parse(
      filters
        .safeExtend({
          from: z.iso.date().default(today.slice(0, 7) + '-01'),
          to: z.iso.date().default(today),
        })
        .refine((d) => d.from <= d.to, 'Invalid period.'),
      req.query,
    )
    return ok(res, await s.movements(req.authUser, d))
  })
  app.get<{ Params: { id: string } }>(
    '/commissions/employees/:id/balance',
    secured,
    async (req, res) =>
      ok(res, await s.balance(req.authUser, id(req.params.id))),
  )
  app.get<{ Params: { id: string } }>(
    '/commissions/employees/:id/closings',
    secured,
    async (req, res) =>
      ok(res, await s.closings(req.authUser, id(req.params.id))),
  )
  app.post<{ Params: { id: string } }>(
    '/commissions/employees/:id/closings',
    secured,
    async (req, res) =>
      ok(
        res,
        await s.close(
          req.authUser,
          id(req.params.id),
          parse(
            z.object({
              expectedAmount: z.number().min(0).max(999999999).multipleOf(0.01),
              methodId: z.number().int().positive(),
              description: z.string().trim().min(3).max(1000),
              requestKey: z.uuid(),
            }),
            req.body,
          ),
        ),
      ),
  )
  app.get<{ Params: { id: string } }>(
    '/commissions/orders/:id',
    secured,
    async (req, res) => ok(res, await s.order(req.authUser, id(req.params.id))),
  )
  app.post<{ Params: { id: string } }>(
    '/commissions/orders/:id/annul',
    secured,
    async (req, res) =>
      ok(
        res,
        await s.annul(
          req.authUser,
          id(req.params.id),
          parse(
            z.object({
              reason: z.string().trim().min(3).max(1000),
              acknowledgeLinkedImpact: z.boolean().default(false),
            }),
            req.body,
          ),
        ),
      ),
  )
}
