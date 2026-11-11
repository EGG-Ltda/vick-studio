import z from 'zod'
import { createHash, randomUUID } from 'crypto'
import type {
  IDatabaseService,
  IDatabaseUnitOfWork,
  IGenericDatabaseClient,
} from '@/core/db'
import type { AppUser } from '@/core/user'
import { salonWide } from '@/core/access'
import { BookingService } from '../booking/service'
import { BookingSchema } from '../booking/schemas'
import { SocialService } from '../social/service'
import {
  makePlan,
  validatePlan,
  invalid,
  linkedPlan,
  SeparateSchema,
  type Plan,
} from './rules'
export const PlanQuery = z
  .object({
    separate: SeparateSchema,
    rootIds: z.array(z.number().int().positive()).max(10).default([]),
    promotionId: z.number().int().positive().optional(),
  })
  .refine(
    (d) =>
      d.promotionId
        ? d.rootIds.length === 0
        : d.rootIds.length > 0 && new Set(d.rootIds).size === d.rootIds.length,
    'Select distinct services or one package',
  )
export const GroupSchema = z
  .object({
    separate: SeparateSchema,
    rootIds: z.array(z.number().int().positive()).max(10).default([]),
    promotionId: z.number().int().positive().optional(),
    expectedPlan: z.string().length(64),
    requestKey: z.uuid(),
    customerId: z.number().int().positive().optional(),
    packageConditions: z
      .object({
        expectedPrice: z.number().positive(),
        expectedConditions: z.string(),
        expectedValidUntil: z.iso.datetime({ offset: true }),
      })
      .optional(),
    appointments: z
      .array(
        BookingSchema.omit({ treatmentIds: true, requestKey: true }).extend({
          key: z.string().max(60),
          depositDeadline: z.iso.datetime({ offset: true }).optional(),
        }),
      )
      .min(1)
      .max(40),
  })
  .refine(
    (d) =>
      d.promotionId
        ? d.rootIds.length === 0 && !!d.packageConditions
        : d.rootIds.length > 0 && new Set(d.rootIds).size === d.rootIds.length,
    'Invalid service selection',
  )
