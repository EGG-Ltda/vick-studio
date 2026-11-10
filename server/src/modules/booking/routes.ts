import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import z from 'zod'
import { container } from '@/di/bindings'
import { databaseServiceId, unitOfWorkServiceId } from '@/core/db'
import { authHook, passwordAdminHook } from '@/shared/middlewares/auth'
import { canManagePasswords } from '@/shared/utils/user'
import { ok } from '@/shared/utils/response'
import { BookingService, bookingError } from './service'
import { isBookingOriginAllowed } from './origin'
import {
  BookingSchema,
  EmployeeSchema,
  LoginSchema,
  RegistrationSchema,
  SettingsSchema,
  StaffBookingSchema,
  employeeValidationMessage,
} from './schemas'

export default async function bookingRoutes(app: FastifyInstance) {
  const service = new BookingService(
    container.get(databaseServiceId),
    container.get(unitOfWorkServiceId),
  )
  await app.register(rateLimit, { global: false })
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
      bookingError('Cross-origin booking requests are not allowed.', 403)
  })
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/api/customer',
    maxAge: 7 * 86400,
  }
  async function loginSession(account: any, res: FastifyReply) {
    const token = await service.createSession(account.id)
    res.setCookie('customerSession', token, cookieOptions)
    return ok(res, account)
  }
  async function customer(req: FastifyRequest) {
    return service.session(req.cookies.customerSession)
  }
  const admin = { preHandler: [authHook, passwordAdminHook] }
  const limited = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }
  app.post('/customer/register', limited, async (req, res) => {
    const data = RegistrationSchema.safeParse(req.body)
    if (!data.success)
      bookingError(
        'Provide a valid full name, CPF, phone, email and password (8–32 characters).',
      )
    return loginSession(await service.register(data.data), res)
  })
  app.post('/customer/login', limited, async (req, res) => {
    const data = LoginSchema.safeParse(req.body)
    if (!data.success) bookingError('Invalid email or password.', 401)
    return loginSession(
      await service.login(data.data.email, data.data.password),
      res,
    )
  })
  app.get('/customer/session', async (req, res) => ok(res, await customer(req)))
  app.post('/customer/logout', async (req, res) => {
    await service.logout(req.cookies.customerSession)
    res.clearCookie('customerSession', { path: '/api/customer' })
    return ok(res, null)
  })
  app.get('/booking/catalog', async (req, res) => {
    const [settings, employees, treatments] = await Promise.all([
      service.settings(),
      service.employees(true),
      service.query(
        'SELECT id,name,description,price::float AS price,duration_minutes AS "durationMinutes" FROM salon_treatments WHERE is_active ORDER BY name',
      ),
    ])
    return ok(res, {
      settings,
      employees: employees.map(
        ({
          id,
          name,
          treatmentIds,
          hours,
        }: {
          id: number
          name: string
          treatmentIds: number[]
          hours: unknown[]
        }) => ({ id, name, treatmentIds, hours }),
      ),
      treatments: treatments.rows,
    })
  })
  const slotQuery = z.object({
    employeeId: z.coerce.number().int().positive(),
    treatmentIds: z
      .string()
      .regex(/^\d+(,\d+){0,9}$/)
      .transform((value) => value.split(',').map(Number))
      .refine((ids) => new Set(ids).size === ids.length),
    date: z.iso.date(),
    depositDeadline: z.iso.datetime({ offset: true }).optional(),
  })
  app.get('/customer/slots', async (req, res) => {
    await customer(req)
    const parsed = slotQuery.safeParse(req.query)
    if (!parsed.success || parsed.data.depositDeadline)
      bookingError('Invalid availability query.')
    return ok(
      res,
      await service.slots(
        parsed.data.employeeId,
        parsed.data.treatmentIds,
        parsed.data.date,
      ),
    )
  })
  app.post(
    '/customer/bookings',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req, res) => {
      const account = await customer(req)
      const parsed = BookingSchema.safeParse(req.body)
      if (!parsed.success) bookingError('Invalid reservation data.')
      const booking = await service.create(parsed.data, account)
      const { employeeUserId, ...publicBooking } = booking
      return ok(res, publicBooking)
    },
  )
  app.get('/customer/bookings', async (req, res) => {
    const account = await customer(req)
    await service.expire()
    return ok(res, await service.customerBookings(account.id))
  })
  app.get('/booking/settings', admin, async (req, res) =>
    ok(res, await service.settings()),
  )
  app.put('/booking/settings', admin, async (req, res) => {
    const parsed = SettingsSchema.safeParse(req.body)
    if (!parsed.success) bookingError('Invalid booking settings.')
    return ok(res, await service.updateSettings(parsed.data))
  })
  app.get('/booking/employees', admin, async (req, res) => {
    const [employees, users] = await Promise.all([
      service.employees(),
      service.query(
        'SELECT id,login,email FROM app_users WHERE is_active AND removed_at IS NULL ORDER BY login',
      ),
    ])
    return ok(res, { employees, users: users.rows })
  })
  app.post('/booking/employees', admin, async (req, res) => {
    const parsed = EmployeeSchema.safeParse(req.body)
    if (!parsed.success) bookingError(employeeValidationMessage(parsed.error))
    try {
      return ok(res, await service.saveEmployee(parsed.data))
    } catch (error: any) {
      if (error.code === '23505')
        bookingError('Employee or CPF is already registered.', 409)
      throw error
    }
  })
  app.put<{ Params: { id: string } }>(
    '/booking/employees/:id',
    admin,
    async (req, res) => {
      const parsed = EmployeeSchema.safeParse(req.body),
        id = Number(req.params.id)
      if (!parsed.success) bookingError(employeeValidationMessage(parsed.error))
      if (!Number.isSafeInteger(id) || id <= 0)
        bookingError('Invalid employee ID.')
      return ok(res, await service.saveEmployee(parsed.data, id))
    },
  )
  app.get(
    '/booking/staff-slots',
    { preHandler: authHook },
    async (req, res) => {
      const parsed = slotQuery.safeParse(req.query)
      if (!parsed.success || !parsed.data.depositDeadline)
        bookingError('A specific deposit deadline is required.')
      const employee = (
        await service.query('SELECT user_id FROM employees WHERE id=$1', [
          parsed.data.employeeId,
        ])
      ).rows[0]
      if (
        !canManagePasswords(req.authUser) &&
        employee?.user_id !== req.authUser.id
      )
        bookingError('Not authorized for this professional.', 403)
      return ok(
        res,
        await service.slots(
          parsed.data.employeeId,
          parsed.data.treatmentIds,
          parsed.data.date,
          parsed.data.depositDeadline,
        ),
      )
    },
  )
  app.get('/booking/customers', { preHandler: authHook }, async (req, res) => {
    const query = z
      .object({ search: z.string().trim().min(2).max(100) })
      .safeParse(req.query)
    if (!query.success) bookingError('Enter at least two characters to search.')
    return ok(
      res,
      (
        await service.query(
          `SELECT c.id,p.name,a.email FROM customers c JOIN persons p ON p.id=c.person_id JOIN customer_accounts a ON a.customer_id=c.id WHERE p.name ILIKE $1 OR a.email ILIKE $1 ORDER BY p.name LIMIT 20`,
          ['%' + query.data.search + '%'],
        )
      ).rows,
    )
  })
  app.post(
    '/booking/staff-bookings',
    { preHandler: authHook },
    async (req, res) => {
      const parsed = StaffBookingSchema.safeParse(req.body)
      if (!parsed.success) bookingError('Invalid staff reservation data.')
      const employee = (
        await service.query('SELECT user_id FROM employees WHERE id=$1', [
          parsed.data.employeeId,
        ])
      ).rows[0]
      if (
        !canManagePasswords(req.authUser) &&
        employee?.user_id !== req.authUser.id
      )
        bookingError('Not authorized for this professional.', 403)
      const account = (
        await service.query(
          'SELECT id,customer_id AS "customerId" FROM customer_accounts WHERE customer_id=$1',
          [parsed.data.customerId],
        )
      ).rows[0]
      if (!account) bookingError('Customer must register before booking.', 404)
      return ok(
        res,
        await service.create(parsed.data, account, parsed.data.depositDeadline),
      )
    },
  )
  app.get<{ Params: { id: string } }>(
    '/booking/orders/:id',
    { preHandler: authHook },
    async (req, res) => {
      const id = Number(req.params.id)
      if (!Number.isSafeInteger(id) || id <= 0)
        bookingError('Invalid booking ID.')
      await service.expire()
      const booking = await service.get(id)
      if (!booking) bookingError('Booking not found.', 404)
      return ok(res, {
        ...booking,
        canConfirmDeposit:
          canManagePasswords(req.authUser) ||
          booking.employeeUserId === req.authUser.id,
      })
    },
  )
  app.post<{ Params: { id: string } }>(
    '/booking/orders/:id/deposit',
    { preHandler: authHook },
    async (req, res) => {
      const parsed = z
          .object({ amount: z.number().nonnegative().multipleOf(0.01) })
          .safeParse(req.body),
        id = Number(req.params.id)
      if (!parsed.success || !Number.isSafeInteger(id) || id <= 0)
        bookingError('Invalid deposit amount.')
      return ok(
        res,
        await service.confirm(id, req.authUser, parsed.data.amount),
      )
    },
  )
  let running = false
  async function expire() {
    if (running) return
    running = true
    try {
      await service.expire()
      await service.query(
        'DELETE FROM customer_sessions WHERE expires_at<=now()',
      )
    } catch (error: any) {
      app.log.error({ err: error }, 'Booking expiration failed')
    } finally {
      running = false
    }
  }
  let timer: ReturnType<typeof setInterval>
  app.addHook('onReady', async () => {
    await expire()
    timer = setInterval(
      () => void expire(),
      process.env.NODE_ENV === 'test' ? 500 : 60000,
    )
    timer.unref()
  })
  app.addHook('onClose', async () => {
    clearInterval(timer)
  })
}
