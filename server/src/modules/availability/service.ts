import {
  IDatabaseService,
  IDatabaseUnitOfWork,
  IGenericDatabaseClient,
} from '@/core/db'
import { AppUser } from '@/core/user'
import { can, salonWide } from '@/core/access'
import { MASTER_USER_ID } from '@/core/config'
import { bookingError } from '../booking/service'
import { AvailabilityRequestSchema, DecisionSchema, addHour } from './schemas'
import { validateUpcomingAvailability } from './validation'
import z from 'zod'

const select = `SELECT r.id,r.employee_id AS "employeeId",p.name AS "employeeName",r.kind,r.starts_at AS "startsAt",r.ends_at AS "endsAt",r.baseline_lunch::text AS "baselineLunch",r.reason,r.status,r.created_at AS "createdAt",r.decided_at AS "decidedAt",r.decision_reason AS "decisionReason",u.login AS "decidedBy",e.user_id AS "userId",
 EXISTS(SELECT 1 FROM salon_schedule_treatments st JOIN salon_schedules s ON s.id=st.schedule_id WHERE st.employee_id=r.employee_id AND s.status NOT IN ('cancelled','completed') AND s.schedule_started_at<r.ends_at AND s.schedule_ended_at>r.starts_at) AS "hasConflict"
 FROM employee_availability_requests r JOIN employees e ON e.id=r.employee_id JOIN persons p ON p.id=e.person_id LEFT JOIN app_users u ON u.id=r.decided_by`
