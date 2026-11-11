import { databaseServiceId, IDatabaseService } from '@/core/db'
import { can } from '@/core/access'
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
import z from 'zod'

export default async function userRoutes(app: FastifyInstance): Promise<void> {
  const treatmentService: ITreatmentService = container.get(TreatmentServiceId)
  const db: IDatabaseService = container.get(databaseServiceId)

  app.get<{ Querystring: { page?: string } }>(
    '/public/treatments',
    async (req, res) => {
      const parsed = GetTreatmentsOptionsSchema.safeParse({
        page: Number(req.query.page ?? 0),
        filters: { isActive: true },
      })
      if (!parsed.success) return fail(res, 'Invalid page', 400)
      const treatments: Treatment[] = await treatmentService.get(parsed.data)
      res.header('Cache-Control', 'no-store')
      return ok(
        res,
        treatments.map(({ id, name, description, price, durationMinutes }) => ({
          id,
          name,
          description,
          price,
          durationMinutes,
        })),
      )
    },
  )

  app.get<{
    Querystring: {
      page: string
      isActive: string
    }
  }>('/treatments', { preHandler: authHook }, async (req, res) => {
    const page: number = Number(req.query.page ?? 0)
    const parsedFilter = z
      .enum(['true', 'false'])
      .optional()
      .safeParse(req.query.isActive)
    if (!parsedFilter.success) {
      return fail(res, 'Invalid isActive filter', 400)
    }
    const isActive = !can(req.authUser, 'services.inactive')
      ? true
      : parsedFilter.data === undefined
        ? undefined
        : parsedFilter.data === 'true'

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

    try {
      const treatment: Treatment = await treatmentService.create(data)
      return ok(res, treatment)
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        return fail(res, 'A treatment with this name already exists.', 409)
      }
      throw error
    }
  })

  app.put<{
    Params: {
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
    const treatmentId: number = Number(req.params.treatmentId)
    const { success, data, error } = TreatmentUpdateSchema.safeParse({
      ...req.body,
      id: treatmentId,
    })

    if (!success) {
      return fail(res, 'Invalid body', 400, error.message)
    }

    const client = await db.getClient()
    try {
      const current = (
        await client.query(
          'SELECT is_active FROM salon_treatments WHERE id=$1',
          [treatmentId],
        )
      ).rows[0]
      if (!current) return fail(res, 'Treatment not found.', 404)
      if (
        current.is_active !== data.isActive &&
        !can(req.authUser, 'services.status')
      )
        return fail(res, 'Permission denied for treatment status changes.', 403)
    } finally {
      client.release()
    }
    try {
      const treatment: Treatment = await treatmentService.update(data)
      return ok(res, treatment)
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        return fail(res, 'A treatment with this name already exists.', 409)
      }
      throw error
    }
  })
  app.patch<{ Params: { treatmentId: string } }>(
    '/treatments/:treatmentId/status',
    { preHandler: authHook },
    async (req, res) => {
      const id = z.coerce
          .number()
          .int()
          .positive()
          .safeParse(req.params.treatmentId),
        body = z.object({ isActive: z.boolean() }).strict().safeParse(req.body)
      if (!id.success || !body.success)
        return fail(res, 'Invalid treatment status.', 400)
      const client = await db.getClient()
      try {
        await client.beginTransaction()
        await client.query('SELECT pg_advisory_xact_lock(70440,1)', [])
        const row = (
          await client.query(
            `UPDATE salon_treatments SET is_active=$2,updated_at=now() WHERE id=$1 RETURNING id,name,description,price::float AS price,duration_minutes AS "durationMinutes",is_active AS "isActive"`,
            [id.data, body.data.isActive],
          )
        ).rows[0]
        await client.commit()
        return row ? ok(res, row) : fail(res, 'Treatment not found.', 404)
      } catch (e) {
        await client.rollback()
        throw e
      } finally {
        client.release()
      }
    },
  )
}
