import { IDatabaseUnitOfWork, unitOfWorkServiceId } from '@/core/db'
import {
  ISalonTxRepository,
  ISalonTxService,
  SalonTx,
  SalonTxCreate,
  salonTxRepositoryId,
  SalonTxSchema,
} from '@/core/transactions'
import { inject, injectable } from 'inversify'
import z from 'zod'

@injectable()
export class SalonTxService implements ISalonTxService {
  public constructor(
    @inject(unitOfWorkServiceId)
    private readonly work: IDatabaseUnitOfWork,
    @inject(salonTxRepositoryId)
    private readonly saloRepo: ISalonTxRepository,
  ) {}

  public async getAll(page: number): Promise<SalonTx[]> {
    return this.saloRepo
      .getAll(page)
      .then((rows) => z.array(SalonTxSchema).parse(rows))
  }

  public async create(data: SalonTxCreate): Promise<SalonTx> {
    return this.work.transaction<SalonTx>((client) =>
      this.saloRepo
        .create(data, client)
        .then((row) => ({
          id: row.id,
          isDebit: row.isDebit,
          description: row.description,
          value: row.value,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,

          methodId: row.methodId,
          method: {
            id: row.methodId,
            name: row.methodName,
            description: row.methodDescription,
            createdAt: row.methodCreatedAt,
            updatedAt: row.methodUpdatedAt,
            removedAt: row.methodRemovedAt,
          },

          typeId: row.typeId,
          type: {
            id: row.typeId,
            name: row.typeName,
            description: row.typeDescription,
            createdAt: row.typeCreatedAt,
            updatedAt: row.typeUpdatedAt,
          },
        }))
        .then((result) => SalonTxSchema.parse(result)),
    )
  }
}
