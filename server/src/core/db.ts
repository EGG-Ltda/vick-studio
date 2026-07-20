import { ServiceIdentifier } from 'inversify'

export interface IGenericDatabaseClient {
  beginTransaction(): Promise<void>
  commit(): Promise<void>
  rollback(): Promise<void>
  query(query: string, params: any[]): Promise<any>
  release(): void
}

export interface IDatabaseService {
  getClient(): Promise<IGenericDatabaseClient>
}

export interface IDatabaseUnitOfWork {
  transaction<T>(
    work: (client: IGenericDatabaseClient) => Promise<T>
  ): Promise<T>
}

export const databaseServiceId: ServiceIdentifier<IDatabaseService> =
  Symbol.for('DatabaseServiceId')
export const unitOfWorkServiceId: ServiceIdentifier<IDatabaseUnitOfWork> =
  Symbol.for('DatabaseUnitOfWorkId')
