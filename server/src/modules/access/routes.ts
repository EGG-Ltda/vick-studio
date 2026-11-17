import { FastifyInstance } from 'fastify'
import z from 'zod'
import { container } from '@/di/bindings'
import { databaseServiceId, unitOfWorkServiceId } from '@/core/db'
import { authHook } from '@/shared/middlewares/auth'
import { ok } from '@/shared/utils/response'
import { bookingError } from '../booking/service'
import { AccessService } from './service'
export default async function routes(app: FastifyInstance) {
  const s = new AccessService(
      container.get(databaseServiceId),
      container.get(unitOfWorkServiceId),
    ),
    secured = { preHandler: authHook }
  const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
    const d = schema.safeParse(value)
    if (!d.success) bookingError('Invalid permission configuration.')
    return d.data
  }
  app.get('/access/catalog', secured, async (req, res) => ok(res, s.catalog()))
  app.get('/access/profiles', secured, async (req, res) =>
    ok(res, { catalog: s.catalog(), profiles: await s.profiles() }),
  )
  app.put<{ Params: { role: string } }>(
    '/access/profiles/:role',
    secured,
    async (req, res) => {
      const role = parse(z.enum(['ADMIN', 'OPERATIONAL']), req.params.role),
        body = parse(
          z.object({
            version: z.number().int().positive(),
            permissions: z
              .array(
                z.object({
                  key: z.string().max(100),
                  allowed: z.boolean(),
                  delegatable: z.boolean(),
                }),
              )
              .max(100),
          }),
          req.body,
        )
      return ok(
        res,
        await s.saveProfile(req.authUser, role, body.version, body.permissions),
      )
    },
  )
  app.get<{ Params: { id: string } }>(
    '/access/users/:id',
    secured,
    async (req, res) =>
      ok(res, {
        catalog: s.catalog(),
        ...(await s.individual(
          req.authUser,
          parse(z.coerce.number().int().positive(), req.params.id),
        )),
      }),
  )
  app.put<{ Params: { id: string } }>(
    '/access/users/:id',
    secured,
    async (req, res) => {
      const body = parse(
        z.object({
          profileVersion: z.number().int().positive(),
          changes: z
            .array(
              z.object({
                key: z.string().max(100),
                allowed: z.boolean().nullable(),
              }),
            )
            .max(100),
        }),
        req.body,
      )
      return ok(
        res,
        await s.saveIndividual(
          req.authUser,
          parse(z.coerce.number().int().positive(), req.params.id),
          body.profileVersion,
          body.changes as { key: string; allowed: boolean | null }[],
        ),
      )
    },
  )
  app.get('/access/audit', secured, async (req, res) =>
    ok(
      res,
      (
        await s.query(
          `SELECT a.id,a.action,a.target_user_id AS "targetUserId",a.target_role AS "targetRole",a.previous_data AS "previousData",a.current_data AS "currentData",a.created_at AS "createdAt",u.login AS author FROM access_audit a JOIN app_users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 100`,
        )
      ).rows,
    ),
  )
}
