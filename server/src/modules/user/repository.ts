import {
  databaseServiceId,
  IDatabaseService,
  IGenericDatabaseClient,
} from '@/core/db'
import {
  AppUserCreate,
  AppUserUpdate,
  AppUserSchema,
  IUserRepository,
  USER_PAGE_SIZE,
} from '@/core/user'
import { MASTER_USER_ID } from '@/core/config'
import { inject, injectable } from 'inversify'

@injectable()
export class UserRepository implements IUserRepository {
  public constructor(
    @inject(databaseServiceId)
    private readonly dbService: IDatabaseService,
  ) {}

  public async getAll(
    page: number,
    hideDisabled = false,
    operationalOnly = false,
  ): Promise<any> {
    const limit: number = USER_PAGE_SIZE
    const offset: number = page * limit

    const query: string = `
      SELECT
        id,
        login,
        hash_password AS "hashPassword",
        email,
        is_active AS "isActive",
        role,is_admin AS "isAdmin", must_change_password AS "mustChangePassword", password_version AS "passwordVersion",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        removed_at AS "removedAt"
      FROM app_users
      WHERE ($3::boolean = false OR (is_active = TRUE AND removed_at IS NULL)) AND (NOT $4::boolean OR (role='OPERATIONAL' AND id<>$5))
      ORDER BY id
      LIMIT $1
      OFFSET $2;
    `

    return this.dbService
      .getClient()
      .then((client) =>
        client
          .query(query, [
            limit + 1,
            offset,
            hideDisabled,
            operationalOnly,
            MASTER_USER_ID,
          ])
          .finally(() => client.release()),
      )
      .then((result) => result.rows)
  }

  public async getById(id: number): Promise<any> {
    const query: string = `
      SELECT
        id,
        login,
        hash_password AS "hashPassword",
        email,
        is_active AS "isActive",
        role,is_admin AS "isAdmin", must_change_password AS "mustChangePassword", password_version AS "passwordVersion",
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
        role,is_admin AS "isAdmin", must_change_password AS "mustChangePassword", password_version AS "passwordVersion",
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
      INSERT INTO app_users (login, email, hash_password, role, is_active, must_change_password, created_at)
      VALUES ($1, $2, $3, $4, $5, true, NOW())
      RETURNING
        id,
        login,
        email,
        is_active AS "isActive",
        role,is_admin AS "isAdmin", must_change_password AS "mustChangePassword", password_version AS "passwordVersion",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        removed_at AS "removedAt";
    `

    return client
      .query(query, [
        user.login,
        user.email,
        user.password,
        user.role === 'DISABLED' ? 'OPERATIONAL' : user.role,
        user.role !== 'DISABLED',
      ])
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
        role,is_admin AS "isAdmin", must_change_password AS "mustChangePassword", password_version AS "passwordVersion",
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
  public async enable(
    userId: number,
    client: IGenericDatabaseClient,
  ): Promise<boolean> {
    const result = await client.query(
      `
      UPDATE app_users SET is_active = TRUE, removed_at = NULL, updated_at = NOW()
      WHERE id = $1;
    `,
      [userId],
    )
    return result.rowCount > 0
  }

  public async replacePassword(
    userId: number,
    expectedVersion: number,
    hash: string,
    mustChangePassword: boolean,
    client: IGenericDatabaseClient,
  ) {
    const result = await client.query(
      `
      UPDATE app_users
      SET hash_password = $3, must_change_password = $4,
          password_version = password_version + 1, updated_at = NOW()
      WHERE id = $1 AND password_version = $2
        AND is_active = true AND removed_at IS NULL
      RETURNING id, login, email, is_active AS "isActive", role,is_admin AS "isAdmin",
        must_change_password AS "mustChangePassword", password_version AS "passwordVersion",
        created_at AS "createdAt", updated_at AS "updatedAt", removed_at AS "removedAt";
    `,
      [userId, expectedVersion, hash, mustChangePassword],
    )
    return result.rows[0] ? AppUserSchema.parse(result.rows[0]) : null
  }
}
