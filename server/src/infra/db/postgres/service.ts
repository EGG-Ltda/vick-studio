import {
  databaseServiceId,
  IDatabaseService,
  IDatabaseUnitOfWork,
  IGenericDatabaseClient,
} from '@/core/db'
import { inject, injectable } from 'inversify'
import { Pool, PoolClient } from 'pg'

@injectable()
export class PostgresService implements IDatabaseService {
  private readonly pool: Pool

  public constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_CONNECTION_STRING,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    })
  }

  public async getClient(): Promise<IGenericDatabaseClient> {
    const client: PoolClient = await this.pool.connect()
    return new PostgresDatabaseClient(client)
  }
}

enum PostgresClientState {
  IDLE = 0,
  TRANSACTION_STARTED = 1,
  COMMITTED = 2,
  ROLLBACK = 3,
  RELEASED = 4,
}

export class PostgresDatabaseClient implements IGenericDatabaseClient {
  private state: PostgresClientState = PostgresClientState.IDLE

  public constructor(private client: PoolClient) {}

  public async beginTransaction(): Promise<void> {
    if (this.state > PostgresClientState.IDLE) {
      throw new Error('Transaction already started')
    }

    await this.client.query('BEGIN')
    this.state = PostgresClientState.TRANSACTION_STARTED
  }

  public async commit(): Promise<void> {
    if (this.state > PostgresClientState.TRANSACTION_STARTED) {
      throw new Error('Cannot commit without an active transaction')
    }

    await this.client.query('COMMIT')
    this.state = PostgresClientState.COMMITTED
  }

  public async rollback(): Promise<void> {
    if (this.state > PostgresClientState.TRANSACTION_STARTED) {
      throw new Error('Cannot rollback without an active transaction')
    }

    await this.client.query('ROLLBACK')
    this.state = PostgresClientState.ROLLBACK
  }

  public async query(query: string, params: any[]): Promise<any> {
    return this.client.query(query, params)
  }

  public release(): void {
    if (this.state === PostgresClientState.RELEASED) {
      throw new Error('Client already released')
    }

    if (this.state === PostgresClientState.TRANSACTION_STARTED) {
      throw new Error(
        'Transaction must be committed or rolled back before release',
      )
    }

    this.client.release()
    this.state = PostgresClientState.RELEASED
  }
}

@injectable()
export class PostgresUnitOfWork implements IDatabaseUnitOfWork {
  constructor(
    @inject(databaseServiceId)
    private readonly dbService: IDatabaseService,
  ) {}

  public async transaction<T>(
    work: (client: IGenericDatabaseClient) => Promise<T>,
  ): Promise<T> {
    const client: IGenericDatabaseClient = await this.dbService.getClient()

    try {
      await client.beginTransaction()
      const result: T = await work(client)
      await client.commit()

      return result
    } catch (e) {
      await client.rollback()
      throw e
    } finally {
      client.release()
    }
  }
}