export class AvailabilityService {
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
  manager(actor: AppUser) {
    return salonWide(actor) && can(actor, 'availability.manage')
  }
  async me(actor: AppUser) {
    return (
      (
        await this.query(
          `SELECT e.id,p.name,COALESCE((SELECT json_agg(json_build_object('weekday',weekday,'opensAt',opens_at,'closesAt',closes_at,'lunchStart',lunch_start) ORDER BY weekday) FROM employee_booking_hours WHERE employee_id=e.id),'[]') AS hours FROM employees e JOIN persons p ON p.id=e.person_id WHERE e.user_id=$1 AND e.is_active`,
          [actor.id],
        )
      ).rows[0] ?? null
    )
  }
  async requests(
    actor: AppUser,
    q: {
      page: number
      status: string
      kind: string
      search: string
      from?: string
      to?: string
    },
  ) {
    const wide = this.manager(actor)
    const filter = `WHERE ($1::boolean OR (e.user_id=$2 AND e.is_active)) AND ($3='' OR r.status=$3) AND ($4='' OR r.kind=$4) AND ($5='' OR p.name ILIKE $6) AND ($7::date IS NULL OR r.ends_at>($7::date::timestamp AT TIME ZONE 'America/Sao_Paulo')) AND ($8::date IS NULL OR r.starts_at<(($8::date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo'))`
    const result = (
      await this.query(
        `${select} ${filter} ORDER BY r.created_at DESC,r.id DESC LIMIT 21 OFFSET $9`,
        [
          wide,
          actor.id,
          q.status,
          q.kind,
          q.search,
          '%' + q.search.replace(/[\\%_]/g, '\\$&') + '%',
          q.from ?? null,
          q.to ?? null,
          q.page * 20,
        ],
      )
    ).rows
    const pending = (
      await this.query(
        `SELECT count(*)::int AS count FROM employee_availability_requests r JOIN employees e ON e.id=r.employee_id WHERE r.status='pending' AND ($1::boolean OR (e.user_id=$2 AND e.is_active))`,
        [wide, actor.id],
      )
    ).rows[0].count
    return {
      items: result.slice(0, 20).map(({ userId, ...row }: any) => row),
      hasNext: result.length > 20,
      pendingCount: pending,
      canManage: wide,
    }
  }
  async audit(
    c: IGenericDatabaseClient,
    employee: number,
    id: number | null,
    actor: AppUser,
    action: string,
    old: unknown,
    current: unknown,
  ) {
    await c.query(
      'INSERT INTO employee_availability_events(employee_id,request_id,actor_id,action,previous_data,current_data) VALUES($1,$2,$3,$4,$5,$6)',
      [
        employee,
        id,
        actor.id,
        action,
        JSON.stringify(old),
        JSON.stringify(current),
      ],
    )
  }
  async create(actor: AppUser, d: z.infer<typeof AvailabilityRequestSchema>) {
    if (actor.role !== 'OPERATIONAL' || !can(actor, 'availability.request'))
      bookingError(
        'Only authorized operational staff may submit their own request.',
        403,
      )
    const employee = await this.me(actor)
    if (!employee)
      bookingError('No active employee is linked to your user.', 403)
    return this.work.transaction(async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(70421,$1)', [employee.id])
      if (
        !(
          await c.query(
            'SELECT id FROM employees WHERE id=$1 AND user_id=$2 AND is_active',
            [employee.id, actor.id],
          )
        ).rows.length
      )
        bookingError('Employee is no longer active.', 403)
      const prior = (
        await c.query(
          'SELECT id,reason,kind,starts_at,ends_at FROM employee_availability_requests WHERE employee_id=$1 AND request_key=$2',
          [employee.id, d.requestKey],
        )
      ).rows[0]
      const end = d.kind === 'lunch' ? addHour(d.startsAt!) : d.endsAt
      if (d.kind !== 'vacation' && !end)
        bookingError('Lunch cannot cross midnight.')
      const period = (
        await c.query(
          `SELECT ($1::date+COALESCE($2,'00:00')::time) AT TIME ZONE 'America/Sao_Paulo' AS start,
   CASE WHEN $5='vacation' THEN (($3::date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo') ELSE ($1::date+$4::time) AT TIME ZONE 'America/Sao_Paulo' END AS finish,clock_timestamp() AS now`,
          [
            d.date,
            d.kind === 'vacation' ? '00:00' : d.startsAt,
            d.endDate ?? d.date,
            end ?? '00:00',
            d.kind,
          ],
        )
      ).rows[0]
      if (prior) {
        if (
          prior.reason !== d.reason ||
          prior.kind !== d.kind ||
          prior.starts_at.getTime() !== period.start.getTime() ||
          prior.ends_at.getTime() !== period.finish.getTime()
        )
          bookingError('Request key already used for another request.', 409)
        return { id: prior.id }
      }
      if (
        period.start <= period.now ||
        period.finish <= period.start ||
        period.finish - period.start > 366 * 86400000
      )
        bookingError('Request a future period of at most 366 days.')
      const baseline = await this.checkWorkingDay(
        c,
        employee.id,
        d.kind,
        period.start,
        period.finish,
      )
      if (
        (
          await c.query(
            `SELECT id FROM employee_availability_requests WHERE employee_id=$1 AND status IN ('pending','approved') AND ((starts_at<$3 AND ends_at>$2) OR (kind='lunch' AND $4='lunch' AND (starts_at AT TIME ZONE 'America/Sao_Paulo')::date=($2::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date)) LIMIT 1`,
            [employee.id, period.start, period.finish, d.kind],
          )
        ).rows.length
      )
        bookingError(
          'There is already a pending or approved request in this period.',
          409,
        )
      const row = (
        await c.query(
          'INSERT INTO employee_availability_requests(employee_id,kind,starts_at,ends_at,baseline_lunch,reason,request_key,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
          [
            employee.id,
            d.kind,
            period.start,
            period.finish,
            baseline,
            d.reason,
            d.requestKey,
            actor.id,
          ],
        )
      ).rows[0]
      await this.audit(c, employee.id, row.id, actor, 'request', {}, d)
      // Recipients must still have the management permission when reading/acting.
      await c.query(
        `INSERT INTO employee_availability_notices(user_id,request_id,kind,body)
    SELECT u.id,$1,'review',$2 FROM app_users u WHERE u.is_active AND u.removed_at IS NULL AND (u.id=$3 OR u.role='MASTER' OR (u.role='ADMIN' AND EXISTS(SELECT 1 FROM profile_permissions p LEFT JOIN user_permission_overrides o ON o.user_id=u.id AND o.permission_key=p.permission_key WHERE p.role=u.role AND p.permission_key='availability.manage' AND (p.allowed OR p.delegatable) AND COALESCE(o.allowed,p.allowed))))`,
        [row.id, `Nova solicitação de ${employee.name}.`, MASTER_USER_ID],
      )
      return row
    })
  }
  async checkWorkingDay(
    c: IGenericDatabaseClient,
    employee: number,
    kind: string,
    start: Date,
    end: Date,
  ) {
    if (kind === 'vacation') return null
    const day = (
      await c.query(
        `SELECT opens_at,closes_at,lunch_start FROM employee_booking_hours WHERE employee_id=$1 AND weekday=extract(dow FROM $2::timestamptz AT TIME ZONE 'America/Sao_Paulo') AND ($2::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date=($3::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date AND opens_at<=($2::timestamptz AT TIME ZONE 'America/Sao_Paulo')::time AND closes_at>=($3::timestamptz AT TIME ZONE 'America/Sao_Paulo')::time`,
        [employee, start, end],
      )
    ).rows[0]
    if (!day)
      bookingError('The requested period must fit inside a working day.', 409)
    if (kind === 'lunch') {
      if (!day.lunch_start)
        bookingError(
          'Configure the regular lunch before requesting a change.',
          409,
        )
      if (
        (
          await c.query(
            `SELECT (($1::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date+$2::time) AT TIME ZONE 'America/Sao_Paulo'<=clock_timestamp() AS past`,
            [start, day.lunch_start],
          )
        ).rows[0].past
      )
        bookingError(
          'The regular lunch has already started. Request changes in advance.',
          409,
        )
      if (
        day.lunch_start ===
        start.toLocaleTimeString('en-GB', { timeZone: 'America/Sao_Paulo' })
      )
        bookingError('Choose a lunch time different from the regular lunch.')
    }
    return day.lunch_start
  }
  async decide(actor: AppUser, id: number, d: z.infer<typeof DecisionSchema>) {
    const found = (
      await this.query(
        'SELECT r.employee_id,e.user_id FROM employee_availability_requests r JOIN employees e ON e.id=r.employee_id WHERE r.id=$1',
        [id],
      )
    ).rows[0]
    if (!found) bookingError('Request not found.', 404)
    const wide = this.manager(actor)
    if (!wide && (found.user_id !== actor.id || d.action !== 'cancel'))
      bookingError('Request not found or not authorized.', 404)
    return this.work.transaction(async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(70421,$1)', [
        found.employee_id,
      ])
      const row = (
        await c.query(
          'SELECT * FROM employee_availability_requests WHERE id=$1 FOR UPDATE',
          [id],
        )
      ).rows[0]
      const replay = (
        await c.query(
          `SELECT current_data FROM employee_availability_events WHERE request_id=$1 AND current_data->>'requestKey'=$2`,
          [id, d.requestKey],
        )
      ).rows[0]
      if (replay) {
        if (
          replay.current_data.request.action !== d.action ||
          replay.current_data.request.reason !== d.reason ||
          replay.current_data.request.requestKey !== d.requestKey
        )
          bookingError('Request key already used.', 409)
        return { id }
      }
      if (!wide && row.status !== 'pending')
        bookingError(
          'Only pending requests can be cancelled by the employee.',
          403,
        )
      if (
        (d.action !== 'cancel' && row.status !== 'pending') ||
        (d.action === 'cancel' && !['pending', 'approved'].includes(row.status))
      )
        bookingError('This request has already been decided.', 409)
      if (d.action === 'approve') {
        if (
          (
            await c.query('SELECT $1::timestamptz<=clock_timestamp() AS past', [
              row.starts_at,
            ])
          ).rows[0].past
        )
          bookingError('The request period has already started.', 409)
        if (
          !(
            await c.query(
              'SELECT e.id FROM employees e JOIN app_users u ON u.id=e.user_id WHERE e.id=$1 AND e.is_active AND u.is_active AND u.removed_at IS NULL',
              [row.employee_id],
            )
          ).rows.length
        )
          bookingError('Employee is no longer available.', 409)
        const baseline = await this.checkWorkingDay(
          c,
          row.employee_id,
          row.kind,
          row.starts_at,
          row.ends_at,
        )
        if (row.kind === 'lunch' && row.baseline_lunch !== baseline)
          bookingError(
            'The regular lunch changed. Ask the employee to submit a new request.',
            409,
          )
        if (
          (
            await c.query(
              `SELECT id FROM employee_availability_requests WHERE employee_id=$1 AND id<>$4 AND status='approved' AND starts_at<$3 AND ends_at>$2 LIMIT 1`,
              [row.employee_id, row.starts_at, row.ends_at, id],
            )
          ).rows.length
        )
          bookingError('Another approved request overlaps this period.', 409)
        if (
          (
            await c.query(
              `SELECT s.id FROM salon_schedules s JOIN salon_schedule_treatments st ON st.schedule_id=s.id WHERE st.employee_id=$1 AND s.status NOT IN ('cancelled','completed') AND s.schedule_started_at<$3 AND s.schedule_ended_at>$2 LIMIT 1`,
              [row.employee_id, row.starts_at, row.ends_at],
            )
          ).rows.length
        )
          bookingError(
            'Existing appointments conflict with this request. Reschedule them before approval.',
            409,
          )
      }
      const status =
        d.action === 'approve'
          ? 'approved'
          : d.action === 'decline'
            ? 'declined'
            : 'cancelled'
      await c.query(
        'UPDATE employee_availability_requests SET status=$2,decided_by=$3,decided_at=now(),decision_reason=$4 WHERE id=$1',
        [id, status, actor.id, d.reason],
      )
      if (
        row.status === 'approved' &&
        row.kind === 'lunch' &&
        d.action === 'cancel'
      )
        await validateUpcomingAvailability(c, row.employee_id)
      await this.audit(c, row.employee_id, id, actor, d.action, row, {
        status,
        requestKey: d.requestKey,
        request: d,
      })
      await c.query(
        "INSERT INTO employee_availability_notices(user_id,request_id,kind,body) VALUES($1,$2,'decision',$3)",
        [
          found.user_id,
          id,
          `Sua solicitação #${id} foi ${status === 'approved' ? 'aprovada' : status === 'declined' ? 'recusada' : 'cancelada'}.`,
        ],
      )
      await c.query(
        "UPDATE employee_availability_notices SET read_at=now() WHERE request_id=$1 AND kind='review' AND read_at IS NULL",
        [id],
      )
      return { id }
    })
  }
  async events(actor: AppUser, id: number) {
    const row = (
      await this.query(
        'SELECT e.user_id FROM employee_availability_requests r JOIN employees e ON e.id=r.employee_id WHERE r.id=$1',
        [id],
      )
    ).rows[0]
    if (!row || (!this.manager(actor) && row.user_id !== actor.id))
      bookingError('Request not found.', 404)
    return (
      await this.query(
        `SELECT v.id,v.action,v.created_at AS "createdAt",u.login AS author,COALESCE(v.current_data->'request'->>'reason',v.current_data->>'reason') AS reason FROM employee_availability_events v JOIN app_users u ON u.id=v.actor_id WHERE request_id=$1 ORDER BY v.id`,
        [id],
      )
    ).rows
  }
  async notices(actor: AppUser) {
    if (!can(actor, 'availability.view') && !this.manager(actor))
      return { items: [], pendingCount: 0 }
    const wide = this.manager(actor)
    const items = (
      await this.query(
        `SELECT id,body,kind,created_at AS "createdAt" FROM employee_availability_notices WHERE user_id=$1 AND read_at IS NULL AND ($2::boolean OR kind='decision') ORDER BY id DESC LIMIT 10`,
        [actor.id, wide],
      )
    ).rows
    const pending = wide
      ? (
          await this.query(
            "SELECT count(*)::int AS n FROM employee_availability_requests WHERE status='pending'",
          )
        ).rows[0].n
      : 0
    return { items, pendingCount: pending }
  }
  async readNotice(actor: AppUser, id: number) {
    await this.query(
      'UPDATE employee_availability_notices SET read_at=now() WHERE id=$1 AND user_id=$2',
      [id, actor.id],
    )
    return { id }
  }
  async blocks(actor: AppUser, start: string, end: string) {
    const rows = (
      await this.query(
        `SELECT e.id AS "employeeId",p.name AS "employeeName",b.starts_at AS "startsAt",b.ends_at AS "endsAt",b.kind,b.request_id AS "requestId" FROM employees e JOIN persons p ON p.id=e.person_id CROSS JOIN LATERAL employee_calendar_blocks(e.id,$1,$2) b WHERE ($3::boolean OR (e.user_id=$4 AND e.is_active)) ORDER BY b.starts_at,e.id`,
        [start, end, salonWide(actor), actor.id],
      )
    ).rows
    return rows
  }
}