export class DependencyService {
  booking: BookingService
  social: SocialService
  constructor(
    private db: IDatabaseService,
    private work: IDatabaseUnitOfWork,
  ) {
    this.booking = new BookingService(db, work)
    this.social = new SocialService(db, work)
  }
  async plan(
    roots: number[],
    promotionId?: number,
    separate: z.infer<typeof SeparateSchema> = [],
  ) {
    const c = await this.db.getClient()
    try {
      return await makePlan(c, roots, promotionId, separate)
    } finally {
      c.release()
    }
  }
  async result(c: IGenericDatabaseClient, id: number) {
    const group = (
      await c.query(
        'SELECT id,package_purchase_id AS "packagePurchaseId" FROM booking_groups WHERE id=$1',
        [id],
      )
    ).rows[0]
    const members = (
      await c.query(
        'SELECT node_key,schedule_id FROM booking_group_members WHERE group_id=$1 ORDER BY node_key',
        [id],
      )
    ).rows
    const bookings = []
    for (const m of members) {
      const { employeeUserId, ...b } = await this.booking.get(m.schedule_id, c)
      bookings.push({ ...b, key: m.node_key, groupId: id })
    }
    return { ...group, bookings }
  }
  async create(
    account: { id: number; customerId: number },
    data: z.infer<typeof GroupSchema>,
    actor?: AppUser,
  ) {
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ ...data, requestKey: undefined }))
      .digest('hex')
    try {
      return await this.work.transaction(async (c) => {
        await c.query('SELECT pg_advisory_xact_lock_shared(70440,1)', [])
        await c.query('SELECT pg_advisory_xact_lock(70422,$1)', [account.id])
        const old = (
          await c.query(
            'SELECT id,fingerprint FROM booking_groups WHERE account_id=$1 AND request_key=$2',
            [account.id, data.requestKey],
          )
        ).rows[0]
        if (old) {
          if (old.fingerprint !== fingerprint)
            invalid(
              'Request key already used for a different linked booking.',
              409,
            )
          return this.result(c, old.id)
        }
        const plan = await makePlan(
          c,
          data.rootIds,
          data.promotionId,
          data.separate,
        )
        if (plan.signature !== data.expectedPlan)
          invalid(
            'Service dependencies or prices changed. Review all appointments again.',
            409,
          )
        const blocked = plan.nodes.find((n) => n.blocked)
        if (blocked) invalid(`${blocked.name}: ${blocked.blocked}`, 409)
        if (
          new Set(data.appointments.map((a) => a.key)).size !==
            plan.nodes.length ||
          plan.nodes.some(
            (n) => !data.appointments.some((a) => a.key === n.key),
          )
        )
          invalid('Schedule every required procedure exactly once.')
        if (actor && !salonWide(actor)) {
          const ids = [...new Set(data.appointments.map((a) => a.employeeId))]
          if (
            (
              await c.query(
                'SELECT id FROM employees WHERE id=ANY($1::int[]) AND user_id=$2 AND is_active',
                [ids, actor.id],
              )
            ).rows.length !== ids.length
          )
            invalid('Only administrators may book other professionals.', 403)
        }
        if (!actor && data.appointments.some((a) => a.depositDeadline))
          invalid('Only the salon can set a custom deposit deadline.', 403)
        if (actor && data.appointments.some((a) => !a.depositDeadline))
          invalid('Choose a specific deposit deadline for every appointment.')
        for (const id of [
          ...new Set(data.appointments.map((a) => a.employeeId)),
        ].sort((a, b) => a - b))
          await c.query('SELECT pg_advisory_xact_lock(70421,$1)', [id])
        await this.booking.expire(c)
        const choices = []
        for (const n of plan.nodes) {
          const a = data.appointments.find((a) => a.key === n.key)!
          const quote = await this.booking.quote(
            a.employeeId,
            [n.treatmentId],
            a.startsAt,
            c,
            a.depositDeadline,
          )
          choices.push({ ...a, endsAt: quote.endsAt })
        }
        validatePlan(plan, choices)
        if (
          (
            await c.query(
              `SELECT 1 FROM salon_schedules s WHERE s.customer_id=$1 AND s.status<>'cancelled' AND EXISTS(SELECT 1 FROM jsonb_to_recordset($2::jsonb) AS a("startsAt" timestamptz,"endsAt" timestamptz) WHERE s.schedule_started_at<a."endsAt" AND s.schedule_ended_at>a."startsAt") LIMIT 1`,
              [account.customerId, JSON.stringify(choices)],
            )
          ).rows.length
        )
          invalid(
            'The customer already has an appointment in one of these intervals.',
            409,
          )
        let purchaseId: number | null = null
        if (data.promotionId) {
          const purchase = await this.social.acquire(
            account,
            {
              promotionId: data.promotionId,
              requestKey: data.requestKey,
              ...data.packageConditions!,
              appointments: plan.nodes
                .filter((n) => n.included)
                .map((n) => {
                  const a = data.appointments.find((a) => a.key === n.key)!
                  return {
                    treatmentId: n.treatmentId,
                    employeeId: a.employeeId,
                    startsAt: a.startsAt,
                  }
                }),
            },
            c,
            true,
          )
          purchaseId = purchase.id
        }
        const group = (
          await c.query(
            'INSERT INTO booking_groups(account_id,request_key,fingerprint,plan,package_purchase_id) VALUES($1,$2,$3,$4::jsonb,$5) RETURNING id',
            [
              account.id,
              data.requestKey,
              fingerprint,
              JSON.stringify(plan),
              purchaseId,
            ],
          )
        ).rows[0]
        const packageMembers = purchaseId
          ? (
              await c.query(
                'SELECT u.schedule_id FROM package_uses u WHERE u.purchase_id=$1 ORDER BY u.id',
                [purchaseId],
              )
            ).rows
          : []
        let packageIndex = 0
        for (const n of plan.nodes) {
          const a = data.appointments.find((a) => a.key === n.key)!
          const booking = n.included
            ? { id: packageMembers[packageIndex++].schedule_id }
            : await this.booking.create(
                {
                  ...a,
                  treatmentIds: [n.treatmentId],
                  requestKey: randomUUID(),
                },
                account,
                a.depositDeadline,
                c,
                true,
              )
          await c.query(
            'INSERT INTO booking_group_members(group_id,node_key,schedule_id) VALUES($1,$2,$3)',
            [group.id, n.key, booking.id],
          )
        }
        return this.result(c, group.id)
      })
    } catch (e) {
      if ((e as { code?: string }).code === '23P01')
        invalid(
          'A selected time is no longer available. No partial reservation was kept.',
          409,
        )
      throw e
    }
  }
  async detail(c: IGenericDatabaseClient, id: number, actor?: AppUser) {
    const linked = await linkedPlan(c, id)
    if (!linked) return null
    const wide = !actor || salonWide(actor)
    const own = (
      await c.query(
        'SELECT DISTINCT m.schedule_id FROM booking_group_members m JOIN salon_schedule_treatments st ON st.schedule_id=m.schedule_id JOIN employees e ON e.id=st.employee_id WHERE m.group_id=$1 AND e.user_id=$2',
        [linked.group.id, actor?.id ?? 0],
      )
    ).rows.map((r: any) => r.schedule_id)
    return {
      id: linked.group.id,
      rules: (linked.group.plan as Plan).rules,
      members: linked.members.map((m: any) => ({
        ...m,
        name: linked.group.plan.nodes.find((n: any) => n.key === m.key)?.name,
        canOpen: wide || own.includes(m.id),
      })),
      needsAttention: linked.members.some((m: any) => m.status === 'cancelled'),
    }
  }
}
