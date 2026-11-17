import { FastifyInstance } from 'fastify'
import z from 'zod'
import { container } from '@/di/bindings'
import {
  databaseServiceId,
  IDatabaseService,
  unitOfWorkServiceId,
  IDatabaseUnitOfWork,
} from '@/core/db'
import { authHook } from '@/shared/middlewares/auth'
import { salonWide } from '@/core/access'
import { ok } from '@/shared/utils/response'
import { bookingError } from '../booking/service'
export default async function routes(app: FastifyInstance) {
  const db: IDatabaseService = container.get(databaseServiceId)
  const work: IDatabaseUnitOfWork = container.get(unitOfWorkServiceId)
  app.post('/finance/manual', { preHandler: authHook }, async (req, res) => {
    const d = z
      .object({
        description: z.string().trim().min(1).max(1023),
        amount: z.number().positive().max(99999.99).multipleOf(0.01),
        isDebit: z.boolean(),
        methodId: z.number().int().positive(),
        typeId: z.number().int().positive(),
        requestKey: z.uuid(),
      })
      .safeParse(req.body)
    if (!d.success) bookingError('Invalid financial entry.')
    const data = d.data
    const result = await work.transaction(async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(70431,$1)', [req.authUser.id])
      const existing = (
        await c.query(
          'SELECT * FROM salon_transactions WHERE order_id IS NULL AND recorded_by=$1 AND request_key=$2',
          [req.authUser.id, data.requestKey],
        )
      ).rows[0]
      if (existing) {
        if (
          Number(existing.value) !== data.amount ||
          existing.description !== data.description ||
          existing.method_id !== data.methodId ||
          existing.type_id !== data.typeId ||
          existing.is_debit !== data.isDebit
        )
          bookingError(
            'Request key already used with different financial data.',
            409,
          )
        return { id: existing.id }
      }
      if (
        !(
          await c.query(
            'SELECT 1 FROM payment_methods m CROSS JOIN transaction_types t WHERE m.id=$1 AND m.removed_at IS NULL AND t.id=$2',
            [data.methodId, data.typeId],
          )
        ).rows.length
      )
        bookingError('Invalid payment method or entry category.')
      return (
        await c.query(
          'INSERT INTO salon_transactions(method_id,type_id,is_debit,description,value,created_at,recorded_by,request_key) VALUES($1,$2,$3,$4,$5,now(),$6,$7) RETURNING id',
          [
            data.methodId,
            data.typeId,
            data.isDebit,
            data.description,
            data.amount,
            req.authUser.id,
            data.requestKey,
          ],
        )
      ).rows[0]
    })
    return ok(res, result)
  })
  app.get('/finance/options', { preHandler: authHook }, async (req, res) => {
    const c = await db.getClient()
    try {
      return ok(res, {
        methods: (
          await c.query(
            'SELECT id,name FROM payment_methods WHERE removed_at IS NULL ORDER BY name',
            [],
          )
        ).rows,
        types: (
          await c.query(
            'SELECT id,name FROM transaction_types ORDER BY name',
            [],
          )
        ).rows,
      })
    } finally {
      c.release()
    }
  })
  app.get('/finance', { preHandler: authHook }, async (req, res) => {
    const parsed = z
      .object({
        from: z.iso.date(),
        to: z.iso.date(),
        page: z.coerce.number().int().min(0).max(100000).default(0),
      })
      .safeParse(req.query)
    if (!parsed.success || parsed.data.to < parsed.data.from)
      bookingError('Invalid finance interval.')
    const { from, to, page } = parsed.data,
      wide = salonWide(req.authUser),
      client = await db.getClient()
    try {
      const amount = `round(abs(tx.value)*CASE WHEN $1::boolean THEN 1 ELSE COALESCE((SELECT sum(st.price) FROM salon_schedule_treatments st JOIN employees e ON e.id=st.employee_id WHERE st.schedule_id=tx.order_id AND e.user_id=$2 AND e.is_active)/NULLIF((SELECT sum(st.price) FROM salon_schedule_treatments st WHERE st.schedule_id=tx.order_id),0),0) END,2)`
      const base = `FROM salon_transactions tx LEFT JOIN payment_methods m ON m.id=tx.method_id WHERE tx.created_at>=($3::date::timestamp AT TIME ZONE 'America/Sao_Paulo') AND tx.created_at<(($4::date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo') AND ($1::boolean OR (tx.ledger_kind IS NOT NULL AND EXISTS(SELECT 1 FROM salon_schedule_treatments st JOIN employees e ON e.id=st.employee_id WHERE st.schedule_id=tx.order_id AND e.user_id=$2 AND e.is_active)))`
      const params = [wide, req.authUser.id, from, to]
      const totals = (
        await client.query(
          `SELECT COALESCE(sum(${amount}) FILTER(WHERE NOT tx.is_debit),0)::float AS income,COALESCE(sum(${amount}) FILTER(WHERE tx.is_debit),0)::float AS expenses,count(*)::int AS total ${base}`,
          params,
        )
      ).rows[0]
      const items = (
        await client.query(
          `SELECT tx.id,tx.order_id AS "orderId",tx.description,tx.created_at AS "createdAt",tx.is_debit AS "isDebit",(${amount})::float AS amount,m.name AS method ${base} ORDER BY tx.created_at DESC,tx.id DESC LIMIT 20 OFFSET $5`,
          [...params, page * 20],
        )
      ).rows
      return ok(res, {
        ...totals,
        net: Math.round((totals.income - totals.expenses) * 100) / 100,
        items,
        page,
        hasNext: (page + 1) * 20 < totals.total,
        scope: wide ? 'all' : 'own',
        note: wide
          ? null
          : 'Recebimentos e devoluções atribuídos aos seus atendimentos. Não representam comissão ou lucro líquido.',
      })
    } finally {
      client.release()
    }
  })
}
