import { FastifyInstance } from 'fastify'
import z from 'zod'
import { container } from '@/di/bindings'
import { databaseServiceId, unitOfWorkServiceId } from '@/core/db'
import { authHook, passwordAdminHook } from '@/shared/middlewares/auth'
import { ok } from '@/shared/utils/response'
import { canManagePasswords } from '@/shared/utils/user'
import { bookingError } from '../booking/service'
import { isBookingOriginAllowed } from '../booking/origin'
import { SocialService } from './service'
import { AcquisitionSchema, ChangeSchema, PromotionSchema } from './schemas'
import { PaymentSchema, RefundSchema } from '../customers/schemas'
export default async function routes(app: FastifyInstance) {
  const s = new SocialService(
    container.get(databaseServiceId),
    container.get(unitOfWorkServiceId),
  )
  const secured = { preHandler: [authHook] },
    admin = { preHandler: [authHook, passwordAdminHook] }
  const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
    const p = schema.safeParse(value)
    if (!p.success)
      bookingError(
        'Invalid data: ' +
          p.error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; '),
      )
    return p.data
  }
  const id = (v: unknown) => parse(z.coerce.number().int().positive(), v)
  app.addHook('onRequest', async (req) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || !req.headers.origin)
      return
    if (
      !isBookingOriginAllowed(
        req.headers.origin,
        req.headers.host ?? '',
        req.protocol,
        process.env.NODE_ENV,
        process.env.PUBLIC_ORIGIN,
      )
    )
      bookingError('Cross-origin requests are not allowed.', 403)
  })
  app.get('/social/birthdays', secured, async (req, res) => {
    const q = parse(
      z.object({
        month: z.coerce.number().int().min(1).max(12),
        page: z.coerce.number().int().min(0).max(100000).default(0),
      }),
      req.query,
    )
    return ok(res, await s.birthdays(req.authUser, q.month, q.page))
  })
  app.get('/social/birthdays/today', secured, async (req, res) => {
    // Count all scoped birthdays today, independent of pagination in the month listing.
    await s.customers.access(req.authUser)
    const rows = (
      await s.query(
        `SELECT count(*)::int AS count FROM customers c JOIN persons p ON p.id=c.person_id WHERE extract(month FROM p.born_at)=extract(month FROM now() AT TIME ZONE 'America/Sao_Paulo') AND extract(day FROM p.born_at)=extract(day FROM now() AT TIME ZONE 'America/Sao_Paulo') AND ($1::boolean OR EXISTS(SELECT 1 FROM salon_schedules a JOIN salon_schedule_treatments t ON t.schedule_id=a.id JOIN employees e ON e.id=t.employee_id WHERE a.customer_id=c.id AND e.user_id=$2 AND e.is_active))`,
        [canManagePasswords(req.authUser), req.authUser.id],
      )
    ).rows[0]
    return ok(res, {
      count: rows.count,
    })
  })
  app.get<{ Params: { id: string } }>(
    '/orders/:id/reschedule-slots',
    secured,
    async (req, res) => {
      const q = parse(
        z.object({
          employeeId: z.coerce.number().int().positive(),
          date: z.iso.date(),
        }),
        req.query,
      )
      return ok(
        res,
        await s.rescheduleSlots(
          req.authUser,
          id(req.params.id),
          q.employeeId,
          q.date,
        ),
      )
    },
  )
  app.get('/social/promotions', admin, async (req, res) =>
    ok(res, await s.promotions()),
  )
  app.post('/social/promotions', admin, async (req, res) =>
    ok(
      res,
      await s.savePromotion(req.authUser, parse(PromotionSchema, req.body)),
    ),
  )
  app.put<{ Params: { id: string } }>(
    '/social/promotions/:id',
    admin,
    async (req, res) =>
      ok(
        res,
        await s.savePromotion(
          req.authUser,
          parse(PromotionSchema, req.body),
          id(req.params.id),
        ),
      ),
  )
  app.get('/public/promotions', async (req, res) =>
    ok(res, {
      items: await s.promotions(true),
      validUntil: await s.validUntil(),
    }),
  )
  app.post(
    '/social/art',
    { ...admin, bodyLimit: 4300000 },
    async (req, res) => {
      const d = parse(
        z.object({
          mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
          base64: z
            .string()
            .max(4194304)
            .regex(/^[A-Za-z0-9+/]+={0,2}$/),
        }),
        req.body,
      )
      const bytes = Buffer.from(d.base64, 'base64')
      if (
        bytes.length > 3145728 ||
        bytes.length < 12 ||
        bytes.toString('base64') !== d.base64
      )
        bookingError('Artwork must be a PNG, JPEG or WebP image up to 3 MB.')
      const png =
        bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
        bytes.subarray(12, 16).toString() === 'IHDR'
      const jpeg =
        bytes[0] === 255 &&
        bytes[1] === 216 &&
        bytes[2] === 255 &&
        bytes[bytes.length - 2] === 255 &&
        bytes[bytes.length - 1] === 217
      const webp =
        bytes.subarray(0, 4).toString() === 'RIFF' &&
        bytes.subarray(8, 12).toString() === 'WEBP' &&
        bytes.readUInt32LE(4) + 8 === bytes.length
      if (
        !(d.mime === 'image/png' ? png : d.mime === 'image/jpeg' ? jpeg : webp)
      )
        bookingError('Artwork does not match the declared image format.')
      return ok(
        res,
        (
          await s.query(
            'INSERT INTO promotion_art(mime,data,created_by) VALUES($1,$2,$3) RETURNING id::int',
            [d.mime, bytes, req.authUser.id],
          )
        ).rows[0],
      )
    },
  )
  app.get<{ Params: { id: string } }>(
    '/public/promotion-art/:id',
    async (req, res) => {
      const row = (
        await s.query('SELECT mime,data FROM promotion_art WHERE id=$1', [
          id(req.params.id),
        ])
      ).rows[0]
      if (!row) bookingError('Artwork not found.', 404)
      return res
        .header('Content-Type', row.mime)
        .header('X-Content-Type-Options', 'nosniff')
        .header('Cache-Control', 'public,max-age=86400,immutable')
        .send(row.data)
    },
  )
  app.post('/customer/packages', async (req, res) => {
    const account = await s.booking.session(req.cookies.customerSession)
    return ok(res, await s.acquire(account, parse(AcquisitionSchema, req.body)))
  })
  app.get('/customer/packages', async (req, res) => {
    const account = await s.booking.session(req.cookies.customerSession)
    return ok(res, await s.purchases(account.customerId))
  })
  app.get<{ Params: { id: string } }>(
    '/customers/:id/packages',
    secured,
    async (req, res) =>
      ok(res, await s.purchases(id(req.params.id), req.authUser)),
  )
  app.get<{ Params: { id: string } }>(
    '/social/packages/:id',
    admin,
    async (req, res) => {
      const row = (
        await s.query('SELECT customer_id FROM package_purchases WHERE id=$1', [
          id(req.params.id),
        ])
      ).rows[0]
      if (!row) bookingError('Package not found.', 404)
      return ok(
        res,
        (await s.purchases(row.customer_id, req.authUser)).find(
          (p: any) => p.id === id(req.params.id),
        ),
      )
    },
  )
  app.get('/social/payment-methods', admin, async (req, res) =>
    ok(
      res,
      (
        await s.query(
          'SELECT id,name FROM payment_methods WHERE removed_at IS NULL ORDER BY name',
        )
      ).rows,
    ),
  )
  app.post<{ Params: { id: string } }>(
    '/social/packages/:id/payments',
    admin,
    async (req, res) =>
      ok(
        res,
        await s.receipt(
          req.authUser,
          id(req.params.id),
          parse(PaymentSchema, req.body),
        ),
      ),
  )
  app.post<{ Params: { id: string; receipt: string } }>(
    '/social/packages/:id/refunds/:receipt',
    admin,
    async (req, res) =>
      ok(
        res,
        await s.receipt(
          req.authUser,
          id(req.params.id),
          parse(RefundSchema, req.body),
          id(req.params.receipt),
        ),
      ),
  )
  app.post<{ Params: { id: string } }>(
    '/orders/:id/change',
    secured,
    async (req, res) =>
      ok(
        res,
        await s.change(
          req.authUser,
          id(req.params.id),
          parse(ChangeSchema, req.body),
        ),
      ),
  )
  app.get<{ Params: { id: string } }>(
    '/orders/:id/changes',
    secured,
    async (req, res) => {
      await s.customers.authorizeOrder(req.authUser, id(req.params.id))
      return ok(
        res,
        (
          await s.query(
            `SELECT a.id,a.action,a.reason,a.previous_data AS "previousData",a.current_data AS "currentData",a.created_at AS "createdAt",u.login AS author FROM schedule_changes a JOIN app_users u ON u.id=a.actor_id WHERE schedule_id=$1 ORDER BY a.id DESC`,
            [id(req.params.id)],
          )
        ).rows,
      )
    },
  )
}
