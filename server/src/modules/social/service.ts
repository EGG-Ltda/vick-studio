import { createHash, randomUUID } from 'crypto'
import {
  IDatabaseService,
  IDatabaseUnitOfWork,
  IGenericDatabaseClient,
} from '@/core/db'
import { AppUser } from '@/core/user'
import { salonWide, can } from '@/core/access'
import { BookingService, bookingError } from '../booking/service'
import { CustomerService } from '../customers/service'
import {
  AcquisitionSchema,
  ChangeSchema,
  PromotionSchema,
  allocate,
} from './schemas'
import { PaymentSchema, RefundSchema } from '../customers/schemas'
import z from 'zod'
const promotionSelect = `SELECT p.id,p.title,p.description,p.conditions,p.art_id::int AS "artId",p.alt_text AS "altText",p.starts_on::text AS "startsOn",p.ends_on::text AS "endsOn",p.active,p.price::float AS price,
 COALESCE((SELECT json_agg(json_build_object('treatmentId',i.treatment_id,'quantity',i.quantity,'name',t.name,'durationMinutes',t.duration_minutes,'price',t.price::float) ORDER BY i.treatment_id) FROM promotion_items i JOIN salon_treatments t ON t.id=i.treatment_id WHERE i.promotion_id=p.id),'[]') AS items FROM promotions p`
