import { createHash, randomUUID } from 'crypto'
import {
  IDatabaseService,
  IDatabaseUnitOfWork,
  IGenericDatabaseClient,
} from '@/core/db'
import { AppUser } from '@/core/user'
import { can, salonWide } from '@/core/access'
import { bookingError } from '../booking/service'
import { CustomerService } from '../customers/service'
import { linkedPlan } from '../dependencies/rules'
export type Rate = {
  treatmentId: number
  standardPercent: number | null
  packagePercent: number | null
}
export class CommissionService {
  constructor(
    private db: IDatabaseService,
    private work: IDatabaseUnitOfWork,
  ) {}
  async query(sql: string, args: unknown[] = []) {
    const c = await this.db.getClient()
    try {
      return await c.query(sql, args)
    } finally {
      c.release()
    }
  }
  manager(actor: AppUser, key: string) {
    if (!salonWide(actor) || !can(actor, key))
      bookingError(
        'Only authorized ADMIN or MASTER can perform this action.',
        403,
      )
  }
  async employee(actor: AppUser, id: number, c?: IGenericDatabaseClient) {
    const sql = `SELECT e.id,e.commission_version AS version,p.name FROM employees e JOIN persons p ON p.id=e.person_id WHERE e.id=$1 AND ($2::boolean OR (e.user_id=$3 AND e.is_active))`
    const row = (
      await (c
        ? c.query(sql, [id, salonWide(actor), actor.id])
        : this.query(sql, [id, salonWide(actor), actor.id]))
    ).rows[0]
    if (!row) bookingError('Employee not found.', 404)
    return row
  }
  async options(actor: AppUser) {
    return {
      employees: (
        await this.query(
          'SELECT e.id,p.name FROM employees e JOIN persons p ON p.id=e.person_id WHERE $1::boolean OR (e.user_id=$2 AND e.is_active) ORDER BY p.name,e.id',
          [salonWide(actor), actor.id],
        )
      ).rows,
      treatments: (
        await this.query(
          'SELECT DISTINCT t.id,t.name FROM salon_treatments t JOIN employee_salon_treatments et ON et.treatment_id=t.id JOIN employees e ON e.id=et.employee_id WHERE $1::boolean OR (e.user_id=$2 AND e.is_active) ORDER BY t.name,t.id',
          [salonWide(actor), actor.id],
        )
      ).rows,
      canManage: salonWide(actor) && can(actor, 'commissions.manage'),
      canSettle: salonWide(actor) && can(actor, 'commissions.settle'),
    }
  }
  async rates(actor: AppUser, employeeId: number) {
    const employee = await this.employee(actor, employeeId)
    return {
      employee,
      canManage: salonWide(actor) && can(actor, 'commissions.manage'),
      items: (
        await this.query(
          `SELECT et.treatment_id AS "treatmentId",t.name,t.is_active AS active,r.standard_percent::float AS "standardPercent",r.package_percent::float AS "packagePercent" FROM employee_salon_treatments et JOIN salon_treatments t ON t.id=et.treatment_id LEFT JOIN employee_commission_rates r ON r.employee_id=et.employee_id AND r.treatment_id=et.treatment_id WHERE et.employee_id=$1 ORDER BY t.name,t.id`,
          [employeeId],
        )
      ).rows,
      audit: salonWide(actor)
        ? (
            await this.query(
              'SELECT a.id,a.previous_data AS previous,a.current_data AS current,a.created_at AS "createdAt",u.login AS author FROM employee_commission_rate_audit a JOIN app_users u ON u.id=a.created_by WHERE employee_id=$1 ORDER BY a.id DESC LIMIT 20',
              [employeeId],
            )
          ).rows
        : [],
    }
  }
  async saveRates(actor: AppUser, id: number, version: number, rates: Rate[]) {
    this.manager(actor, 'commissions.manage')
    return this.work.transaction(async (c) => {
      await this.employee(actor, id, c)
      const current = (
        await c.query(
          'SELECT commission_version FROM employees WHERE id=$1 FOR UPDATE',
          [id],
        )
      ).rows[0]
      if (current.commission_version !== version)
        bookingError(
          'Commission configuration changed. Reload before saving.',
          409,
        )
      const qualified = (
        await c.query(
          'SELECT treatment_id FROM employee_salon_treatments WHERE employee_id=$1 ORDER BY treatment_id',
          [id],
        )
      ).rows.map((r: any) => r.treatment_id)
      if (
        new Set(rates.map((r) => r.treatmentId)).size !== rates.length ||
        JSON.stringify(qualified) !==
          JSON.stringify(rates.map((r) => r.treatmentId).sort((a, b) => a - b))
      )
        bookingError(
          'Employee qualifications changed. Reload the procedures.',
          409,
        )
      const previous = (
        await c.query(
          'SELECT treatment_id AS "treatmentId",standard_percent::float AS "standardPercent",package_percent::float AS "packagePercent" FROM employee_commission_rates WHERE employee_id=$1 ORDER BY treatment_id',
          [id],
        )
      ).rows
      for (const r of rates)
        await c.query(
          'INSERT INTO employee_commission_rates(employee_id,treatment_id,standard_percent,package_percent,updated_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(employee_id,treatment_id) DO UPDATE SET standard_percent=excluded.standard_percent,package_percent=excluded.package_percent,updated_by=excluded.updated_by,updated_at=now()',
          [id, r.treatmentId, r.standardPercent, r.packagePercent, actor.id],
        )
      await c.query(
        'UPDATE employees SET commission_version=commission_version+1 WHERE id=$1',
        [id],
      )
      await c.query(
        'INSERT INTO employee_commission_rate_audit(employee_id,previous_data,current_data,created_by) VALUES($1,$2,$3,$4)',
        [id, JSON.stringify(previous), JSON.stringify(rates), actor.id],
      )
      return { version: version + 1 }
    })
  }
  async listRates(
    actor: AppUser,
    q: { employeeId?: number; treatmentId?: number; page: number },
  ) {
    const rows = (
      await this.query(
        `SELECT e.id AS "employeeId",p.name AS "employeeName",t.id AS "treatmentId",t.name,r.standard_percent::float AS "standardPercent",r.package_percent::float AS "packagePercent" FROM employees e JOIN persons p ON p.id=e.person_id JOIN employee_salon_treatments et ON et.employee_id=e.id JOIN salon_treatments t ON t.id=et.treatment_id LEFT JOIN employee_commission_rates r ON r.employee_id=e.id AND r.treatment_id=t.id WHERE ($1::boolean OR (e.user_id=$2 AND e.is_active)) AND ($3::int IS NULL OR e.id=$3) AND ($4::int IS NULL OR t.id=$4) ORDER BY p.name,e.id,t.name,t.id LIMIT 21 OFFSET $5`,
        [
          salonWide(actor),
          actor.id,
          q.employeeId ?? null,
          q.treatmentId ?? null,
          q.page * 20,
        ],
      )
    ).rows
    return { items: rows.slice(0, 20), hasNext: rows.length > 20 }
  }
  async movements(
    actor: AppUser,
    q: {
      employeeId?: number
      treatmentId?: number
      from: string
      to: string
      page: number
    },
  ) {
    const cte = `WITH movements AS (SELECT 'c'||c.id AS id,c.id AS "commissionId",c.employee_id,c.treatment_id,c.schedule_id,'recognition'::text AS kind,c.amount AS amount,c.gross_amount,c.percent,c.treatment_name,c.recognized_at AS date,c.closing_id,NULL::text AS reason FROM employee_commissions c UNION ALL SELECT 'a'||a.id,c.id,c.employee_id,c.treatment_id,c.schedule_id,a.kind,-a.amount,c.gross_amount,c.percent,c.treatment_name,a.created_at,a.closing_id,a.reason FROM employee_commission_adjustments a JOIN employee_commissions c ON c.id=a.commission_id), filtered AS (SELECT m.*,p.name AS "employeeName" FROM movements m JOIN employees e ON e.id=m.employee_id JOIN persons p ON p.id=e.person_id WHERE ($1::boolean OR (e.user_id=$2 AND e.is_active)) AND ($3::int IS NULL OR m.employee_id=$3) AND ($4::int IS NULL OR m.treatment_id=$4) AND m.date>=($5::date::timestamp AT TIME ZONE 'America/Sao_Paulo') AND m.date<(($6::date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo'))`
    const args = [
      salonWide(actor),
      actor.id,
      q.employeeId ?? null,
      q.treatmentId ?? null,
      q.from,
      q.to,
    ]
    const rows = (
      await this.query(
        cte +
          ' SELECT id,"commissionId",employee_id AS "employeeId",schedule_id AS "orderId",kind,amount::float AS amount,gross_amount::float AS "grossAmount",percent::float AS percent,treatment_name AS name,date,"employeeName",closing_id AS "closingId",reason FROM filtered ORDER BY date DESC,id DESC LIMIT 21 OFFSET $7',
        [...args, q.page * 20],
      )
    ).rows
    const totals = (
      await this.query(
        cte +
          ` SELECT COALESCE(sum(amount) FILTER(WHERE kind='recognition'),0)::float AS recognized,COALESCE(-sum(amount) FILTER(WHERE kind<>'recognition'),0)::float AS adjustments,COALESCE(sum(amount),0)::float AS net FROM filtered`,
        args,
      )
    ).rows[0]
    return { items: rows.slice(0, 20), hasNext: rows.length > 20, totals }
  }
  async balance(actor: AppUser, id: number) {
    await this.employee(actor, id)
    return this.pending(id)
  }
  async pending(id: number, c?: IGenericDatabaseClient) {
    const sql = `SELECT ((SELECT count(*) FROM employee_commissions WHERE employee_id=$1 AND closing_id IS NULL)+(SELECT count(*) FROM employee_commission_adjustments a JOIN employee_commissions c ON c.id=a.commission_id WHERE c.employee_id=$1 AND a.closing_id IS NULL))::int AS count,((SELECT COALESCE(sum(amount),0) FROM employee_commissions WHERE employee_id=$1 AND closing_id IS NULL)-(SELECT COALESCE(sum(a.amount),0) FROM employee_commission_adjustments a JOIN employee_commissions c ON c.id=a.commission_id WHERE c.employee_id=$1 AND a.closing_id IS NULL))::float AS pending`
    return (await (c ? c.query(sql, [id]) : this.query(sql, [id]))).rows[0]
  }
  async closings(actor: AppUser, id: number) {
    await this.employee(actor, id)
    return (
      await this.query(
        'SELECT c.id,c.amount::float AS amount,c.description,c.created_at AS "createdAt",u.login AS author FROM commission_closings c JOIN app_users u ON u.id=c.created_by WHERE employee_id=$1 ORDER BY c.id DESC LIMIT 30',
        [id],
      )
    ).rows
  }
  async close(
    actor: AppUser,
    id: number,
    d: {
      expectedAmount: number
      methodId: number
      description: string
      requestKey: string
    },
  ) {
    this.manager(actor, 'commissions.settle')
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ ...d, requestKey: undefined }))
      .digest('hex')
    return this.work.transaction(async (c) => {
      await this.employee(actor, id, c)
      await c.query('SELECT pg_advisory_xact_lock(70450,$1)', [id])
      const existing = (
        await c.query(
          'SELECT id,fingerprint FROM commission_closings WHERE employee_id=$1 AND request_key=$2',
          [id, d.requestKey],
        )
      ).rows[0]
      if (existing) {
        if (existing.fingerprint !== fingerprint)
          bookingError('Request key already used.', 409)
        return { id: existing.id }
      }
      const credits = (
        await c.query(
          'SELECT id FROM employee_commissions WHERE employee_id=$1 AND closing_id IS NULL ORDER BY id FOR UPDATE',
          [id],
        )
      ).rows
      const debits = (
        await c.query(
          'SELECT a.id FROM employee_commission_adjustments a JOIN employee_commissions c ON c.id=a.commission_id WHERE c.employee_id=$1 AND a.closing_id IS NULL ORDER BY a.id FOR UPDATE OF a',
          [id],
        )
      ).rows
      if (!credits.length && !debits.length)
        bookingError('There are no pending commission entries.', 409)
      const balance = await this.pending(id, c)
      if (balance.pending < 0)
        bookingError(
          'Negative commission balance remains as compensation for the next closing.',
          409,
        )
      if (
        Math.round(balance.pending * 100) !== Math.round(d.expectedAmount * 100)
      )
        bookingError('Commission balance changed. Review the closing.', 409)
      if (
        !(
          await c.query(
            'SELECT id FROM payment_methods WHERE id=$1 AND removed_at IS NULL',
            [d.methodId],
          )
        ).rows.length
      )
        bookingError('Invalid payment method.')
      const closing = (
        await c.query(
          'INSERT INTO commission_closings(employee_id,amount,description,request_key,fingerprint,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
          [
            id,
            balance.pending,
            d.description,
            d.requestKey,
            fingerprint,
            actor.id,
          ],
        )
      ).rows[0]
      if (balance.pending > 0) {
        const tx = (
          await c.query(
            "INSERT INTO salon_transactions(method_id,type_id,is_debit,description,value,created_at,recorded_by,request_key) VALUES($1,(SELECT id FROM transaction_types WHERE name='Pagamento de comissões'),true,$2,$3,now(),$4,$5) RETURNING id",
            [
              d.methodId,
              d.description,
              balance.pending,
              actor.id,
              randomUUID(),
            ],
          )
        ).rows[0]
        await c.query(
          'UPDATE commission_closings SET transaction_id=$2 WHERE id=$1',
          [closing.id, tx.id],
        )
      }
      await c.query(
        'UPDATE employee_commissions SET closing_id=$2 WHERE id=ANY($1::bigint[])',
        [credits.map((x: any) => x.id), closing.id],
      )
      await c.query(
        'UPDATE employee_commission_adjustments SET closing_id=$2 WHERE id=ANY($1::bigint[])',
        [debits.map((x: any) => x.id), closing.id],
      )
      return closing
    })
  }
  async order(actor: AppUser, id: number) {
    const customer = new CustomerService(this.db, this.work)
    const order = await customer.authorizeOrder(actor, id)
    const rows = (
      await this.query(
        `SELECT c.id,c.employee_id AS "employeeId",p.name AS "employeeName",c.treatment_name AS name,c.is_package AS "isPackage",c.gross_amount::float AS "grossAmount",c.percent::float AS percent,c.amount::float AS amount,c.closing_id AS "closingId",(SELECT COALESCE(sum(amount),0)::float FROM employee_commission_adjustments WHERE commission_id=c.id) AS reversed,(SELECT COALESCE(sum(amount),0)::float FROM employee_commission_adjustments WHERE commission_id=c.id AND closing_id IS NULL) AS "pendingAdjustment" FROM employee_commissions c JOIN employees e ON e.id=c.employee_id JOIN persons p ON p.id=e.person_id WHERE schedule_id=$1 AND ($2::boolean OR (e.user_id=$3 AND e.is_active)) ORDER BY c.id`,
        [id, salonWide(actor), actor.id],
      )
    ).rows
    return {
      items: rows,
      canAnnul:
        salonWide(actor) &&
        can(actor, 'commissions.adjust') &&
        order.status === 'completed',
      annulledAt: order.annulled_at,
    }
  }
  async annul(
    actor: AppUser,
    id: number,
    d: { reason: string; acknowledgeLinkedImpact: boolean },
  ) {
    this.manager(actor, 'commissions.adjust')
    const customer = new CustomerService(this.db, this.work)
    return this.work.transaction(async (c) => {
      // Match package payment and completion lock order.
      await c.query(
        'SELECT p.id FROM package_purchases p JOIN package_uses u ON u.purchase_id=p.id JOIN salon_schedules s ON s.package_use_id=u.id WHERE s.id=$1 FOR UPDATE OF p',
        [id],
      )
      const order = await customer.authorizeOrder(actor, id, c, true, true)
      if (order.annulled_at) return { id }
      if (order.status !== 'completed')
        bookingError('Only completed appointments can be annulled here.', 409)
      const linked = await linkedPlan(c, id)
      if (linked && !d.acknowledgeLinkedImpact)
        bookingError(
          'Acknowledge the impact on linked appointments before annulment.',
          409,
        )
      await c.query(
        "UPDATE salon_schedules SET status='cancelled',annulled_at=now(),annulled_by=$2,annulment_reason=$3,cancelled_at=now(),cancellation_reason=$3,updated_at=now() WHERE id=$1",
        [id, actor.id, d.reason],
      )
      if (order.package_use_id)
        await c.query("UPDATE package_uses SET state='cancelled' WHERE id=$1", [
          order.package_use_id,
        ])
      await c.query(
        "INSERT INTO schedule_changes(schedule_id,actor_id,action,previous_data,current_data,reason) VALUES($1,$2,'annul',$3,$4,$5)",
        [
          id,
          actor.id,
          JSON.stringify({ status: order.status }),
          JSON.stringify({ status: 'cancelled', reason: d.reason }),
          d.reason,
        ],
      )
      return { id }
    })
  }
}
