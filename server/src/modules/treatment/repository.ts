import {
  databaseServiceId,
  IDatabaseService,
  IGenericDatabaseClient,
} from '@/core/db'
import { ITreatmentRepository, TreatmentCreate } from '@/core/treatment'
import { inject, injectable } from 'inversify'

@injectable()
export class TreatmentRepository implements ITreatmentRepository {
  public constructor(
    @inject(databaseServiceId)
    private readonly dbService: IDatabaseService,
  ) {}

  public async getAll(page: number): Promise<any> {
    const limit: number = 20
    const offset: number = page * (limit - 1)

    const query: string = `
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
      LIMIT $1
      OFFSET $2;
    `

    return this.dbService
      .getClient()
      .then((client) =>
        client.query(query, [limit, offset]).finally(() => client.release()),
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

  public async changeIsActive(
    treatmentId: number,
    isActive: boolean,
    client: IGenericDatabaseClient,
  ): Promise<any> {
    const query: string = `
      UPDATE salon_treatments
      SET is_active = $1
      WHERE
        id = $2;
    `

    return client.query(query, [isActive, treatmentId])
  }
}