export class SocialService {
  booking: BookingService
  customers: CustomerService
  constructor(
    private db: IDatabaseService,
    private work: IDatabaseUnitOfWork,
  ) {
    this.booking = new BookingService(db, work)
    this.customers = new CustomerService(db, work)
  }
  query(sql: string, params: unknown[] = []) {
    return this.booking.query(sql, params)
  }
  async birthdays(actor: AppUser, month: number, page: number) {
    await this.customers.access(actor)
    const rows = (
      await this.query(
        `SELECT c.id,p.name,p.born_at::text AS "birthDate",COALESCE(a.phone,c.contact_phone) AS phone,
   extract(day FROM p.born_at)=extract(day FROM now() AT TIME ZONE 'America/Sao_Paulo') AND extract(month FROM p.born_at)=extract(month FROM now() AT TIME ZONE 'America/Sao_Paulo') AS "isToday",count(*) OVER()::int AS total
   FROM customers c JOIN persons p ON p.id=c.person_id LEFT JOIN customer_accounts a ON a.customer_id=c.id
   WHERE extract(month FROM p.born_at)=$3 AND ($1::boolean OR EXISTS(SELECT 1 FROM salon_schedules s JOIN salon_schedule_treatments st ON st.schedule_id=s.id JOIN employees e ON e.id=st.employee_id WHERE s.customer_id=c.id AND e.user_id=$2 AND e.is_active))
   ORDER BY extract(day FROM p.born_at),p.name,c.id LIMIT 30 OFFSET $4`,
        [salonWide(actor), actor.id, month, page * 30],
      )
    ).rows
    return {
      items: rows.map(({ total, ...r }: Record<string, any>) => r),
      total: rows[0]?.total ?? 0,
      page,
      hasNext: (page + 1) * 30 < (rows[0]?.total ?? 0),
    }
  }
  async promotions(publicOnly = false) {
    return (
      await this.query(
        `${promotionSelect} WHERE (NOT $1::boolean OR (p.active AND (now() AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p.starts_on AND p.ends_on AND NOT EXISTS(SELECT 1 FROM promotion_items i JOIN salon_treatments t ON t.id=i.treatment_id WHERE i.promotion_id=p.id AND NOT t.is_active))) ORDER BY p.id DESC`,
        [publicOnly],
      )
    ).rows
  }
  async savePromotion(
    actor: AppUser,
    data: z.infer<typeof PromotionSchema>,
    id?: number,
  ) {
    if (!salonWide(actor)) bookingError('Administrator access required.', 403)
    return this.work.transaction(async (client) => {
      if (
        !(
          await client.query('SELECT id FROM promotion_art WHERE id=$1', [
            data.artId,
          ])
        ).rows.length
      )
        bookingError('Attach valid promotion artwork.')
      const treatments = (
        await client.query(
          'SELECT id FROM salon_treatments WHERE id=ANY($1::int[]) AND is_active FOR SHARE',
          [data.items.map((i) => i.treatmentId)],
        )
      ).rows
      if (treatments.length !== data.items.length)
        bookingError('Select active treatments.')
      const params = [
        data.title,
        data.description,
        data.conditions,
        data.artId,
        data.altText,
        data.startsOn,
        data.endsOn,
        data.active,
        data.price,
      ]
      const result = id
        ? await client.query(
            'UPDATE promotions SET title=$1,description=$2,conditions=$3,art_id=$4,alt_text=$5,starts_on=$6,ends_on=$7,active=$8,price=$9,updated_at=now() WHERE id=$10 RETURNING id',
            [...params, id],
          )
        : await client.query(
            'INSERT INTO promotions(title,description,conditions,art_id,alt_text,starts_on,ends_on,active,price,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
            [...params, actor.id],
          )
      if (!result.rows[0]) bookingError('Promotion not found.', 404)
      id = result.rows[0].id
      await client.query('DELETE FROM promotion_items WHERE promotion_id=$1', [
        id,
      ])
      for (const item of data.items)
        await client.query(
          'INSERT INTO promotion_items(promotion_id,treatment_id,quantity) VALUES($1,$2,$3)',
          [id, item.treatmentId, item.quantity],
        )
      return { id }
    })
  }
  async validUntil(client?: IGenericDatabaseClient) {
    const sql = `SELECT (((now() AT TIME ZONE 'America/Sao_Paulo')::date+make_interval(months=>package_validity_months)+interval '1 day') AT TIME ZONE 'America/Sao_Paulo')-interval '1 millisecond' AS deadline FROM booking_settings WHERE id=true`
    return (client ? await client.query(sql, []) : await this.query(sql))
      .rows[0].deadline
  }
  async acquire(
    account: { id: number; customerId: number },
    data: z.infer<typeof AcquisitionSchema>,
  ) {
    const ends: string[] = []
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ ...data, requestKey: undefined }))
      .digest('hex')
    try {
      return await this.work.transaction(async (client) => {
        await client.query('SELECT pg_advisory_xact_lock(70422,$1)', [
          account.id,
        ])
        const existing = (
          await client.query(
            'SELECT id,fingerprint FROM package_purchases WHERE account_id=$1 AND request_key=$2',
            [account.id, data.requestKey],
          )
        ).rows[0]
        if (existing) {
          if (existing.fingerprint !== fingerprint)
            bookingError('Request key already used.', 409)
          return { id: existing.id }
        }
        const p = (
          await client.query(
            `${promotionSelect} WHERE p.id=$1 AND p.active AND (now() AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p.starts_on AND p.ends_on FOR SHARE OF p`,
            [data.promotionId],
          )
        ).rows[0]
        if (!p) bookingError('Promotion is unavailable.', 409)
        const validUntil = await this.validUntil(client)
        if (
          p.price !== data.expectedPrice ||
          p.conditions !== data.expectedConditions ||
          new Date(data.expectedValidUntil).getTime() !== validUntil.getTime()
        )
          bookingError(
            'Package conditions changed. Review the package again.',
            409,
          )
        const required: number[] = p.items.flatMap(
          (i: { quantity: number; treatmentId: number }) =>
            Array(i.quantity).fill(i.treatmentId),
        )
        if (
          JSON.stringify(required.sort((a, b) => a - b)) !==
          JSON.stringify(
            data.appointments.map((a) => a.treatmentId).sort((a, b) => a - b),
          )
        )
          bookingError('Schedule every package procedure exactly once.')
        const employeeIds = [
          ...new Set(data.appointments.map((a) => a.employeeId)),
        ].sort((a, b) => a - b)
        for (const id of employeeIds)
          await client.query('SELECT pg_advisory_xact_lock(70421,$1)', [id])
        await this.booking.expire(client)
        const purchase = (
          await client.query(
            'INSERT INTO package_purchases(customer_id,account_id,promotion_id,title,conditions,price,valid_until,request_key,fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
            [
              account.customerId,
              account.id,
              p.id,
              p.title,
              p.conditions,
              p.price,
              validUntil,
              data.requestKey,
              fingerprint,
            ],
          )
        ).rows[0]
        const weights = data.appointments.map((a) =>
          Math.round(
            p.items.find(
              (i: { treatmentId: number }) => i.treatmentId === a.treatmentId,
            ).price * 100,
          ),
        )
        const prices = allocate(Math.round(p.price * 100), weights)
        for (const [index, a] of data.appointments.entries()) {
          const quote = await this.booking.quote(
            a.employeeId,
            [a.treatmentId],
            a.startsAt,
            client,
          )
          if (quote.endsAt > validUntil)
            bookingError(
              'Every appointment must finish within the package validity.',
              409,
            )
          // Prevent overlapping appointments for this customer, even across different professionals.
          const overlap = data.appointments
            .slice(0, index)
            .some(
              (other, j) =>
                new Date(other.startsAt) < quote.endsAt &&
                new Date(a.startsAt) < new Date(ends[j]),
            )
          if (overlap) bookingError('Package appointments cannot overlap.', 409)
          ends.push(quote.endsAt.toISOString())
          const use = (
            await client.query(
              'INSERT INTO package_uses(purchase_id,treatment_id,treatment_name,duration_minutes,price) VALUES($1,$2,$3,$4,$5) RETURNING id',
              [
                purchase.id,
                a.treatmentId,
                quote.treatments[0].name,
                quote.duration,
                prices[index] / 100,
              ],
            )
          ).rows[0]
          const schedule = (
            await client.query(
              `INSERT INTO salon_schedules(customer_id,schedule_started_at,schedule_ended_at,no_treatments,status,booking_account_id,total_price,package_use_id,created_at) VALUES($1,$2,$3,1,'confirmed',$4,$5,$6,now()) RETURNING id`,
              [
                account.customerId,
                a.startsAt,
                quote.endsAt,
                account.id,
                prices[index] / 100,
                use.id,
              ],
            )
          ).rows[0]
          await client.query(
            'INSERT INTO salon_schedule_treatments(employee_id,schedule_id,treatment_id,price) VALUES($1,$2,$3,$4)',
            [a.employeeId, schedule.id, a.treatmentId, prices[index] / 100],
          )
          await client.query(
            'UPDATE package_uses SET schedule_id=$1 WHERE id=$2',
            [schedule.id, use.id],
          )
        }
        return { id: purchase.id }
      })
    } catch (error) {
      if ((error as { code?: string }).code === '23P01')
        bookingError(
          'A selected time is no longer available. Select all times again.',
          409,
        )
      throw error
    }
  }
  async purchases(
    customerId: number,
    actor?: AppUser,
    financialOverride = false,
  ) {
    if (actor) await this.customers.authorizeCustomer(actor, customerId)
    const admin = !actor || salonWide(actor)
    const financial =
      !actor ||
      can(actor, financialOverride ? 'finance.view' : 'clients.financial')
    return (
      await this.query(
        `SELECT p.id,p.title,p.conditions,p.price::float AS price,p.acquired_at AS "acquiredAt",p.valid_until AS "validUntil",p.valid_until<now() AS expired,
   (SELECT COALESCE(sum(CASE WHEN kind='refund' THEN -amount ELSE amount END),0)::float FROM package_receipts WHERE purchase_id=p.id) AS "totalPaid",
   (SELECT json_agg(json_build_object('id',u.id,'scheduleId',s.id,'name',u.treatment_name,'price',u.price::float,'state',CASE WHEN u.state<>'completed' AND p.valid_until<now() THEN 'expired' ELSE u.state END,'status',s.status,'startsAt',s.schedule_started_at,'endsAt',s.schedule_ended_at,'employeeId',e.id,'employeeName',ep.name) ORDER BY u.id) FROM package_uses u JOIN salon_schedules s ON s.id=u.schedule_id JOIN salon_schedule_treatments st ON st.schedule_id=s.id JOIN employees e ON e.id=st.employee_id JOIN persons ep ON ep.id=e.person_id WHERE u.purchase_id=p.id AND ($2::boolean OR (e.user_id=$3 AND e.is_active))) AS uses,
   CASE WHEN $2::boolean THEN (SELECT json_agg(json_build_object('id',r.id,'kind',r.kind,'amount',r.amount::float,'description',r.description,'createdAt',r.created_at,'refundOf',r.refund_of,'method',m.name) ORDER BY r.id) FROM package_receipts r JOIN payment_methods m ON m.id=r.method_id WHERE r.purchase_id=p.id) ELSE '[]'::json END AS receipts
   FROM package_purchases p WHERE p.customer_id=$1 AND ($2::boolean OR EXISTS(SELECT 1 FROM package_uses u JOIN salon_schedule_treatments st ON st.schedule_id=u.schedule_id JOIN employees e ON e.id=st.employee_id WHERE u.purchase_id=p.id AND e.user_id=$3 AND e.is_active)) ORDER BY p.id DESC LIMIT 100`,
        [customerId, admin, actor?.id ?? 0],
      )
    ).rows.map((p: any) =>
      admin
        ? {
            ...p,
            canViewFinancial: financial,
            totalPaid: financial ? p.totalPaid : null,
            receipts: financial ? p.receipts : [],
          }
        : {
            ...p,
            canViewFinancial: false,
            totalPaid: null,
            price: null,
            conditions: null,
          },
    )
  }
  async receipt(
    actor: AppUser,
    id: number,
    data: z.infer<typeof PaymentSchema> | z.infer<typeof RefundSchema>,
    refundOf?: number,
  ) {
    if (!salonWide(actor))
      bookingError('Administrator access required for package receipts.', 403)
    return this.work.transaction(async (client) => {
      const purchase = (
        await client.query(
          'SELECT * FROM package_purchases WHERE id=$1 FOR UPDATE',
          [id],
        )
      ).rows[0]
      if (!purchase) bookingError('Package not found.', 404)
      const kind = refundOf ? 'refund' : 'payment',
        description = 'reason' in data ? data.reason : data.description
      const old = (
        await client.query(
          'SELECT * FROM package_receipts WHERE purchase_id=$1 AND request_key=$2',
          [id, data.requestKey],
        )
      ).rows[0]
      if (old) {
        if (
          old.kind !== kind ||
          Number(old.amount) !== data.amount ||
          old.description !== description ||
          (old.refund_of ?? undefined) !== refundOf ||
          ('methodId' in data && old.method_id !== data.methodId)
        )
          bookingError('Request key already used.', 409)
        return { id: old.id }
      }
      const cents = Math.round(data.amount * 100)
      let source: any,
        weights: number[],
        orders: number[],
        sources: number[] = []
      if (refundOf) {
        source = (
          await client.query(
            `SELECT r.*,r.amount-(SELECT COALESCE(sum(amount),0) FROM package_receipts WHERE refund_of=r.id) AS available FROM package_receipts r WHERE r.id=$1 AND r.purchase_id=$2 AND r.kind='payment'`,
            [refundOf, id],
          )
        ).rows[0]
        if (!source || cents > Math.round(Number(source.available) * 100))
          bookingError('Refund exceeds the original unrefunded payment.', 409)
        const rows = (
          await client.query(
            `SELECT t.id,t.order_id,t.value-(SELECT COALESCE(sum(value),0) FROM salon_transactions WHERE refund_of=t.id) AS remaining FROM salon_transactions t WHERE package_receipt_id=$1 ORDER BY t.order_id`,
            [refundOf],
          )
        ).rows
        weights = rows.map((r: any) => Math.round(Number(r.remaining) * 100))
        orders = rows.map((r: any) => r.order_id)
        sources = rows.map((r: any) => r.id)
      } else {
        const paid = Number(
          (
            await client.query(
              `SELECT COALESCE(sum(CASE WHEN kind='refund' THEN -amount ELSE amount END),0) AS total FROM package_receipts WHERE purchase_id=$1`,
              [id],
            )
          ).rows[0].total,
        )
        if (cents > Math.round((Number(purchase.price) - paid) * 100))
          bookingError('Payment exceeds package balance.', 409)
        const rows = (
          await client.query(
            `SELECT u.schedule_id,u.price-(SELECT COALESCE(sum(CASE WHEN ledger_kind='refund' THEN -value ELSE value END),0) FROM salon_transactions WHERE order_id=u.schedule_id AND package_receipt_id IS NOT NULL) AS remaining FROM package_uses u WHERE purchase_id=$1 ORDER BY u.schedule_id`,
            [id],
          )
        ).rows
        weights = rows.map((r: any) => Math.round(Number(r.remaining) * 100))
        orders = rows.map((r: any) => r.schedule_id)
      }
      const method =
        source?.method_id ?? ('methodId' in data ? data.methodId : 0)
      if (
        !(
          await client.query(
            'SELECT id FROM payment_methods WHERE id=$1 AND removed_at IS NULL',
            [method],
          )
        ).rows.length
      )
        bookingError('Invalid payment method.')
      // Same ordering as other package operations; headers serialize concurrent payment/refund requests.
      await client.query(
        'SELECT id FROM salon_schedules WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE',
        [orders],
      )
      const r = (
        await client.query(
          'INSERT INTO package_receipts(purchase_id,amount,kind,method_id,description,refund_of,request_key,recorded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
          [
            id,
            data.amount,
            kind,
            method,
            description,
            refundOf ?? null,
            data.requestKey,
            actor.id,
          ],
        )
      ).rows[0]
      const amounts = allocate(cents, weights)
      for (const [i, amount] of amounts.entries())
        if (amount) {
          const tx = (
            await client.query(
              `INSERT INTO salon_transactions(method_id,type_id,is_debit,description,value,created_at,order_id,ledger_kind,refund_of,recorded_by,request_key,package_receipt_id) VALUES($1,(SELECT id FROM transaction_types WHERE name=$2),$3,$4,$5,now(),$6,$7,$8,$9,$10,$11) RETURNING id`,
              [
                method,
                refundOf ? 'Estorno de cliente' : 'Recebimento de cliente',
                !!refundOf,
                description,
                amount / 100,
                orders[i],
                kind,
                refundOf ? sources[i] : null,
                actor.id,
                randomUUID(),
                r.id,
              ],
            )
          ).rows[0]
          await client.query(
            'INSERT INTO salon_schedule_transactions(schedule_id,transaction_id,created_at) VALUES($1,$2,now())',
            [orders[i], tx.id],
          )
        }
      return r
    })
  }
  async rescheduleSlots(
    actor: AppUser,
    id: number,
    employeeId: number,
    date: string,
  ) {
    const row = await this.customers.authorizeOrder(actor, id)
    const treatments = (
      await this.query(
        'SELECT treatment_id,employee_id FROM salon_schedule_treatments WHERE schedule_id=$1',
        [id],
      )
    ).rows
    if (
      !salonWide(actor) &&
      !treatments.some(
        (t: { employee_id: number }) => t.employee_id === employeeId,
      )
    )
      bookingError(
        'Only an administrator can reassign another professional.',
        403,
      )
    const use = row.package_use_id
      ? (
          await this.query(
            'SELECT u.*,p.valid_until FROM package_uses u JOIN package_purchases p ON p.id=u.purchase_id WHERE u.id=$1',
            [row.package_use_id],
          )
        ).rows[0]
      : null
    const duration =
      use?.duration_minutes ??
      Math.round(
        (new Date(row.schedule_ended_at).getTime() -
          new Date(row.schedule_started_at).getTime()) /
          60000,
      )
    const slots = await this.booking.slots(
      employeeId,
      treatments.map((t: { treatment_id: number }) => t.treatment_id),
      date,
      undefined,
      { ignoreScheduleId: id, duration },
    )
    if (!use) return slots
    const others = (
      await this.query(
        `SELECT s.schedule_started_at,s.schedule_ended_at FROM package_uses u JOIN salon_schedules s ON s.id=u.schedule_id WHERE u.purchase_id=$1 AND s.id<>$2 AND s.status<>'cancelled'`,
        [use.purchase_id, id],
      )
    ).rows
    return slots.filter(
      (slot) =>
        slot.endsAt <= use.valid_until &&
        !others.some(
          (s: { schedule_started_at: Date; schedule_ended_at: Date }) =>
            s.schedule_started_at < slot.endsAt &&
            s.schedule_ended_at > new Date(slot.startsAt),
        ),
    )
  }
  async change(actor: AppUser, id: number, data: z.infer<typeof ChangeSchema>) {
    try {
      return await this.work.transaction(async (client) => {
        const original = await this.customers.authorizeOrder(
          actor,
          id,
          client,
          false,
        )
        const oldEmployees = (
          await client.query(
            'SELECT employee_id FROM salon_schedule_treatments WHERE schedule_id=$1 ORDER BY employee_id',
            [id],
          )
        ).rows.map((r: any) => r.employee_id)
        for (const e of [
          ...new Set([
            ...oldEmployees,
            ...(data.employeeId ? [data.employeeId] : []),
          ]),
        ].sort((a, b) => a - b))
          await client.query('SELECT pg_advisory_xact_lock(70421,$1)', [e])
        if (original.package_use_id) {
          const p = (
            await client.query(
              'SELECT purchase_id FROM package_uses WHERE id=$1',
              [original.package_use_id],
            )
          ).rows[0]
          await client.query(
            'SELECT id FROM package_purchases WHERE id=$1 FOR UPDATE',
            [p.purchase_id],
          )
        }
        const row = await this.customers.authorizeOrder(
          actor,
          id,
          client,
          true,
          true,
        )
        const currentEmployees = (
          await client.query(
            'SELECT employee_id FROM salon_schedule_treatments WHERE schedule_id=$1 ORDER BY employee_id',
            [id],
          )
        ).rows.map((r: { employee_id: number }) => r.employee_id)
        if (JSON.stringify(currentEmployees) !== JSON.stringify(oldEmployees))
          bookingError('Appointment changed. Reload it before retrying.', 409)
        const old = (
          await client.query(
            `SELECT current_data FROM schedule_changes WHERE schedule_id=$1 AND current_data->>'requestKey'=$2`,
            [id, data.requestKey],
          )
        ).rows[0]
        if (old) {
          if (
            JSON.stringify(ChangeSchema.parse(old.current_data.request)) !==
            JSON.stringify(data)
          )
            bookingError('Request key already used.', 409)
          return { id }
        }
        if (row.status === 'completed')
          bookingError('Completed appointments cannot be changed.', 409)
        const use = row.package_use_id
          ? (
              await client.query(
                'SELECT u.*,p.valid_until FROM package_uses u JOIN package_purchases p ON p.id=u.purchase_id WHERE u.id=$1 FOR UPDATE OF u',
                [row.package_use_id],
              )
            ).rows[0]
          : null
        if (data.action === 'return_use') {
          if (
            !use ||
            row.status !== 'cancelled' ||
            !['cancelled', 'no_show'].includes(use.state) ||
            use.valid_until <= new Date()
          )
            bookingError(
              'Only cancelled, unexpired package utilizations can be returned.',
              409,
            )
          await client.query(
            "UPDATE package_uses SET state='available' WHERE id=$1",
            [use.id],
          )
        } else if (data.action === 'cancel' || data.action === 'no_show') {
          if (row.status === 'cancelled')
            bookingError('Appointment is already cancelled.', 409)
          if (data.action === 'no_show' && !row.has_started)
            bookingError('Cannot record a no-show before the appointment.', 409)
          await client.query(
            "UPDATE salon_schedules SET status='cancelled',cancelled_at=now(),cancellation_reason=$2,updated_at=now() WHERE id=$1",
            [id, (data.action === 'no_show' ? 'No-show: ' : '') + data.reason],
          )
          if (use)
            await client.query('UPDATE package_uses SET state=$2 WHERE id=$1', [
              use.id,
              data.action === 'no_show' ? 'no_show' : 'cancelled',
            ])
        } else {
          if (!data.startsAt || !data.employeeId)
            bookingError('Choose a new professional and time.')
          if (row.status === 'cancelled' && use && use.state !== 'available')
            bookingError(
              'Return the utilization explicitly before booking it again.',
              409,
            )
          if (!salonWide(actor) && !oldEmployees.includes(data.employeeId))
            bookingError(
              'Only an administrator can reassign another professional.',
              403,
            )
          const treatments = (
            await client.query(
              'SELECT treatment_id FROM salon_schedule_treatments WHERE schedule_id=$1 ORDER BY id',
              [id],
            )
          ).rows.map((r: any) => r.treatment_id)
          const duration =
            use?.duration_minutes ??
            Math.round(
              (new Date(row.schedule_ended_at).getTime() -
                new Date(row.schedule_started_at).getTime()) /
                60000,
            )
          const q = await this.booking.quote(
            data.employeeId,
            treatments,
            data.startsAt,
            client,
            undefined,
            { ignoreScheduleId: id, duration },
          )
          if (use && q.endsAt > use.valid_until)
            bookingError('Appointment exceeds package validity.', 409)
          if (
            use &&
            (
              await client.query(
                `SELECT 1 FROM package_uses u JOIN salon_schedules s ON s.id=u.schedule_id WHERE u.purchase_id=$1 AND s.id<>$2 AND s.status<>'cancelled' AND s.schedule_started_at<$4 AND s.schedule_ended_at>$3`,
                [use.purchase_id, id, data.startsAt, q.endsAt],
              )
            ).rows.length
          )
            bookingError('Package appointments cannot overlap.', 409)
          // Cancelled is temporary inside the transaction only; readers retain the original booking until commit.
          await client.query(
            "UPDATE salon_schedules SET status='cancelled' WHERE id=$1",
            [id],
          )
          await client.query(
            'UPDATE salon_schedule_treatments SET employee_id=$2 WHERE schedule_id=$1',
            [id, data.employeeId],
          )
          await client.query(
            "UPDATE salon_schedules SET schedule_started_at=$2,schedule_ended_at=$3,status=$4,cancelled_at=NULL,cancellation_reason=NULL,deposit_due_at=CASE WHEN $4='awaiting_deposit' THEN $5 ELSE deposit_due_at END,updated_at=now() WHERE id=$1",
            [
              id,
              data.startsAt,
              q.endsAt,
              row.status === 'cancelled'
                ? use ||
                  row.deposit_confirmed_at ||
                  row.deposit_required == null
                  ? 'confirmed'
                  : 'awaiting_deposit'
                : row.status,
              q.deadline,
            ],
          )
          if (use)
            await client.query(
              "UPDATE package_uses SET state='reserved' WHERE id=$1",
              [use.id],
            )
        }
        const current = (
          await client.query(
            'SELECT status,schedule_started_at,schedule_ended_at,cancellation_reason FROM salon_schedules WHERE id=$1',
            [id],
          )
        ).rows[0]
        await client.query(
          'INSERT INTO schedule_changes(schedule_id,actor_id,action,reason,previous_data,current_data) VALUES($1,$2,$3,$4,$5,$6)',
          [
            id,
            actor.id,
            data.action,
            data.reason,
            JSON.stringify({
              status: row.status,
              startsAt: row.schedule_started_at,
              endsAt: row.schedule_ended_at,
              employeeIds: oldEmployees,
              useState: use?.state,
              cancelledAt: row.cancelled_at,
              cancellationReason: row.cancellation_reason,
              depositDueAt: row.deposit_due_at,
            }),
            JSON.stringify({
              ...current,
              employeeId: data.employeeId,
              requestKey: data.requestKey,
              request: data,
            }),
          ],
        )
        return { id }
      })
    } catch (error) {
      if ((error as { code?: string }).code === '23P01')
        bookingError(
          'This time is no longer available. The original appointment was preserved.',
          409,
        )
      throw error
    }
  }
}
