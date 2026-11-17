import { createHash, randomUUID } from 'crypto'
import z from 'zod'
import {
  IDatabaseService,
  IDatabaseUnitOfWork,
  IGenericDatabaseClient,
} from '@/core/db'
import { BookingService, bookingError } from '../booking/service'
import { SocialService } from '../social/service'
import {
  makePlan,
  orderedNodes,
  selectedPlan,
  validatePlan,
  type Plan,
} from '../dependencies/rules'
export const PackageSelection = z
  .object({
    promotionId: z.number().int().positive().optional(),
    purchaseId: z.number().int().positive().optional(),
  })
  .refine((d) => !!d.promotionId !== !!d.purchaseId, 'Choose one package.')
export const PackageReservation = PackageSelection.safeExtend({
  expectedPlan: z.string().length(64),
  requestKey: z.uuid(),
  appointments: z
    .array(
      z.object({
        key: z.string().max(60),
        employeeId: z.number().int().positive(),
        startsAt: z.iso.datetime({ offset: true }),
        expectedTotal: z.number().nonnegative().optional(),
        expectedDeposit: z.number().nonnegative().optional(),
        expectedDeadline: z.string().optional(),
        expectedInstructions: z.string().optional(),
      }),
    )
    .min(1)
    .max(40),
})
type Account = { id: number; customerId: number }
type Selection = z.infer<typeof PackageSelection>
const hash = (v: unknown) =>
  createHash('sha256').update(JSON.stringify(v)).digest('hex')
