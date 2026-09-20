import {
  databaseServiceId,
  IDatabaseService,
  IGenericDatabaseClient,
} from '@/core/db'
import { ISalonTxRepository, SalonTxCreate } from '@/core/transactions'
import { inject, injectable } from 'inversify'

@injectable()
export class SalonTxRepository implements ISalonTxRepository {
  public constructor(
    @inject(databaseServiceId)
    private readonly dbService: IDatabaseService,
  ) {}

  public async getAll(page: number): Promise<any> {
    const limit: number = 20
    const offset: number = page * (limit - 1)

    const query: string = `
      SELECT
        tx.id,
        tx.is_debit AS "isDebit",
        tx.description,
        tx.value,
        tx.created_at AS "createdAt",
        tx.updated_at AS "updatedAt",

        method.id AS "methodId",
        method.name AS "methodName",
        method.description AS "methodDescription",
        method.created_at AS "methodCreatedAt",
        method.updated_at AS "methodUpdatedAt",
        method.removed_at AS "methodRemovedAt",

        type.id AS "typeId",
        type.name AS "typeName",
        type.description AS "typeDescription",
        type.created_at AS "typeCreatedAt",
        type.updated_at AS "typeUpdatedAt"
      FROM salon_transactions AS tx
      JOIN transaction_types AS type
        ON tx.type_id = type.id
      JOIN payment_methods AS method
        ON tx.method_id = method.id
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
    data: SalonTxCreate,
    client: IGenericDatabaseClient,
  ): Promise<any> {
    const query: string = `
      INSERT INTO app_users (method_id, type_id, is_debit, description, value, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING
        id,
        method_id AS "methodId",
        type_id AS "typeId",
        is_debit AS "isDebit",
        description,
        value,
        created_at AS "createdAt",
        updated_at AS "updatedAt";
    `
    return client
      .query(query, [
        data.methodId,
        data.typeId,
        data.isDebit,
        data.description,
        data.value,
      ])
      .then((result) => result.rows[0])
  }
}
