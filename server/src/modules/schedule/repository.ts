import {
  databaseServiceId,
  IDatabaseService,
  IGenericDatabaseClient,
} from '@/core/db'
import {
  IScheduleRepository,
  Schedule,
  ScheduleCreate,
  ScheduleSchema,
} from '@/core/schedule'
import { inject, injectable } from 'inversify'

@injectable()
export class ScheduleRepository implements IScheduleRepository {
  public constructor(
    @inject(databaseServiceId) private readonly dbService: IDatabaseService,
  ) {}

  public async list(
    start: Date,
    end: Date,
    providedClient?: IGenericDatabaseClient,
  ): Promise<Schedule[]> {
    const client = providedClient ?? (await this.dbService.getClient())
    const query = `
      SELECT
        schedules.id,
        (SELECT group_id FROM booking_group_members WHERE schedule_id=schedules.id) AS "groupId",
        schedules.customer_id AS "customerId",
        customer_person.name AS "customerName",
        employees.id AS "employeeId",
        employees.user_id AS "employeeUserId",
        employee_person.name AS "employeeName",
        services.id AS "serviceId",
        schedule_services.treatment_name AS "serviceName",
        schedules.schedule_started_at AS "startsAt",
        schedules.schedule_ended_at AS "endsAt",
        schedules.status AS status,
        schedules.deposit_due_at AS "depositDueAt",
        schedules.deposit_required::float AS "depositRequired",
        schedules.deposit_confirmed_at AS "depositConfirmedAt",
        schedules.cancellation_reason AS "cancellationReason"
      FROM salon_schedules schedules
      JOIN customers customers ON customers.id = schedules.customer_id
      JOIN persons customer_person ON customer_person.id = customers.person_id
      JOIN salon_schedule_treatments schedule_services ON schedule_services.schedule_id = schedules.id
      JOIN employees employees ON employees.id = schedule_services.employee_id
      JOIN persons employee_person ON employee_person.id = employees.person_id
      JOIN salon_treatments services ON services.id = schedule_services.treatment_id
      WHERE schedules.schedule_started_at < $2
        AND schedules.schedule_ended_at > $1
      ORDER BY schedules.schedule_started_at ASC;
    `

    try {
      const result = await client.query(query, [start, end])
      return result.rows.map((row: unknown) => ScheduleSchema.parse(row))
    } finally {
      if (!providedClient) client.release()
    }
  }

  public async create(
    data: ScheduleCreate,
    client: IGenericDatabaseClient,
  ): Promise<Schedule> {
    throw Object.assign(
      new Error('Use the staff booking flow with a specific deposit deadline.'),
      { statusCode: 409 },
    )
  }
}
