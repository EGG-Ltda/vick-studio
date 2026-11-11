import {
  IDatabaseService,
  IDatabaseUnitOfWork,
  IGenericDatabaseClient,
} from '@/core/db'
import { AppUser } from '@/core/user'
import { canManagePasswords } from '@/shared/utils/user'
import { bookingError } from '../booking/service'
import {
  ConsumptionSchema,
  PaymentSchema,
  ProfileSchema,
  RefundSchema,
} from './schemas'
import z from 'zod'

const scope = `($1::boolean OR EXISTS(SELECT 1 FROM salon_schedule_treatments st JOIN employees e ON e.id=st.employee_id WHERE st.schedule_id=s.id AND e.user_id=$2 AND e.is_active))`
const profileSelect = `SELECT c.id,p.born_at::text AS "birthDate",p.name,p.cpf_cnpj AS cpf,COALESCE(a.email,c.contact_email) AS email,COALESCE(a.phone,c.contact_phone) AS phone,c.created_at AS "createdAt" FROM customers c JOIN persons p ON p.id=c.person_id LEFT JOIN customer_accounts a ON a.customer_id=c.id`
export class CustomerService {
  constructor(
    private db: IDatabaseService,
    private work: IDatabaseUnitOfWork,
  ) {}
  async query(sql: string, params: unknown[] = []) {
    const client = await this.db.getClient()
    try {
      return await client.query(sql, params)
    } finally {
      client.release()
    }
  }
  admin(actor: AppUser) {
    return canManagePasswords(actor)
  }
  async access(actor: AppUser) {
    const admin = this.admin(actor)
    if (
      !admin &&
      !(
        await this.query(
          'SELECT 1 FROM employees WHERE user_id=$1 AND is_active',
          [actor.id],
        )
      ).rows.length
    )
      bookingError('Salon staff access is required.', 403)
    return {
      canEdit: admin,
      canReadInternalNotes: admin,
      scope: admin ? 'all' : 'assigned',
    }
  }
  async authorizeCustomer(actor: AppUser, id: number) {
    await this.access(actor)
    const row = (
      await this.query(
        `${profileSelect} WHERE c.id=$3 AND ($1::boolean OR EXISTS(SELECT 1 FROM salon_schedules s WHERE s.customer_id=c.id AND ${scope}))`,
        [this.admin(actor), actor.id, id],
      )
    ).rows[0]
    if (!row) bookingError('Customer not found or not accessible.', 404)
    return row
  }
  async list(actor: AppUser, search: string, page: number) {
    await this.access(actor)
    const text = '%' + search.replace(/[\\%_]/g, '\\$&') + '%',
      digits = search.replace(/\D/g, '')
    const rows = (
      await this.query(
        `SELECT result.*,count(*) OVER()::int AS "totalCount" FROM (${profileSelect} WHERE
    ($1::boolean OR EXISTS(SELECT 1 FROM salon_schedules s WHERE s.customer_id=c.id AND ${scope}))
    AND ($3='' OR p.name ILIKE $4 OR COALESCE(a.email,c.contact_email,'') ILIKE $4 OR ($5<>'' AND (regexp_replace(p.cpf_cnpj,'[^0-9]','','g') LIKE '%'||$5||'%' OR regexp_replace(COALESCE(a.phone,c.contact_phone,''),'[^0-9]','','g') LIKE '%'||$5||'%')))) result ORDER BY lower(result.name),result.id LIMIT 20 OFFSET $6`,
        [this.admin(actor), actor.id, search, text, digits, page * 20],
      )
    ).rows
    const total = rows[0]?.totalCount ?? 0
    return {
      items: rows.map(({ totalCount, ...row }: Record<string, unknown>) => row),
      page,
      total,
      hasNext: (page + 1) * 20 < total,
    }
  }
  async detail(actor: AppUser, id: number) {
    const profile = await this.authorizeCustomer(actor, id)
    const summary = (
      await this.query(
        `SELECT
    (SELECT COALESCE(sum(CASE WHEN tx.ledger_kind='refund' THEN -abs(tx.value) ELSE abs(tx.value) END),0)::float FROM salon_transactions tx JOIN salon_schedules s ON s.id=tx.order_id WHERE s.customer_id=$3 AND tx.ledger_kind IS NOT NULL AND ${scope}) AS "totalPaid",
    max(s.completed_at) FILTER(WHERE s.status='completed') AS "lastCompletedAt",
    count(*) FILTER(WHERE s.status='completed')::int AS "completedCount",
    count(*) FILTER(WHERE s.schedule_started_at>=now() AND s.status<>'cancelled')::int AS "upcomingCount"
    FROM salon_schedules s WHERE s.customer_id=$3 AND ${scope}`,
        [this.admin(actor), actor.id, id],
      )
    ).rows[0]
    return {
      ...profile,
      ...summary,
      canEdit: this.admin(actor),
      canReadInternalNotes: this.admin(actor),
      historyScope: this.admin(actor) ? 'all' : 'assigned',
    }
  }
  async edit(actor: AppUser, id: number, data: z.infer<typeof ProfileSchema>) {
    if (!this.admin(actor))
      bookingError('Only ADMIN or MASTER can edit customer profiles.', 403)
    try {
      return await this.work.transaction(async (client) => {
        const current = (
          await client.query(
            `${profileSelect} WHERE c.id=$1 FOR UPDATE OF c,p`,
            [id],
          )
        ).rows[0]
        if (!current) bookingError('Customer not found.', 404)
        const duplicate = (
          await client.query(
            `SELECT 1 FROM persons WHERE regexp_replace(cpf_cnpj,'[^0-9]','','g')=$1 AND id<>(SELECT person_id FROM customers WHERE id=$2)`,
            [data.cpf, id],
          )
        ).rows.length
        if (duplicate) bookingError('CPF is already registered.', 409)
        const account = (
          await client.query(
            'SELECT id FROM customer_accounts WHERE customer_id=$1 FOR UPDATE',
            [id],
          )
        ).rows[0]
        if (account) {
          await client.query(
            'UPDATE customer_accounts SET email=$1,phone=$2 WHERE id=$3',
            [data.email, data.phone, account.id],
          )
          if (current.email !== data.email)
            await client.query(
              'DELETE FROM customer_sessions WHERE account_id=$1',
              [account.id],
            )
        }
        await client.query(
          'UPDATE persons SET name=$1,cpf_cnpj=$2,born_at=COALESCE($4::date,born_at),updated_at=now() WHERE id=(SELECT person_id FROM customers WHERE id=$3)',
          [data.name, data.cpf, id, data.birthDate ?? null],
        )
        await client.query(
          'UPDATE customers SET contact_email=$1,contact_phone=$2,updated_at=now() WHERE id=$3',
          [data.email, data.phone, id],
        )
        // Audit contains only the whitelisted profile fields, never authentication data.
        await client.query(
          'INSERT INTO customer_profile_changes(customer_id,changed_by,previous_data,current_data) VALUES($1,$2,$3,$4)',
          [id, actor.id, JSON.stringify(current), JSON.stringify(data)],
        )
        return { id }
      })
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        bookingError('CPF or email is already registered.', 409)
      throw error
    }
  }
  async history(actor: AppUser, id: number, view: string, page: number) {
    await this.authorizeCustomer(actor, id)
    const rows = (
      await this.query(
        `SELECT s.id,s.status,s.schedule_started_at AS "startsAt",s.schedule_ended_at AS "endsAt",s.completed_at AS "completedAt",s.cancelled_at AS "cancelledAt",s.cancellation_reason AS "cancellationReason",
    COALESCE(s.total_price,(SELECT sum(price) FROM salon_schedule_treatments WHERE schedule_id=s.id),0)::float AS "treatmentTotal",
    (SELECT COALESCE(sum(quantity*unit_price),0)::float FROM order_consumptions WHERE schedule_id=s.id AND voided_at IS NULL) AS "extrasTotal",
    (SELECT COALESCE(sum(CASE WHEN ledger_kind='refund' THEN -abs(value) ELSE abs(value) END),0)::float FROM salon_transactions WHERE order_id=s.id AND ledger_kind IS NOT NULL) AS "netPaid",
    (SELECT json_agg(json_build_object('name',st.treatment_name,'price',st.price::float,'employeeName',p.name,'employeeId',e.id)) FROM salon_schedule_treatments st JOIN employees e ON e.id=st.employee_id JOIN persons p ON p.id=e.person_id WHERE st.schedule_id=s.id) AS treatments,
    count(*) OVER()::int AS "totalCount"
    FROM salon_schedules s WHERE s.customer_id=$3 AND ${scope}
      AND ($4='all' OR ($4='upcoming' AND s.schedule_started_at>=now()) OR ($4='past' AND s.schedule_started_at<now()) OR ($4='completed' AND s.status='completed'))
    ORDER BY s.schedule_started_at DESC,s.id DESC LIMIT 20 OFFSET $5`,
        [this.admin(actor), actor.id, id, view, page * 20],
      )
    ).rows
    const total = rows[0]?.totalCount ?? 0
    return {
      items: rows.map(({ totalCount, ...row }: Record<string, unknown>) => row),
      page,
      total,
      hasNext: (page + 1) * 20 < total,
    }
  }
  async payments(actor: AppUser, id: number, page: number) {
    await this.authorizeCustomer(actor, id)
    const rows = (
      await this.query(
        `SELECT tx.id,tx.order_id AS "orderId",tx.ledger_kind AS kind,abs(tx.value)::float AS amount,tx.description,tx.created_at AS "createdAt",m.name AS method,tx.refund_of AS "refundOf",count(*) OVER()::int AS "totalCount" FROM salon_transactions tx JOIN salon_schedules s ON s.id=tx.order_id JOIN payment_methods m ON m.id=tx.method_id WHERE s.customer_id=$3 AND tx.ledger_kind IS NOT NULL AND ${scope} ORDER BY tx.created_at DESC,tx.id DESC LIMIT 20 OFFSET $4`,
        [this.admin(actor), actor.id, id, page * 20],
      )
    ).rows
    const total = rows[0]?.totalCount ?? 0
    return {
      items: rows.map(({ totalCount, ...row }: Record<string, unknown>) => row),
      page,
      total,
      hasNext: (page + 1) * 20 < total,
    }
  }
  async notes(actor: AppUser, id: number) {
    if (!this.admin(actor))
      bookingError('Customer internal notes require administrator access.', 403)
    await this.authorizeCustomer(actor, id)
    return (
      await this.query(
        `SELECT * FROM (SELECT n.id,n.body,n.created_at AS "createdAt",u.login AS author FROM customer_internal_notes n JOIN app_users u ON u.id=n.created_by WHERE n.customer_id=$1 UNION ALL SELECT 0,c.obs,c.created_at,NULL FROM customers c WHERE c.id=$1 AND c.obs IS NOT NULL AND length(trim(c.obs))>0) notes ORDER BY "createdAt" DESC,id DESC LIMIT 200`,
        [id],
      )
    ).rows
  }
  async addNote(actor: AppUser, id: number, body: string) {
    if (!this.admin(actor))
      bookingError('Customer internal notes require administrator access.', 403)
    await this.authorizeCustomer(actor, id)
    return (
      await this.query(
        'INSERT INTO customer_internal_notes(customer_id,body,created_by) VALUES($1,$2,$3) RETURNING id',
        [id, body, actor.id],
      )
    ).rows[0]
  }
  async authorizeOrder(
    actor: AppUser,
    id: number,
    client?: IGenericDatabaseClient,
    lock = true,
  ) {
    const sql = `SELECT s.*,s.schedule_started_at<=clock_timestamp() AS has_started,EXISTS(SELECT 1 FROM salon_schedule_treatments st JOIN employees e ON e.id=st.employee_id WHERE st.schedule_id=s.id AND e.user_id=$2 AND e.is_active) AS assigned FROM salon_schedules s WHERE s.id=$1${client && lock ? ' FOR UPDATE OF s' : ''}`
    const row = (
      client
        ? await client.query(sql, [id, actor.id])
        : await this.query(sql, [id, actor.id])
    ).rows[0]
    if (!row || (!this.admin(actor) && !row.assigned))
      bookingError('Order not found or not accessible.', 404)
    return row
  }
  async order(actor: AppUser, id: number) {
    return this.work.transaction(async (client) => {
      const query = (sql: string, params: unknown[] = []) =>
        client.query(sql, params)
      const row = await this.authorizeOrder(actor, id, client)
      const [extras, notes, payments, methods] = await Promise.all([
        query(
          `SELECT x.id,x.description,x.quantity,x.unit_price::float AS "unitPrice",(x.quantity*x.unit_price)::float AS total,x.created_at AS "createdAt",x.voided_at AS "voidedAt",x.void_reason AS "voidReason",u.login AS author FROM order_consumptions x JOIN app_users u ON u.id=x.created_by WHERE x.schedule_id=$1 ORDER BY x.id`,
          [id],
        ),
        query(
          'SELECT n.id,n.body,n.created_at AS "createdAt",u.login AS author FROM order_notes n JOIN app_users u ON u.id=n.created_by WHERE n.schedule_id=$1 ORDER BY n.id DESC',
          [id],
        ),
        query(
          `SELECT t.package_receipt_id AS "packageReceiptId",t.id,t.ledger_kind AS kind,abs(t.value)::float AS amount,t.description,t.created_at AS "createdAt",m.name AS method,t.refund_of AS "refundOf",u.login AS author,(SELECT COALESCE(sum(abs(value)),0)::float FROM salon_transactions WHERE refund_of=t.id AND ledger_kind='refund') AS "refundedAmount" FROM salon_transactions t JOIN payment_methods m ON m.id=t.method_id LEFT JOIN app_users u ON u.id=t.recorded_by WHERE t.order_id=$1 AND t.ledger_kind IS NOT NULL ORDER BY t.id`,
          [id],
        ),
        query(
          'SELECT id,name FROM payment_methods WHERE removed_at IS NULL ORDER BY name',
        ),
      ])
      const treatmentTotal = Number(
        row.total_price ??
          (
            await query(
              'SELECT COALESCE(sum(price),0) AS total FROM salon_schedule_treatments WHERE schedule_id=$1',
              [id],
            )
          ).rows[0].total,
      )
      const extraCents = extras.rows
        .filter((x: { voidedAt: string | null }) => !x.voidedAt)
        .reduce(
          (sum: number, x: { total: number }) =>
            sum + Math.round(x.total * 100),
          0,
        )
      const paidCents = payments.rows.reduce(
        (sum: number, p: { amount: number; kind: string }) =>
          sum + (p.kind === 'refund' ? -1 : 1) * Math.round(p.amount * 100),
        0,
      )
      const grandTotal = Math.round(treatmentTotal * 100) + extraCents
      return {
        extras: extras.rows,
        notes: notes.rows,
        payments: payments.rows,
        methods: methods.rows,
        isPackage: !!row.package_use_id,
        extrasBalance:
          (extraCents -
            payments.rows
              .filter(
                (p: { packageReceiptId: number | null }) => !p.packageReceiptId,
              )
              .reduce(
                (s: number, p: { amount: number; kind: string }) =>
                  s +
                  (p.kind === 'refund' ? -1 : 1) * Math.round(p.amount * 100),
                0,
              )) /
          100,
        treatmentTotal,
        extrasTotal: extraCents / 100,
        grandTotal: grandTotal / 100,
        totalPaid: paidCents / 100,
        balance: (grandTotal - paidCents) / 100,
        completedAt: row.completed_at,
        canManage: ['confirmed', 'in_progress'].includes(row.status),
        canAddConsumption: [
          'awaiting_deposit',
          'confirmed',
          'in_progress',
        ].includes(row.status),
        status: row.status,
        canComplete:
          ['confirmed', 'in_progress'].includes(row.status) && row.has_started,
        canRefund: this.admin(actor),
      }
    })
  }
  async addConsumption(
    actor: AppUser,
    id: number,
    data: z.infer<typeof ConsumptionSchema>,
  ) {
    return this.work.transaction(async (client) => {
      const order = await this.authorizeOrder(actor, id, client)
      const existing = (
        await client.query(
          'SELECT * FROM order_consumptions WHERE schedule_id=$1 AND request_key=$2',
          [id, data.requestKey],
        )
      ).rows[0]
      if (existing) {
        if (
          existing.description !== data.description ||
          existing.quantity !== data.quantity ||
          Number(existing.unit_price) !== data.unitPrice
        )
          bookingError(
            'Request key already used with different consumption data.',
            409,
          )
        return { id: existing.id }
      }
      if (
        !['awaiting_deposit', 'confirmed', 'in_progress'].includes(order.status)
      )
        bookingError('Extras can only be added to an active appointment.', 409)
      return (
        await client.query(
          'INSERT INTO order_consumptions(schedule_id,description,quantity,unit_price,request_key,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
          [
            id,
            data.description,
            data.quantity,
            data.unitPrice,
            data.requestKey,
            actor.id,
          ],
        )
      ).rows[0]
    })
  }
  async voidConsumption(
    actor: AppUser,
    id: number,
    itemId: number,
    reason: string,
  ) {
    return this.work.transaction(async (client) => {
      const order = await this.authorizeOrder(actor, id, client)
      if (
        !['awaiting_deposit', 'confirmed', 'in_progress'].includes(order.status)
      )
        bookingError('This order is closed for consumption changes.', 409)
      const result = await client.query(
        'UPDATE order_consumptions SET voided_at=now(),voided_by=$3,void_reason=$4 WHERE id=$2 AND schedule_id=$1 AND voided_at IS NULL RETURNING id',
        [id, itemId, actor.id, reason],
      )
      if (!result.rows.length)
        bookingError('Consumption item not found or already voided.', 409)
      return result.rows[0]
    })
  }
  async orderNote(actor: AppUser, id: number, body: string) {
    await this.authorizeOrder(actor, id)
    return (
      await this.query(
        'INSERT INTO order_notes(schedule_id,body,created_by) VALUES($1,$2,$3) RETURNING id',
        [id, body, actor.id],
      )
    ).rows[0]
  }
  async recordPayment(
    actor: AppUser,
    id: number,
    data: z.infer<typeof PaymentSchema>,
  ) {
    return this.work.transaction(async (client) => {
      const order = await this.authorizeOrder(actor, id, client)
      const existing = (
        await client.query(
          'SELECT id,value,method_id,description,ledger_kind FROM salon_transactions WHERE order_id=$1 AND request_key=$2',
          [id, data.requestKey],
        )
      ).rows[0]
      if (existing) {
        if (
          Number(existing.value) !== data.amount ||
          existing.method_id !== data.methodId ||
          existing.description !== data.description ||
          existing.ledger_kind !== 'payment'
        )
          bookingError(
            'Request key already used with different payment data.',
            409,
          )
        return { id: existing.id }
      }
      if (!['confirmed', 'in_progress', 'completed'].includes(order.status))
        bookingError(
          'Payments cannot be recorded for an unconfirmed or cancelled order.',
          409,
        )
      if (order.package_use_id) {
        const extra = (
          await client.query(
            `SELECT (SELECT COALESCE(sum(quantity*unit_price),0) FROM order_consumptions WHERE schedule_id=$1 AND voided_at IS NULL)-(SELECT COALESCE(sum(CASE WHEN ledger_kind='refund' THEN -value ELSE value END),0) FROM salon_transactions WHERE order_id=$1 AND package_receipt_id IS NULL AND ledger_kind IS NOT NULL) AS balance`,
            [id],
          )
        ).rows[0]
        if (
          Math.round(data.amount * 100) >
          Math.round(Number(extra.balance) * 100)
        )
          bookingError(
            'Record package payments in the package panel. Individual payments cover extras only.',
            409,
          )
      }
      const totals = (
        await client.query(
          `SELECT COALESCE(s.total_price,(SELECT sum(price) FROM salon_schedule_treatments WHERE schedule_id=s.id),0)+(SELECT COALESCE(sum(quantity*unit_price),0) FROM order_consumptions WHERE schedule_id=s.id AND voided_at IS NULL)-(SELECT COALESCE(sum(CASE WHEN ledger_kind='refund' THEN -abs(value) ELSE abs(value) END),0) FROM salon_transactions WHERE order_id=s.id AND ledger_kind IS NOT NULL) AS balance FROM salon_schedules s WHERE s.id=$1`,
          [id],
        )
      ).rows[0]
      if (
        Math.round(Number(totals.balance) * 100) < Math.round(data.amount * 100)
      )
        bookingError('Payment exceeds the outstanding order balance.', 409)
      if (
        !(
          await client.query(
            'SELECT id FROM payment_methods WHERE id=$1 AND removed_at IS NULL',
            [data.methodId],
          )
        ).rows.length
      )
        bookingError('Invalid payment method.')
      const tx = (
        await client.query(
          `INSERT INTO salon_transactions(method_id,type_id,is_debit,description,value,created_at,order_id,ledger_kind,recorded_by,request_key) VALUES($1,(SELECT id FROM transaction_types WHERE name='Recebimento de cliente'),false,$2,$3,now(),$4,'payment',$5,$6) RETURNING id`,
          [
            data.methodId,
            data.description,
            data.amount,
            id,
            actor.id,
            data.requestKey,
          ],
        )
      ).rows[0]
      await client.query(
        'INSERT INTO salon_schedule_transactions(schedule_id,transaction_id,created_at) VALUES($1,$2,now())',
        [id, tx.id],
      )
      return tx
    })
  }
  async refund(
    actor: AppUser,
    id: number,
    paymentId: number,
    data: z.infer<typeof RefundSchema>,
  ) {
    if (!this.admin(actor))
      bookingError('Only ADMIN or MASTER can record refunds.', 403)
    return this.work.transaction(async (client) => {
      await this.authorizeOrder(actor, id, client)
      const existing = (
        await client.query(
          'SELECT id,value,refund_of,description,ledger_kind FROM salon_transactions WHERE order_id=$1 AND request_key=$2',
          [id, data.requestKey],
        )
      ).rows[0]
      if (existing) {
        if (
          existing.ledger_kind !== 'refund' ||
          existing.refund_of !== paymentId ||
          Number(existing.value) !== data.amount ||
          existing.description !== data.reason
        )
          bookingError(
            'Request key already used with different refund data.',
            409,
          )
        return { id: existing.id }
      }
      const source = (
        await client.query(
          `SELECT *,value-(SELECT COALESCE(sum(abs(value)),0) FROM salon_transactions WHERE refund_of=t.id AND ledger_kind='refund') AS available FROM salon_transactions t WHERE id=$1 AND order_id=$2 AND package_receipt_id IS NULL AND ledger_kind IN ('payment','deposit') FOR UPDATE OF t`,
          [paymentId, id],
        )
      ).rows[0]
      if (!source) bookingError('Original payment not found.', 404)
      if (
        Math.round(Number(source.available) * 100) <
        Math.round(data.amount * 100)
      )
        bookingError('Refund exceeds the unrefunded payment amount.', 409)
      const tx = (
        await client.query(
          `INSERT INTO salon_transactions(method_id,type_id,is_debit,description,value,created_at,order_id,ledger_kind,refund_of,recorded_by,request_key) VALUES($1,(SELECT id FROM transaction_types WHERE name='Estorno de cliente'),true,$2,$3,now(),$4,'refund',$5,$6,$7) RETURNING id`,
          [
            source.method_id,
            data.reason,
            data.amount,
            id,
            paymentId,
            actor.id,
            data.requestKey,
          ],
        )
      ).rows[0]
      await client.query(
        'INSERT INTO salon_schedule_transactions(schedule_id,transaction_id,created_at) VALUES($1,$2,now())',
        [id, tx.id],
      )
      return tx
    })
  }
  async complete(actor: AppUser, id: number) {
    return this.work.transaction(async (client) => {
      const order = await this.authorizeOrder(actor, id, client)
      if (order.status === 'completed') return { id }
      if (!['confirmed', 'in_progress'].includes(order.status))
        bookingError('Only confirmed appointments can be completed.', 409)
      if (order.package_use_id) {
        const use = (
          await client.query(
            'SELECT u.state,p.valid_until>clock_timestamp() AS valid FROM package_uses u JOIN package_purchases p ON p.id=u.purchase_id WHERE u.id=$1',
            [order.package_use_id],
          )
        ).rows[0]
        if (!use?.valid || use.state !== 'reserved')
          bookingError('Package utilization is unavailable or expired.', 409)
      }
      const started = (
        await client.query(
          'SELECT $1::timestamptz<=clock_timestamp() AS started',
          [order.schedule_started_at],
        )
      ).rows[0].started
      if (!started)
        bookingError(
          'An appointment cannot be completed before it starts.',
          409,
        )
      await client.query(
        "UPDATE salon_schedules SET status='completed',completed_at=now(),completed_by=$2,updated_at=now() WHERE id=$1",
        [id, actor.id],
      )
      return { id }
    })
  }
}
