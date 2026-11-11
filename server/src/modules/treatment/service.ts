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
import { saveDependencies } from '../dependencies/rules'

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
      .transaction(async (client) => {
        await client.query('SELECT pg_advisory_xact_lock(70440,1)', [])
        const row = await this.treatmentRepo.create(data, client)
        await saveDependencies(client, row.id, data.dependencies)
        return { ...row, dependencies: data.dependencies }
      })
      .then((row) => TreatmentSchema.parse(row))
  }

  public async update(data: TreatmentUpdate): Promise<Treatment> {
    return this.work
      .transaction(async (client) => {
        await client.query('SELECT pg_advisory_xact_lock(70440,1)', [])
        const row = await this.treatmentRepo.update(data, client)
        if (!row) return row
        if (data.dependencies !== undefined)
          await saveDependencies(client, row.id, data.dependencies)
        const dependencies = (
          await client.query(
            `SELECT required_treatment_id AS "requiredTreatmentId",position,same_day AS "sameDay",consecutive,min_minutes AS "minMinutes",max_minutes AS "maxMinutes" FROM treatment_dependencies WHERE treatment_id=$1 ORDER BY required_treatment_id`,
            [row.id],
          )
        ).rows
        return { ...row, dependencies }
      })
      .then((row) => {
        if (!row) {
          throw Object.assign(new Error('Treatment not found.'), {
            statusCode: 404,
          })
        }
        return TreatmentSchema.parse(row)
      })
  }
}
