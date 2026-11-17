import { FastifyInstance } from 'fastify'
import z from 'zod'
import { container } from '@/di/bindings'
import { databaseServiceId, unitOfWorkServiceId } from '@/core/db'
import { authHook } from '@/shared/middlewares/auth'
import { ok } from '@/shared/utils/response'
import { bookingError } from '../booking/service'
import { AccessService } from './service'
import { ClassService, ClassInput } from './classes'
export default async function routes(app: FastifyInstance) {
  const s = new AccessService(
      container.get(databaseServiceId),
      container.get(unitOfWorkServiceId),
    ),
    secured = { preHandler: authHook }
  const classes = new ClassService(
    container.get(databaseServiceId),
    container.get(unitOfWorkServiceId),
  )
  const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
    const d = schema.safeParse(value)
    if (!d.success) bookingError('Invalid permission configuration.')
    return d.data
  }
  const classSchema = z.object({
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(1000).default(''),
    level: z.enum(['administrative', 'operational']),
    dataScope: z.enum(['own', 'salon']),
    active: z.boolean().default(true),
    adminManageable: z.boolean().default(false),
    version: z.number().int().positive().optional(),
    permissions: z
      .array(
        z.object({
          key: z.string().max(100),
          allowed: z.boolean(),
          delegatable: z.boolean(),
        }),
      )
      .max(100),
  })
  const classId = (v: string) => parse(z.coerce.number().int().positive(), v)
  app.get('/access/classes/options', secured, async (req, res) =>
    ok(res, await classes.options(req.authUser)),
  )
  app.get('/access/classes', secured, async (req, res) =>
    ok(res, await classes.list(req.authUser)),
  )
  app.get<{ Params: { id: string } }>(
    '/access/classes/:id/audit',
    secured,
    async (req, res) => {
      const id = classId(req.params.id)
      await classes.detail(req.authUser, id)
      return ok(
        res,
        (
          await classes.query(
            `SELECT a.id,a.action,a.previous_data AS previous,a.current_data AS current,a.created_at AS "createdAt",u.login AS author FROM access_audit a JOIN app_users u ON u.id=a.actor_id WHERE (a.action IN ('class_create','class_update') AND a.current_data->>'id'=$1) OR (a.action='class_assignment' AND (a.current_data->>'classId'=$1 OR a.previous_data->>'classId'=$1)) ORDER BY a.id DESC LIMIT 100`,
            [String(id)],
          )
        ).rows,
      )
    },
  )
  app.get<{ Params: { id: string } }>(
    '/access/classes/:id',
    secured,
    async (req, res) =>
      ok(res, await classes.detail(req.authUser, classId(req.params.id))),
  )
  const saveClass = async (req: any, res: any, id: number | null) => {
    try {
      return ok(
        res,
        await classes.save(
          req.authUser,
          id,
          parse(classSchema, req.body) as ClassInput,
        ),
      )
    } catch (e) {
      if ((e as { code?: string }).code === '23505')
        bookingError('Access class name already exists.', 409)
      throw e
    }
  }
  app.post('/access/classes', secured, async (req, res) =>
    saveClass(req, res, null),
  )
  app.put<{ Params: { id: string } }>(
    '/access/classes/:id',
    secured,
    async (req, res) => saveClass(req, res, classId(req.params.id)),
  )
  app.put<{ Params: { id: string } }>(
    '/access/users/:id/class',
    secured,
    async (req, res) =>
      ok(
        res,
        await classes.assign(
          req.authUser,
          classId(req.params.id),
          parse(z.object({ classId: z.number().int().positive() }), req.body)
            .classId,
        ),
      ),
  )
  app.get('/access/catalog', secured, async (req, res) => ok(res, s.catalog()))
  app.get('/access/profiles', secured, async (req, res) =>
    ok(res, await s.profileView(req.authUser)),
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
          classId: z.number().int().positive().optional(),
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
          body.classId,
        ),
      )
    },
  )
  app.get('/access/audit', secured, async (req, res) =>
    ok(res, await s.audit(req.authUser)),
  )
}
