import {
  databaseServiceId,
  IDatabaseService,
  IGenericDatabaseClient,
} from '@/core/db'
import { AppUserCreate, AppUserUpdate, IUserRepository, USER_PAGE_SIZE } from '@/core/user'
import { inject, injectable } from 'inversify'

@injectable()
export class UserRepository implements IUserRepository {
  public constructor(
    @inject(databaseServiceId)
    private readonly dbService: IDatabaseService,
  ) {}

  public async getAll(page: number, hideDisabled = false): Promise<any> {
    const limit: number = USER_PAGE_SIZE
    const offset: number = page * limit

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
      WHERE ($3::boolean = false OR (is_active = TRUE AND removed_at IS NULL))
      ORDER BY id
      LIMIT $1
      OFFSET $2;
    `

    return this.dbService
      .getClient()
      .then((client) =>
        client.query(query, [limit + 1, offset, hideDisabled]).finally(() => client.release()),
      )
      .then((result) => result.rows)
  }

  public async getById(id: number): Promise<any> {
    const query: string = `
      SELECT
        id,
        login,
        email,
        is_active AS "isActive",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        removed_at AS "removedAt"
      FROM app_users
      WHERE
        id = $1;
    `
    return this.dbService
      .getClient()
      .then((client) =>
        client.query(query, [id]).finally(() => client.release()),
      )
      .then((result) => result.rows[0])
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
      INSERT INTO app_users (login, email, hash_password, is_active, created_at)
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
    data: AppUserUpdate,
    client: IGenericDatabaseClient,
  ): Promise<any> {
    const query: string = `
      UPDATE app_users
      SET
        login = $1,
        email = $2,
        updated_at = NOW()
      WHERE
        id = $3
      RETURNING id,
        login,
        email,
        is_active AS "isActive",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        removed_at AS "removedAt";
    `

    return client
      .query(query, [data.login, data.email, data.id])
      .then((result) => result.rows[0])
  }

  public async disable(
    userId: number,
    client: IGenericDatabaseClient,
  ): Promise<boolean> {
    const query: string = `
      UPDATE app_users
      SET
        is_active = FALSE,
        updated_at = NOW(),
        removed_at = NOW()
      WHERE
        id = $1;
    `

    const result = await client.query(query, [userId])
    return result.rowCount > 0
  }
  public async enable(userId: number, client: IGenericDatabaseClient): Promise<boolean> {
    const result = await client.query(`
      UPDATE app_users SET is_active = TRUE, removed_at = NULL, updated_at = NOW()
      WHERE id = $1;
    `, [userId])
    return result.rowCount > 0
  }
}
