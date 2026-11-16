import { databaseServiceId, IDatabaseService, IGenericDatabaseClient } from '@/core/db'
import { IScheduleRepository, Schedule, ScheduleCreate, ScheduleSchema } from '@/core/schedule'
import { inject, injectable } from 'inversify'

@injectable()
export class ScheduleRepository implements IScheduleRepository {
  public constructor(
    @inject(databaseServiceId) private readonly dbService: IDatabaseService,
  ) {}

  async options() {
    const client = await this.dbService.getClient()
    try {
      const employees = await client.query('SELECT e.id,p.name FROM employees e JOIN persons p ON p.id=e.person_id ORDER BY p.name',[])
      const customers = await client.query('SELECT c.id,p.name FROM customers c JOIN persons p ON p.id=c.person_id ORDER BY p.name',[])
      const treatments = await client.query('SELECT id,name,duration_minutes AS duration FROM salon_treatments WHERE is_active ORDER BY name',[])
      return {employees:employees.rows,customers:customers.rows,treatments:treatments.rows}
    } finally { client.release() }
  }

  public async list(start: Date, end: Date, providedClient?: IGenericDatabaseClient): Promise<Schedule[]> {
    const client = providedClient ?? (await this.dbService.getClient())
    const query = `
      SELECT
        schedule_services.id,
        schedules.id AS "scheduleId",
        schedules.customer_id AS "customerId",
        customer_person.name AS "customerName",
        schedule_services.employee_id AS "employeeId",
        employee_person.name AS "employeeName",
        services.id AS "serviceId",
        services.name AS "serviceName",
        schedules.schedule_started_at AS "startsAt",
        schedules.schedule_ended_at AS "endsAt",
        CASE WHEN completion.status = 'completed' THEN 'completed'
          WHEN completion.status IN ('cancelled','reversed') THEN 'cancelled' ELSE 'scheduled' END AS status
      FROM salon_schedules schedules
      JOIN customers customers ON customers.id = schedules.customer_id
      JOIN persons customer_person ON customer_person.id = customers.person_id
      JOIN salon_schedule_treatments schedule_services ON schedule_services.schedule_id = schedules.id
      LEFT JOIN finance_treatment_records completion ON completion.schedule_item_id = schedule_services.id
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

  public async create(data: ScheduleCreate, client: IGenericDatabaseClient): Promise<Schedule> {
    const scheduleResult = await client.query(
      `
        INSERT INTO salon_schedules
          (customer_id, schedule_started_at, schedule_ended_at, no_treatments, created_at)
        VALUES ($1, $2, $3, 1, NOW())
        RETURNING id;
      `,
      [data.customerId, data.startsAt, data.endsAt],
    )
    const scheduleId = scheduleResult.rows[0].id as number

    const serviceResult = await client.query(
      `
        INSERT INTO salon_schedule_treatments (employee_id, schedule_id, treatment_id, price)
        SELECT $1, $2, id, price FROM salon_treatments WHERE id = $3 AND is_active;
      `,
      [data.employeeId, scheduleId, data.serviceId],
    )
    if (serviceResult.rowCount !== 1) {
      throw new Error('Service not found')
    }

    const created = await this.list(data.startsAt, data.endsAt, client)
    const result = created.find((schedule) => schedule.scheduleId === scheduleId)
    if (!result) throw new Error('Schedule could not be created')
    return result
  }
}
