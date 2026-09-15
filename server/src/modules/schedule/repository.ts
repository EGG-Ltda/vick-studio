import { databaseServiceId, IDatabaseService, IGenericDatabaseClient } from '@/core/db'
import { IScheduleRepository, Schedule, ScheduleCreate, ScheduleSchema } from '@/core/schedule'
import { inject, injectable } from 'inversify'

@injectable()
export class ScheduleRepository implements IScheduleRepository {
  public constructor(
    @inject(databaseServiceId) private readonly dbService: IDatabaseService,
  ) {}

  public async list(start: Date, end: Date, providedClient?: IGenericDatabaseClient): Promise<Schedule[]> {
    const client = providedClient ?? (await this.dbService.getClient())
    const query = `
      SELECT
        schedules.id,
        schedules.customer_id AS "customerId",
        customer_person.name AS "customerName",
        schedules.employee_id AS "employeeId",
        employee_person.name AS "employeeName",
        services.id AS "serviceId",
        services.name AS "serviceName",
        schedules.schedule_started_at AS "startsAt",
        schedules.schedule_ended_at AS "endsAt",
        'scheduled' AS status
      FROM salon_schedules schedules
      JOIN customers customers ON customers.id = schedules.customer_id
      JOIN persons customer_person ON customer_person.id = customers.person_id
      JOIN salon_schedule_services schedule_services ON schedule_services.schedule_id = schedules.id
      JOIN employees employees ON employees.id = schedule_services.employee_id
      JOIN persons employee_person ON employee_person.id = employees.person_id
      JOIN salon_services services ON services.id = schedule_services.service_id
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

  public async create(data: ScheduleCreate, client: IGenericDatabaseClient): Promise<Schedule> {
    const scheduleResult = await client.query(
      `
        INSERT INTO salon_schedules
          (customer_id, schedule_started_at, schedule_ended_at, no_services, created_at)
        VALUES ($1, $2, $3, 1, NOW())
        RETURNING id;
      `,
      [data.customerId, data.startsAt, data.endsAt],
    )
    const scheduleId = scheduleResult.rows[0].id as number

    const serviceResult = await client.query(
      `
        INSERT INTO salon_schedule_services (employee_id, schedule_id, service_id, price)
        SELECT $1, $2, id, price FROM salon_services WHERE id = $3;
      `,
      [data.employeeId, scheduleId, data.serviceId],
    )
    if (serviceResult.rowCount !== 1) {
      throw new Error('Service not found')
    }

    const created = await this.list(data.startsAt, data.endsAt, client)
    const result = created.find((schedule) => schedule.id === scheduleId)
    if (!result) throw new Error('Schedule could not be created')
    return result
  }
}