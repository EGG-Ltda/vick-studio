import {
  databaseServiceId,
  IDatabaseService,
  IGenericDatabaseClient,
} from '@/core/db'
import { AppUserCreate, IUserRepository } from '@/core/user'
import { inject, injectable } from 'inversify'

@injectable()
export class UserRepository implements IUserRepository {
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
        login,
        hash_password AS "hashPassword",
        email,
        is_active AS "isActive",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        removed_at AS "removedAt"
      FROM app_users
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

  public async getById(id: number): Promise<any> {
    // const query: string = `
    //   SELECT
    //     id,
    //     email,
    //     is_active AS "isActive",
    //     created_at AS "createdAt",
    //     updated_at AS "updatedAt"
    //   FROM app_users
    //   WHERE
    //     id = $1;
    // `
    // return this.dbService
    //   .getClient()
    //   .then((client) =>
    //     client.query(query, [id]).finally(() => client.release()),
    //   )
    //   .then((result) => result.rows[0])
  }

  public async getByLoginWithPassword(login: string): Promise<any> {
    const query: string = `
      SELECT
        id,
        login,
        hash_password AS "hashPassword",
        email,
        is_active AS "isActive",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        removed_at AS "removedAt"
      FROM app_users
      WHERE
        login = $1 OR email = $1;
    `

    return this.dbService
      .getClient()
      .then((client) =>
        client.query(query, [login]).finally(() => client.release()),
      )
      .then((result) => result.rows[0])
  }

  public async create(
    user: AppUserCreate,
    client: IGenericDatabaseClient,
  ): Promise<any> {
    const query: string = `
      INSERT INTO app_users (login, email, password, is_active, created_at)
      VALUES ($1, $2, $3, true, NOW())
      RETURNING
        id,
        login,
        email,
        is_active AS "isActive",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        removed_at AS "removedAt";
    `
    return client
      .query(query, [user.login, user.email, user.password])
      .then((result) => result.rows[0])
  }

  public async update(
    id: number,
    email: string,
    client: IGenericDatabaseClient,
  ): Promise<any> {
    // const query: string = `
    //   UPDATE app_users
    //   SET
    //     email = $1,
    //     updated_at = NOW()
    //   WHERE
    //     id = $2
    //   RETURNING *;
    // `
    // return client
    //   .query(query, [email, id])
    //   .then((result) => result.rows[0])
    //   .then((row) => ({
    //     id: row.id,
    //     email: row.email,
    //     isActive: row.is_active,
    //     createdAt: row.created_at,
    //     updatedAt: row.updated_at,
    //   }))
  }

  public async delete(
    id: number,
    client: IGenericDatabaseClient,
  ): Promise<void> {
    // await client.query(`DELETE FROM app_users WHERE id = $1;`, [id])
  }
}
