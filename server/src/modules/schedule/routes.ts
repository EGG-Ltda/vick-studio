import {
  scheduleServiceId,
  IScheduleService,
  ScheduleCreateSchema,
} from '@/core/schedule'
import { container } from '@/di/bindings'
import { authHook } from '@/shared/middlewares/auth'
import { fail, ok } from '@/shared/utils/response'
import { FastifyInstance } from 'fastify'
import z from 'zod'

const ScheduleQuerySchema = z.object({
  start: z.coerce.date(),
  end: z.coerce.date(),
})

export default async function scheduleRoutes(
  app: FastifyInstance,
): Promise<void> {
  const scheduleService: IScheduleService = container.get(scheduleServiceId)
  app.get('/schedules/options', {preHandler:authHook}, async(_req,res) => ok(res,await scheduleService.options()))

  app.get<{ Querystring: { start?: string; end?: string } }>(
    '/schedules',
    { preHandler: authHook },
    async (req, res) => {
      const parsed = ScheduleQuerySchema.safeParse(req.query)
      if (!parsed.success || parsed.data.start >= parsed.data.end) {
        return fail(
          res,
          'Invalid schedule interval',
          400,
          parsed.success ? undefined : parsed.error.issues,
        )
      }
      return ok(
        res,
        await scheduleService.list(parsed.data.start, parsed.data.end),
      )
    },
  )

  app.post<{ Body: unknown }>(
    '/schedules',
    { preHandler: authHook },
    async (req, res) => {
      const parsed = ScheduleCreateSchema.safeParse(req.body)
      if (!parsed.success || parsed.data.startsAt >= parsed.data.endsAt) {
        return fail(
          res,
          'Invalid schedule data',
          400,
          parsed.success ? undefined : parsed.error.issues,
        )
      }
      return ok(res, await scheduleService.create(parsed.data))
    },
  )
}
