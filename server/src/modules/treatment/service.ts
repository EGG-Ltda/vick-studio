import { IDatabaseUnitOfWork, unitOfWorkServiceId } from '@/core/db'
import {
  GetTreatmentsOptions,
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

  public async get(options: GetTreatmentsOptions): Promise<Treatment[]> {
    return this.treatmentRepo
      .get(options)
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
      .then((row) => {
        if (!row) {
          throw Object.assign(new Error('Serviço não encontrado.'), { statusCode: 404 })
        }
        return TreatmentSchema.parse(row)
      })
  }
}
