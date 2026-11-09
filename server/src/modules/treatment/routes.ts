import {
  GetTreatmentsOptionsSchema,
  ITreatmentService,
  Treatment,
  TreatmentCreateSchema,
  TreatmentServiceId,
  TreatmentUpdateSchema,
} from '@/core/treatment'
import { container } from '@/di/bindings'
import { authHook } from '@/shared/middlewares/auth'
import { fail, ok } from '@/shared/utils/response'
import { FastifyInstance } from 'fastify'

export default async function userRoutes(app: FastifyInstance): Promise<void> {
  const treatmentService: ITreatmentService = container.get(TreatmentServiceId)

  app.get<{
    Querystring: {
      page: string
      isActive: string
    }
  }>('/treatments', { preHandler: authHook }, async (req, res) => {
    const page: number = parseInt(req.query.page)
    const isActive: boolean = Boolean(req.query.isActive)

    const {
      success,
      data: options,
      error,
    } = GetTreatmentsOptionsSchema.safeParse({
      page,
      filters: { isActive },
    })

    if (!success) {
      return fail(res, 'Invalid querystring', 400, error.message)
    }

    const treatment: Treatment[] = await treatmentService.get(options)
    return ok(res, treatment)
  })

  app.post<{
    Body: {
      name: string
      description: string
      price: number
      durationMinutes: number
    }
  }>('/treatments', { preHandler: authHook }, async (req, res) => {
    const { success, data, error } = TreatmentCreateSchema.safeParse(req.body)

    if (!success) {
      return fail(res, 'Invalid body', 400, error.message)
    }

    const treatment: Treatment = await treatmentService.create(data)
    return ok(res, treatment)
  })

  app.put<{
    Querystring: {
      treatmentId: string
    }
    Body: {
      name: string
      description: string
      price: string
      durationMinutes: number
      isActive: boolean
    }
  }>('/treatments/:treatmentId', { preHandler: authHook }, async (req, res) => {
    const treatmentId: number = Number(req.query.treatmentId)
    const { success, data, error } = TreatmentUpdateSchema.safeParse({
      ...req.body,
      treatmentId,
    })

    if (!success) {
      return fail(res, 'Invalid body', 400, error.message)
    }

    const treatment: Treatment = await treatmentService.update(data)
    return ok(res, treatment)
  })
}
