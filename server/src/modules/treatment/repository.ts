import {
  databaseServiceId,
  IDatabaseService,
  IGenericDatabaseClient,
} from '@/core/db'
import {
  GetTreatmentsOptions,
  ITreatmentRepository,
  TreatmentCreate,
  TreatmentUpdate,
} from '@/core/treatment'
import { inject, injectable } from 'inversify'

@injectable()
export class TreatmentRepository implements ITreatmentRepository {
  public constructor(
    @inject(databaseServiceId)
    private readonly dbService: IDatabaseService,
  ) {}

  public async get(options: GetTreatmentsOptions): Promise<any> {
    const params: any[] = []
    const limit: number = 20
    const offset: number = options.page * (limit - 1)

    let query: string = `
      SELECT
        id,
        name,
        description,
        price,
        duration_minutes AS "durationMinutes",
        is_active AS "isActive",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM salon_treatments
    `

    if (options?.filters?.isActive !== undefined) {
      params.push(options.filters.isActive)
      query += `
        WHERE
          is_active = $1
      `
    }

    params.push(limit, offset)
    query += `
      LIMIT $2
      OFFSET $3;
    `

    return this.dbService
      .getClient()
      .then((client) =>
        client.query(query, params).finally(() => client.release()),
      )
      .then((result) => result.rows)
  }

  public async create(
    data: TreatmentCreate,
    client: IGenericDatabaseClient,
  ): Promise<any> {
    const query: string = `
      INSERT INTO salon_treatments (
        name, description, price,
        duration_minutes, is_active, created_at
      )
      VALUES ($1, $2, $3, $4, $5, true, NOW())
      RETURNING
        id,
        name,
        description,
        price,
        duration_minutes AS "durationMinutes",
        is_active AS "isActive",
        created_at AS "createdAt",
        updated_at AS "updatedAt";
    `
    return client
      .query(query, [
        data.name,
        data.description,
        data.price,
        data.durationMinutes,
      ])
      .then((result) => result.rows[0])
  }

  public async update(
    data: TreatmentUpdate,
    client: IGenericDatabaseClient,
  ): Promise<any> {
    const query: string = `
      UPDATE salon_treatments
      SET
        name = $1,
        description = $2,
        price = $3,
        duration_minutes = $4,
        is_active = $5,
        updated_at = NOW()
      WHERE
        id = $6
      RETURNING
        id,
        name,
        description,
        price,
        duration_minutes AS "durationMinutes",
        is_active AS "isActive",
        created_at AS "createdAt",
        updated_at AS "updatedAt";
    `

    return client.query(query, [
      data.name,
      data.description,
      data.price,
      data.durationMinutes,
      data.isActive,
      data.id,
    ])
  }
}