export class PackageBookingService {
  booking: BookingService
  social: SocialService
  constructor(
    private db: IDatabaseService,
    private work: IDatabaseUnitOfWork,
  ) {
    this.booking = new BookingService(db, work)
    this.social = new SocialService(db, work)
  }
  async context(c: IGenericDatabaseClient, a: Account, d: Selection) {
    let plan: Plan,
      terms: any,
      uses: any[] = []
    if (d.purchaseId) {
      const p = (
        await c.query(
          'SELECT * FROM package_purchases WHERE id=$1 AND account_id=$2 AND customer_id=$3',
          [d.purchaseId, a.id, a.customerId],
        )
      ).rows[0]
      if (!p) bookingError('Package not found.', 404)
      if (p.valid_until <= new Date())
        bookingError('Package validity has ended.', 409)
      uses = (
        await c.query(
          'SELECT * FROM package_uses WHERE purchase_id=$1 ORDER BY id',
          [p.id],
        )
      ).rows
      plan = p.booking_plan ?? {
        nodes: uses.map((u: any) => ({
          key: u.plan_key,
          treatmentId: u.treatment_id,
          name: u.treatment_name,
          durationMinutes: u.duration_minutes,
          price: Number(u.price),
          chargedPrice: Number(u.price),
          included: true,
          blocked: null as string | null,
        })),
        rules: [],
        promotionId: p.promotion_id,
        rootIds: uses.map((u) => u.treatment_id),
        separate: [],
        signature: '',
      }
      terms = {
        id: p.id,
        title: p.title,
        conditions: p.conditions,
        price: Number(p.price),
        validUntil: p.valid_until.toISOString(),
        minimumPaymentPercent:
          p.minimum_payment_percent === null
            ? null
            : Number(p.minimum_payment_percent),
      }
    } else {
      const p = (
        await c.query(
          "SELECT * FROM promotions WHERE id=$1 AND active AND (now() AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN starts_on AND ends_on FOR SHARE",
          [d.promotionId],
        )
      ).rows[0]
      if (!p || p.minimum_payment_percent === null)
        bookingError(
          'Package is unavailable until its payment condition is configured.',
          409,
        )
      plan = await makePlan(c, [], p.id)
      terms = {
        title: p.title,
        description: p.description,
        conditions: p.conditions,
        price: Number(p.price),
        validUntil: (await this.social.validUntil(c)).toISOString(),
        minimumPaymentPercent: Number(p.minimum_payment_percent),
      }
    }
    // Keep the purchased rules/names/durations/prices, but availability is always current.
    const active = (
      await c.query(
        `SELECT t.id,t.price::float AS price,t.duration_minutes AS duration,t.is_active AS active,EXISTS(SELECT 1 FROM employee_salon_treatments et JOIN employees e ON e.id=et.employee_id JOIN app_users u ON u.id=e.user_id WHERE et.treatment_id=t.id AND e.is_active AND u.is_active AND u.removed_at IS NULL AND EXISTS(SELECT 1 FROM employee_booking_hours h WHERE h.employee_id=e.id)) AS available FROM salon_treatments t WHERE t.id=ANY($1::int[])`,
        [plan.nodes.map((n) => n.treatmentId)],
      )
    ).rows
    plan = {
      ...plan,
      nodes: plan.nodes.map((n) => {
        const t = active.find((t: any) => t.id === n.treatmentId)
        return {
          ...n,
          ...(!n.included && t
            ? {
                price: t.price,
                chargedPrice: t.price,
                durationMinutes: t.duration,
              }
            : {}),
          blocked: !t?.active
            ? 'Required service is inactive.'
            : !t.available
              ? 'No qualified professional has working hours for this service.'
              : null,
        }
      }),
    }
    plan.nodes = orderedNodes(plan)
    const available = uses.length
      ? uses.filter((u) => u.state === 'available').map((u) => u.plan_key)
      : plan.nodes.filter((n) => n.included).map((n) => n.key)
    const signature = hash({ plan, terms, available })
    return { plan, terms, uses, available, signature }
  }
  async preview(a: Account, d: Selection) {
    const c = await this.db.getClient()
    try {
      const x = await this.context(c, a, d)
      return {
        terms: x.terms,
        available: x.available,
        plan: {
          ...x.plan,
          signature: x.signature,
          nodes: x.plan.nodes.map((n) => ({
            ...n,
            price: n.included ? 0 : n.price,
            chargedPrice: n.included ? 0 : n.chargedPrice,
          })),
        },
      }
    } finally {
      c.release()
    }
  }
  async reserve(a: Account, d: z.infer<typeof PackageReservation>) {
    const fingerprint = hash({ ...d, requestKey: undefined })
    try {
      return await this.work.transaction(async (c) => {
        await c.query('SELECT pg_advisory_xact_lock_shared(70440,1)', [])
        await c.query('SELECT pg_advisory_xact_lock(70422,$1)', [a.id])
        const replay = (
          await c.query(
            'SELECT fingerprint,group_id FROM package_reservations WHERE account_id=$1 AND request_key=$2',
            [a.id, d.requestKey],
          )
        ).rows[0]
        if (replay) {
          if (replay.fingerprint !== fingerprint)
            bookingError('Request key already used.', 409)
          return this.result(c, replay.group_id)
        }
        // Same ordering as staff reschedules: professionals, package, then orders.
        for (const id of [
          ...new Set(d.appointments.map((a) => a.employeeId)),
        ].sort((a, b) => a - b))
          await c.query('SELECT pg_advisory_xact_lock(70421,$1)', [id])
        if (d.purchaseId)
          await c.query(
            'SELECT id FROM package_purchases WHERE id=$1 AND account_id=$2 FOR UPDATE',
            [d.purchaseId, a.id],
          )
        const x = await this.context(c, a, d)
        if (x.signature !== d.expectedPlan)
          bookingError(
            'Package balance or conditions changed. Review your selection.',
            409,
          )
        const plan = selectedPlan(
          x.plan,
          d.appointments.map((a) => a.key),
        )
        if (
          !plan.nodes.some((n) => n.included) ||
          plan.nodes.some((n) => n.included && !x.available.includes(n.key))
        )
          bookingError('A selected utilization is no longer available.', 409)
        if ((d.purchaseId ? plan : x.plan).nodes.some((n) => n.blocked))
          bookingError(
            'A required procedure is inactive or has no qualified professional.',
            409,
          )
        for (const id of [
          ...new Set(d.appointments.map((a) => a.employeeId)),
        ].sort((a, b) => a - b))
          await c.query('SELECT pg_advisory_xact_lock(70421,$1)', [id])
        await this.booking.expire(c)
        const choices = []
        for (const n of plan.nodes) {
          const choice = d.appointments.find((a) => a.key === n.key)!
          const quote = await this.booking.quote(
            choice.employeeId,
            [n.treatmentId],
            choice.startsAt,
            c,
            undefined,
            { duration: n.durationMinutes, noDeposit: n.included },
          )
          if (n.included && quote.endsAt > new Date(x.terms.validUntil))
            bookingError(
              'Appointment must finish within package validity.',
              409,
            )
          choices.push({ ...choice, endsAt: quote.endsAt, quote })
        }
        validatePlan(plan, choices)
        if (
          (
            await c.query(
              `SELECT 1 FROM salon_schedules s WHERE customer_id=$1 AND status<>'cancelled' AND EXISTS(SELECT 1 FROM jsonb_to_recordset($2::jsonb) AS a("startsAt" timestamptz,"endsAt" timestamptz) WHERE s.schedule_started_at<a."endsAt" AND s.schedule_ended_at>a."startsAt") LIMIT 1`,
              [a.customerId, JSON.stringify(choices)],
            )
          ).rows.length
        )
          bookingError('You already have an appointment in this period.', 409)
        let purchaseId = d.purchaseId
        if (!purchaseId) {
          purchaseId = (
            await c.query(
              'INSERT INTO package_purchases(customer_id,account_id,promotion_id,title,conditions,price,valid_until,request_key,fingerprint,minimum_payment_percent,booking_plan) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',
              [
                a.customerId,
                a.id,
                d.promotionId,
                x.terms.title,
                x.terms.conditions,
                x.terms.price,
                x.terms.validUntil,
                d.requestKey,
                fingerprint,
                x.terms.minimumPaymentPercent,
                JSON.stringify(x.plan),
              ],
            )
          ).rows[0].id
          for (const n of x.plan.nodes.filter((n) => n.included))
            await c.query(
              "INSERT INTO package_uses(purchase_id,treatment_id,treatment_name,duration_minutes,price,state,plan_key) VALUES($1,$2,$3,$4,$5,'available',$6)",
              [
                purchaseId,
                n.treatmentId,
                n.name,
                n.durationMinutes,
                n.chargedPrice,
                n.key,
              ],
            )
        }
        const group = (
          await c.query(
            'INSERT INTO booking_groups(account_id,request_key,fingerprint,plan,package_purchase_id) VALUES($1,$2,$3,$4,$5) RETURNING id',
            [a.id, d.requestKey, fingerprint, JSON.stringify(plan), purchaseId],
          )
        ).rows[0]
        for (const n of plan.nodes) {
          const choice = choices.find((a) => a.key === n.key)!
          let scheduleId: number
          if (n.included) {
            const use = (
              await c.query(
                "SELECT * FROM package_uses WHERE purchase_id=$1 AND plan_key=$2 AND state='available' FOR UPDATE",
                [purchaseId, n.key],
              )
            ).rows[0]
            if (!use) bookingError('Utilization already reserved.', 409)
            // Returned old uses retain their cancelled schedule and linked history; staff must regularize those sets.
            if (use.schedule_id)
              bookingError(
                'Ask the salon to reschedule this returned utilization.',
                409,
              )
            scheduleId = (
              await c.query(
                "INSERT INTO salon_schedules(customer_id,booking_account_id,schedule_started_at,schedule_ended_at,no_treatments,status,total_price,package_use_id,created_at) VALUES($1,$2,$3,$4,1,'confirmed',$5,$6,now()) RETURNING id",
                [
                  a.customerId,
                  a.id,
                  choice.startsAt,
                  choice.endsAt,
                  use.price,
                  use.id,
                ],
              )
            ).rows[0].id
            await c.query(
              'INSERT INTO salon_schedule_treatments(employee_id,schedule_id,treatment_id,price,treatment_name,reserved_duration_minutes) VALUES($1,$2,$3,$4,$5,$6)',
              [
                choice.employeeId,
                scheduleId,
                n.treatmentId,
                use.price,
                use.treatment_name,
                use.duration_minutes,
              ],
            )
            await c.query(
              "UPDATE package_uses SET state='reserved',schedule_id=$2 WHERE id=$1",
              [use.id, scheduleId],
            )
            const transactions = (
              await c.query(
                'UPDATE salon_transactions SET order_id=$2 WHERE package_use_id=$1 AND order_id IS NULL RETURNING id',
                [use.id, scheduleId],
              )
            ).rows
            for (const tx of transactions)
              await c.query(
                'INSERT INTO salon_schedule_transactions(schedule_id,transaction_id,created_at) VALUES($1,$2,now())',
                [scheduleId, tx.id],
              )
          } else {
            const b = await this.booking.create(
              {
                ...choice,
                treatmentIds: [n.treatmentId],
                requestKey: randomUUID(),
                expectedTotal: choice.quote.total,
                expectedDeposit: choice.quote.deposit,
                expectedDeadline: choice.quote.deadline,
                expectedInstructions: choice.quote.instructions,
              },
              a,
              undefined,
              c,
              true,
            )
            scheduleId = b.id
          }
          await c.query(
            'INSERT INTO booking_group_members(group_id,node_key,schedule_id) VALUES($1,$2,$3)',
            [group.id, n.key, scheduleId],
          )
        }
        await c.query(
          'INSERT INTO package_reservations(purchase_id,account_id,group_id,request_key,fingerprint) VALUES($1,$2,$3,$4,$5)',
          [purchaseId, a.id, group.id, d.requestKey, fingerprint],
        )
        return this.result(c, group.id)
      })
    } catch (e) {
      if ((e as any).code === '23505')
        bookingError(
          'A request key or utilization was already used. Refresh your package balance.',
          409,
        )
      if ((e as any).code === '23P01')
        bookingError(
          'A selected time became unavailable. No partial reservations were kept.',
          409,
        )
      throw e
    }
  }
  async result(c: IGenericDatabaseClient, id: number) {
    const group = (
      await c.query(
        'SELECT package_purchase_id FROM booking_groups WHERE id=$1',
        [id],
      )
    ).rows[0]
    const rows = (
      await c.query(
        'SELECT m.node_key AS key,s.schedule_started_at AS "startsAt",s.schedule_ended_at AS "endsAt",s.package_use_id IS NOT NULL AS included,st.treatment_name AS name,p.name AS "employeeName",CASE WHEN s.package_use_id IS NULL THEN s.total_price::float ELSE NULL END AS price,s.deposit_required::float AS deposit,s.deposit_due_at AS deadline FROM booking_group_members m JOIN salon_schedules s ON s.id=m.schedule_id JOIN salon_schedule_treatments st ON st.schedule_id=s.id JOIN employees e ON e.id=st.employee_id JOIN persons p ON p.id=e.person_id WHERE m.group_id=$1 ORDER BY s.schedule_started_at',
        [id],
      )
    ).rows
    const packageInfo = (
      await c.query(
        `SELECT title,price::float AS price,minimum_payment_percent::float AS "minimumPaymentPercent",(ceil(price*minimum_payment_percent)/100)::float AS "minimumPayment",valid_until AS "validUntil" FROM package_purchases WHERE id=$1`,
        [group.package_purchase_id],
      )
    ).rows[0]
    return {
      purchaseId: group.package_purchase_id,
      package: packageInfo,
      appointments: rows,
    }
  }
}
