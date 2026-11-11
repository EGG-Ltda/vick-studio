import { createHash, randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import {
  IDatabaseService,
  IDatabaseUnitOfWork,
  IGenericDatabaseClient,
} from '@/core/db'
import { AppUser } from '@/core/user'
import { salonWide, can } from '@/core/access'
import {
  BookingSchema,
  EmployeeSchema,
  RegistrationSchema,
  SettingsSchema,
} from './schemas'
import z from 'zod'
import { customerDepositDeadline } from './deadline'
import { recordDeposit } from '../customers/ledger'
import { assertIndependent } from '../dependencies/rules'

export function bookingError(message: string, statusCode = 400): never {
  throw Object.assign(new Error(message), { statusCode })
}
const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex')
const settingsSelect = `SELECT package_validity_months AS "packageValidityMonths",enabled,deposit_days AS "depositDays",short_notice_hours AS "shortNoticeHours",deposit_type AS "depositType",deposit_value::float AS "depositValue",payment_instructions AS "paymentInstructions",timezone FROM booking_settings WHERE id=true`
const bookingSelect = `SELECT (SELECT group_id FROM booking_group_members WHERE schedule_id=s.id) AS "groupId",s.package_use_id AS "packageUseId",(SELECT purchase_id FROM package_uses WHERE id=s.package_use_id) AS "packagePurchaseId",s.id,s.customer_id AS "customerId",p.name AS "customerName",s.status,
 s.schedule_started_at AS "startsAt",s.schedule_ended_at AS "endsAt",s.total_price::float AS "totalPrice",
 s.deposit_required::float AS "depositRequired",s.deposit_received::float AS "depositReceived",
 s.deposit_due_at AS "depositDueAt",s.deposit_confirmed_at AS "depositConfirmedAt",u.login AS "depositConfirmedBy",
 s.payment_instructions AS "paymentInstructions",s.cancelled_at AS "cancelledAt",s.cancellation_reason AS "cancellationReason",
 e.id AS "employeeId",ep.name AS "employeeName",e.user_id AS "employeeUserId",
 (SELECT json_agg(json_build_object('id',t.id,'name',st.treatment_name,'price',st.price::float)) FROM salon_schedule_treatments st JOIN salon_treatments t ON t.id=st.treatment_id WHERE st.schedule_id=s.id) AS treatments
 FROM salon_schedules s JOIN customers c ON c.id=s.customer_id JOIN persons p ON p.id=c.person_id
 JOIN salon_schedule_treatments first_t ON first_t.id=(SELECT min(id) FROM salon_schedule_treatments WHERE schedule_id=s.id)
 JOIN employees e ON e.id=first_t.employee_id JOIN persons ep ON ep.id=e.person_id LEFT JOIN app_users u ON u.id=s.deposit_confirmed_by`

export class BookingService {
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
  async settings() {
    return (await this.query(settingsSelect)).rows[0]
  }
  async updateSettings(data: z.infer<typeof SettingsSchema>) {
    await this.query(
      `UPDATE booking_settings SET enabled=$1,deposit_days=$2,deposit_type=$3,deposit_value=$4,payment_instructions=$5,short_notice_hours=$6,package_validity_months=$7 WHERE id=true`,
      [
        data.enabled,
        data.depositDays,
        data.depositType,
        data.depositValue,
        data.paymentInstructions,
        data.shortNoticeHours,
        data.packageValidityMonths,
      ],
    )
    return this.settings()
  }
  async register(data: z.infer<typeof RegistrationSchema>) {
    const password = await bcrypt.hash(data.password, 12)
    try {
      return await this.work.transaction(async (client) => {
        // Existing offline customer records are not claimed by providing their CPF alone.
        const existing = await client.query(
          "SELECT id FROM persons WHERE regexp_replace(cpf_cnpj,'[^0-9]','','g')=$1",
          [data.cpf],
        )
        if (existing.rows.length)
          bookingError(
            'This CPF is already registered. Contact the salon for assistance.',
            409,
          )
        const person = await client.query(
          'INSERT INTO persons(name,cpf_cnpj,is_pj,created_at,born_at) VALUES($1,$2,false,now(),$3) RETURNING id',
          [data.name, data.cpf, data.birthDate],
        )
        const customer = await client.query(
          'INSERT INTO customers(person_id,created_at) VALUES($1,now()) RETURNING id',
          [person.rows[0].id],
        )
        const account = await client.query(
          `INSERT INTO customer_accounts(customer_id,email,phone,password_hash) VALUES($1,$2,$3,$4) RETURNING id,customer_id AS "customerId",email,phone`,
          [customer.rows[0].id, data.email, data.phone, password],
        )
        return { ...account.rows[0], name: data.name }
      })
    } catch (error: any) {
      if (error.code === '23505')
        bookingError('CPF or email is already registered.', 409)
      throw error
    }
  }
  async login(email: string, password: string) {
    const row = (
      await this.query(
        `SELECT a.*,p.name FROM customer_accounts a JOIN customers c ON c.id=a.customer_id JOIN persons p ON p.id=c.person_id WHERE a.email=$1`,
        [email],
      )
    ).rows[0]
    // Constant-cost comparison also for unknown accounts.
    const hash =
      row?.password_hash ??
      '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYFzQWqgkYq8LN2P6s3JfO1YhW6Y7t5W'
    const valid = await bcrypt.compare(password, hash)
    if (!row || !valid) bookingError('Invalid email or password.', 401)
    return {
      id: row.id,
      customerId: row.customer_id,
      name: row.name,
      email: row.email,
      phone: row.phone,
    }
  }
  async createSession(accountId: number) {
    const token = randomBytes(32).toString('base64url')
    await this.query(
      `INSERT INTO customer_sessions(token_hash,account_id,expires_at) VALUES($1,$2,now()+interval '7 days')`,
      [digest(token), accountId],
    )
    return token
  }
  async session(token?: string) {
    if (!token || token.length > 128)
      bookingError('Customer authentication required.', 401)
    const row = (
      await this.query(
        `SELECT a.id,a.customer_id AS "customerId",a.email,a.phone,p.name FROM customer_sessions s JOIN customer_accounts a ON a.id=s.account_id JOIN customers c ON c.id=a.customer_id JOIN persons p ON p.id=c.person_id WHERE s.token_hash=$1 AND s.expires_at>now()`,
        [digest(token)],
      )
    ).rows[0]
    if (!row) bookingError('Customer session expired.', 401)
    return row
  }
  async logout(token?: string) {
    if (token)
      await this.query('DELETE FROM customer_sessions WHERE token_hash=$1', [
        digest(token),
      ])
  }
  async employees(publicOnly = false) {
    return (
      await this.query(
        `SELECT e.id,p.name,p.cpf_cnpj AS cpf,e.user_id AS "userId",u.email,e.is_active AS active,
      COALESCE((SELECT json_agg(treatment_id) FROM employee_salon_treatments WHERE employee_id=e.id),'[]') AS "treatmentIds",
      COALESCE((SELECT json_agg(json_build_object('weekday',weekday,'opensAt',opens_at,'closesAt',closes_at) ORDER BY weekday) FROM employee_booking_hours WHERE employee_id=e.id),'[]') AS hours
      FROM employees e JOIN persons p ON p.id=e.person_id JOIN app_users u ON u.id=e.user_id
      WHERE ($1=false OR (e.is_active AND u.is_active AND u.removed_at IS NULL AND EXISTS(SELECT 1 FROM employee_booking_hours h WHERE h.employee_id=e.id))) ORDER BY p.name`,
        [publicOnly],
      )
    ).rows
  }
  async saveEmployee(data: z.infer<typeof EmployeeSchema>, id?: number) {
    return this.work.transaction(async (client) => {
      // Same lock as booking creation prevents disabling/reassignment mid-reservation.
      if (id) await client.query('SELECT pg_advisory_xact_lock(70421,$1)', [id])
      const user = (
        await client.query(
          'SELECT id FROM app_users WHERE id=$1 AND is_active AND removed_at IS NULL FOR SHARE',
          [data.userId],
        )
      ).rows[0]
      if (!user) bookingError('Active salon user is required.')
      if (id) {
        const current = (
          await client.query(
            'SELECT person_id,user_id FROM employees WHERE id=$1 FOR UPDATE',
            [id],
          )
        ).rows[0]
        if (!current) bookingError('Employee not found.', 404)
        if (current.user_id !== data.userId)
          bookingError('Employee access cannot be reassigned.')
        await client.query(
          'UPDATE persons SET name=$1,updated_at=now() WHERE id=$2',
          [data.name, current.person_id],
        )
        await client.query(
          'UPDATE employees SET is_active=$1,updated_at=now() WHERE id=$2',
          [data.active, id],
        )
      } else {
        let person = (
          await client.query('SELECT id FROM persons WHERE cpf_cnpj=$1', [
            data.cpf,
          ])
        ).rows[0]
        if (!person)
          person = (
            await client.query(
              'INSERT INTO persons(name,cpf_cnpj,is_pj,created_at) VALUES($1,$2,false,now()) RETURNING id',
              [data.name, data.cpf],
            )
          ).rows[0]
        id = (
          await client.query(
            'INSERT INTO employees(person_id,user_id,is_active,created_at) VALUES($1,$2,$3,now()) RETURNING id',
            [person.id, data.userId, data.active],
          )
        ).rows[0].id
      }
      await client.query(
        'DELETE FROM employee_salon_treatments WHERE employee_id=$1',
        [id],
      )
      for (const treatmentId of new Set(data.treatmentIds)) {
        const result = await client.query(
          'INSERT INTO employee_salon_treatments(employee_id,treatment_id,created_at) SELECT $1,id,now() FROM salon_treatments WHERE id=$2 AND is_active',
          [id, treatmentId],
        )
        if (result.rowCount !== 1) bookingError('Invalid treatment.')
      }
      await client.query(
        'DELETE FROM employee_booking_hours WHERE employee_id=$1',
        [id],
      )
      for (const day of data.weekdays)
        await client.query(
          'INSERT INTO employee_booking_hours(employee_id,weekday,opens_at,closes_at) VALUES($1,$2,$3,$4)',
          [id, day, data.opensAt, data.closesAt],
        )
      return { id }
    })
  }
  async expire(client?: IGenericDatabaseClient) {
    const sql = `UPDATE salon_schedules SET status='cancelled',cancelled_at=now(),cancellation_reason='Deposit was not confirmed by the deadline.',updated_at=now() WHERE status='awaiting_deposit' AND deposit_due_at<=now() RETURNING id`
    return client ? client.query(sql, []) : this.query(sql)
  }
  async quote(
    employeeId: number,
    treatmentIds: number[],
    startsAt: string,
    client: IGenericDatabaseClient,
    staffDeadline?: string,
    options?: { ignoreScheduleId?: number; duration?: number },
  ) {
    const settings = (await client.query(settingsSelect, [])).rows[0]
    if (!settings.enabled && !staffDeadline && !options?.ignoreScheduleId)
      bookingError('Online booking is not available.', 409)
    const employee = (
      await client.query(
        `SELECT e.id FROM employees e JOIN app_users u ON u.id=e.user_id WHERE e.id=$1 AND e.is_active AND u.is_active AND u.removed_at IS NULL FOR SHARE OF e,u`,
        [employeeId],
      )
    ).rows[0]
    if (!employee) bookingError('Professional is unavailable.', 409)
    const treatments = (
      await client.query(
        `SELECT t.id,t.name,t.price::float AS price,t.duration_minutes AS duration FROM salon_treatments t JOIN employee_salon_treatments et ON et.treatment_id=t.id WHERE et.employee_id=$1 AND t.id=ANY($2::int[]) AND t.is_active ORDER BY t.id FOR SHARE OF t,et`,
        [employeeId, treatmentIds],
      )
    ).rows
    if (treatments.length !== treatmentIds.length)
      bookingError(
        'Professional is not qualified for the selected treatments.',
        409,
      )
    const duration =
      options?.duration ??
      treatments.reduce(
        (sum: number, t: { duration: number; price: number }) =>
          sum + t.duration,
        0,
      )
    if (duration <= 0 || duration > 720)
      bookingError('Invalid treatment duration.')
    const total =
      Math.round(
        treatments.reduce(
          (sum: number, t: { duration: number; price: number }) =>
            sum + t.price,
          0,
        ) * 100,
      ) / 100
    const deposit = Math.min(
      total,
      Math.round(
        (settings.depositType === 'percent'
          ? (total * settings.depositValue) / 100
          : settings.depositValue) * 100,
      ) / 100,
    )
    const timing = (
      await client.query(
        `SELECT $1::timestamptz AS start, $1::timestamptz+($2*interval '1 minute') AS finish,
      (((($1::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date-$3::int+1)::timestamp AT TIME ZONE 'America/Sao_Paulo')-interval '1 millisecond') AS deadline,
      now() AS now`,
        [startsAt, duration, settings.depositDays],
      )
    ).rows[0]
    const policy = customerDepositDeadline(
      timing.start,
      timing.deadline,
      timing.now,
      settings.shortNoticeHours,
    )
    const deadline = staffDeadline ? new Date(staffDeadline) : policy.deadline
    if (
      timing.start <= timing.now ||
      deadline <= timing.now ||
      deadline > timing.start ||
      (staffDeadline && deadline.getTime() === timing.start.getTime())
    )
      bookingError(
        'The deposit deadline must be in the future and no later than the appointment.',
        409,
      )
    const open = (
      await client.query(
        `SELECT 1 FROM employee_booking_hours WHERE employee_id=$1 AND weekday=extract(dow FROM $2::timestamptz AT TIME ZONE 'America/Sao_Paulo') AND ($2::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date=($3::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date AND opens_at<=($2::timestamptz AT TIME ZONE 'America/Sao_Paulo')::time AND closes_at>=($3::timestamptz AT TIME ZONE 'America/Sao_Paulo')::time AND extract(second FROM $2::timestamptz)=0 AND (extract(minute FROM $2::timestamptz)::int%15)=0`,
        [employeeId, startsAt, timing.finish],
      )
    ).rows.length
    if (!open)
      bookingError('This time is outside the professional working hours.', 409)
    const conflict = (
      await client.query(
        `SELECT 1 FROM salon_schedule_treatments t JOIN salon_schedules s ON s.id=t.schedule_id WHERE t.employee_id=$1 AND s.status<>'cancelled' AND s.id<>$4 AND s.schedule_started_at<$3 AND s.schedule_ended_at>$2 LIMIT 1`,
        [employeeId, startsAt, timing.finish, options?.ignoreScheduleId ?? 0],
      )
    ).rows.length
    if (conflict) bookingError('This time is no longer available.', 409)
    return {
      total,
      deposit,
      duration,
      deadline,
      shortNotice: !staffDeadline && policy.shortNotice,
      shortNoticeHours: settings.shortNoticeHours,
      quotedAt: timing.now,
      endsAt: timing.finish,
      instructions: settings.paymentInstructions,
      depositDays: settings.depositDays,
      treatments,
    }
  }
  async slots(
    employeeId: number,
    treatmentIds: number[],
    date: string,
    staffDeadline?: string,
    options?: { ignoreScheduleId?: number; duration?: number },
  ) {
    // Availability is advisory; creation revalidates under an exclusive professional lock.
    return this.work.transaction(async (client) => {
      await this.expire(client)
      const times = (
        await client.query(
          `SELECT to_char(slot AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS start FROM employee_booking_hours h CROSS JOIN LATERAL generate_series(($2::date+h.opens_at) AT TIME ZONE 'America/Sao_Paulo',($2::date+h.closes_at) AT TIME ZONE 'America/Sao_Paulo',interval '15 minutes') slot WHERE h.employee_id=$1 AND h.weekday=extract(dow FROM $2::date)`,
          [employeeId, date],
        )
      ).rows
      const result = []
      for (const time of times) {
        try {
          result.push({
            startsAt: time.start,
            ...(await this.quote(
              employeeId,
              treatmentIds,
              time.start,
              client,
              staffDeadline,
              options,
            )),
          })
        } catch (error: any) {
          if (error.statusCode !== 409) throw error
        }
      }
      return result
    })
  }
  async create(
    data: z.infer<typeof BookingSchema>,
    account: { id: number; customerId: number },
    staffDeadline?: string,
    existingClient?: IGenericDatabaseClient,
    linked = false,
  ) {
    const fingerprint = digest(
      JSON.stringify({
        employeeId: data.employeeId,
        treatmentIds: [...data.treatmentIds].sort((a, b) => a - b),
        startsAt: new Date(data.startsAt).toISOString(),
        staffDeadline: staffDeadline ?? null,
      }),
    )
    try {
      const create = async (client: IGenericDatabaseClient) => {
        await client.query('SELECT pg_advisory_xact_lock_shared(70440,1)', [])
        await client.query('SELECT pg_advisory_xact_lock(70422,$1)', [
          account.id,
        ])
        const existing = (
          await client.query(
            'SELECT id,request_fingerprint FROM salon_schedules WHERE booking_account_id=$1 AND request_key=$2',
            [account.id, data.requestKey],
          )
        ).rows[0]
        if (existing) {
          if (existing.request_fingerprint !== fingerprint)
            bookingError(
              'Request key was already used for a different reservation.',
              409,
            )
          return this.get(existing.id, client)
        }
        if (!linked) await assertIndependent(client, data.treatmentIds)
        await client.query('SELECT pg_advisory_xact_lock(70421,$1)', [
          data.employeeId,
        ])
        await this.expire(client)
        const quote = await this.quote(
          data.employeeId,
          data.treatmentIds,
          data.startsAt,
          client,
          staffDeadline,
        )
        const reviewedDeadline = new Date(data.expectedDeadline)
        // Keep the deadline the customer reviewed; reject stale quotes rather than
        // extending a pending reservation every time the request is retried.
        const deadlineMatches = quote.shortNotice
          ? reviewedDeadline > quote.quotedAt &&
            reviewedDeadline <= quote.deadline &&
            quote.deadline.getTime() - reviewedDeadline.getTime() <= 15 * 60000
          : quote.deadline.getTime() === reviewedDeadline.getTime()
        if (
          quote.total !== data.expectedTotal ||
          quote.deposit !== data.expectedDeposit ||
          !deadlineMatches ||
          quote.instructions !== data.expectedInstructions
        )
          bookingError(
            'Booking conditions changed. Review the reservation again.',
            409,
          )
        const schedule = (
          await client.query(
            `INSERT INTO salon_schedules(customer_id,booking_account_id,request_key,request_fingerprint,schedule_started_at,schedule_ended_at,no_treatments,status,total_price,deposit_required,deposit_due_at,payment_instructions,deposit_days,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,'awaiting_deposit',$8,$9,$10,$11,$12,now()) RETURNING id`,
            [
              account.customerId,
              account.id,
              data.requestKey,
              fingerprint,
              data.startsAt,
              quote.endsAt,
              quote.treatments.length,
              quote.total,
              quote.deposit,
              reviewedDeadline,
              quote.instructions,
              quote.depositDays,
            ],
          )
        ).rows[0]
        for (const treatment of quote.treatments)
          await client.query(
            'INSERT INTO salon_schedule_treatments(employee_id,schedule_id,treatment_id,price) VALUES($1,$2,$3,$4)',
            [data.employeeId, schedule.id, treatment.id, treatment.price],
          )
        return this.get(schedule.id, client)
      }
      return existingClient
        ? await create(existingClient)
        : await this.work.transaction(create)
    } catch (error: any) {
      if (error.code === '23P01')
        bookingError('This time is no longer available.', 409)
      throw error
    }
  }
  async get(id: number, client?: IGenericDatabaseClient) {
    const result = client
      ? await client.query(`${bookingSelect} WHERE s.id=$1`, [id])
      : await this.query(`${bookingSelect} WHERE s.id=$1`, [id])
    return result.rows[0]
  }
  async customerBookings(accountId: number) {
    const result = await this.query(
      `${bookingSelect} WHERE s.booking_account_id=$1 ORDER BY s.schedule_started_at DESC LIMIT 100`,
      [accountId],
    )
    return result.rows.map(
      ({ employeeUserId, ...booking }: Record<string, unknown>) => booking,
    )
  }
  async confirm(id: number, actor: AppUser, amount: number) {
    const result = await this.work.transaction(async (client) => {
      const row = (
        await client.query(
          `SELECT s.*,e.user_id,e.is_active AS employee_active FROM salon_schedules s JOIN salon_schedule_treatments t ON t.id=(SELECT min(id) FROM salon_schedule_treatments WHERE schedule_id=s.id) JOIN employees e ON e.id=t.employee_id WHERE s.id=$1 FOR UPDATE OF s`,
          [id],
        )
      ).rows[0]
      if (!row) bookingError('Booking not found.', 404)
      if (
        !salonWide(actor) &&
        (row.user_id !== actor.id || !row.employee_active)
      )
        bookingError(
          'Only the responsible professional, ADMIN or MASTER can confirm this deposit.',
          403,
        )
      if (
        !salonWide(actor) &&
        (
          await client.query(
            'SELECT 1 FROM salon_schedule_treatments st JOIN employees e ON e.id=st.employee_id WHERE st.schedule_id=$1 AND e.user_id<>$2',
            [id, actor.id],
          )
        ).rows.length
      )
        bookingError(
          'Shared appointments require an administrator to confirm deposits.',
          403,
        )
      if (row.status === 'confirmed' && row.deposit_confirmed_at) return { id }
      if (row.status !== 'awaiting_deposit')
        bookingError('This reservation is not awaiting a deposit.', 409)
      const deadline = (
        await client.query(
          'SELECT $1::timestamptz<=clock_timestamp() AS expired',
          [row.deposit_due_at],
        )
      ).rows[0].expired
      if (deadline) {
        await client.query(
          `UPDATE salon_schedules SET status='cancelled',cancelled_at=now(),cancellation_reason='Deposit was not confirmed by the deadline.',updated_at=now() WHERE id=$1`,
          [id],
        )
        return { expired: true }
      }
      if (
        amount < Number(row.deposit_required) ||
        amount > Number(row.total_price)
      )
        bookingError(
          'Deposit must cover the required amount and cannot exceed the agreed total.',
        )
      await client.query(
        `UPDATE salon_schedules SET status='confirmed',deposit_received=$2,deposit_confirmed_at=now(),deposit_confirmed_by=$3,updated_at=now() WHERE id=$1`,
        [id, amount, actor.id],
      )
      await recordDeposit(client, id, amount, actor.id)
      return { id }
    })
    if (result.expired)
      bookingError(
        'The deposit deadline has passed and this reservation was cancelled.',
        409,
      )
    return this.get(id)
  }
}
