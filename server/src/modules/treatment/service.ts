import { IDatabaseUnitOfWork, unitOfWorkServiceId } from '@/core/db'
import {
  ITreatmentRepository,
  ITreatmentService,
  Treatment,
  TreatmentCreate,
  TreatmentRepositoryId,
  TreatmentSchema,
  TreatmentUpdate,
} from '@/core/treatment'
import { inject, injectable } from 'inversify'
import z from 'zod'

@injectable()
export class TreatmentService implements ITreatmentService {
  public constructor(
    @inject(unitOfWorkServiceId)
    private readonly work: IDatabaseUnitOfWork,
    @inject(TreatmentRepositoryId)
    private readonly treatmentRepo: ITreatmentRepository,
  ) {}

  public async getAll(page: number): Promise<Treatment[]> {
    return this.treatmentRepo
      .getAll(page)
      .then((rows) => z.array(TreatmentSchema).parse(rows))
  }

  public async create(data: TreatmentCreate): Promise<Treatment> {
    return this.work
      .transaction(async (client) => this.treatmentRepo.create(data, client))
      .then((row) => TreatmentSchema.parse(row))
  }

  public async update(data: TreatmentUpdate): Promise<Treatment> {
    return this.work
      .transaction(async (client) => this.treatmentRepo.update(data, client))
      .then((row) => TreatmentSchema.parse(row))
  }
}
