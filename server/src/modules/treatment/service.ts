import { IDatabaseUnitOfWork, unitOfWorkServiceId } from '@/core/db'
import {
  ITreatmentRepository,
  ITreatmentService,
  Treatment,
  TreatmentCreate,
  treatmentRepositoryId,
  TreatmentSchema,
} from '@/core/treatment'
import { inject, injectable } from 'inversify'
import z from 'zod'

@injectable()
export class TreatmentService implements ITreatmentService {
  public constructor(
    @inject(unitOfWorkServiceId)
    private readonly work: IDatabaseUnitOfWork,
    @inject(treatmentRepositoryId)
    private readonly treatmentRepo: ITreatmentRepository,
  ) {}

  public async getAll(page: number): Promise<Treatment[]> {
    return this.treatmentRepo
      .getAll(page)
      .then((rows) => z.array(TreatmentSchema).parse(rows))
  }

  public async create(data: TreatmentCreate): Promise<Treatment> {
    return this.work.transaction<Treatment>(async (client) =>
      this.treatmentRepo
        .create(data, client)
        .then((result) => TreatmentSchema.parse(result)),
    )
  }

  public async changeIsActive(
    treatmentId: number,
    isActive: boolean,
  ): Promise<void> {
    return this.work.transaction(async (client) => {
      this.treatmentRepo.changeIsActive(treatmentId, isActive, client)
    })
  }
}
