import {
  AppUser,
  AppUserCreateSchema,
  AppUserUpdateSchema,
  IUserService,
  userServiceId,
  TemporaryPasswordSchema,
} from '@/core/user'
import { container } from '@/di/bindings'
import { authHook, passwordAdminHook } from '@/shared/middlewares/auth'
import { fail, ok } from '@/shared/utils/response'
import { FastifyInstance } from 'fastify'
import { can, isMaster } from '@/core/access'
import { publicUser, canResetPassword } from '@/shared/utils/user'

export default async function userRoutes(app: FastifyInstance): Promise<void> {
  const userService: IUserService = container.get(userServiceId)

  app.get('/users/@me', { preHandler: authHook }, async (req, res) =>
    ok(res, publicUser(req.authUser)),
  )
  app.put('/users/@me', { preHandler: authHook }, async (req, res) =>
    fail(res, 'Use the user-management and password-change endpoints.', 405),
  )
  app.delete('/users/@me', { preHandler: authHook }, async (req, res) =>
    fail(res, 'Self-deactivation is not supported.', 405),
  )

  // Get all users
  app.get<{
    Querystring: {
      page: string
      hideDisabled?: string
    }
  }>('/users', { preHandler: authHook }, async (req, res) => {
    const page: number = Number(req.query.page ?? 0)
    if (!Number.isSafeInteger(page) || page < 0 || page > 1000000)
      return fail(res, 'Invalid page', 400)
    if (
      req.query.hideDisabled !== undefined &&
      !['true', 'false'].includes(req.query.hideDisabled)
    )
      return fail(res, 'Invalid filter', 400)
    const users = await userService.getAll(
      page,
      req.query.hideDisabled === 'true',
      !isMaster(req.authUser),
    )

    return ok(res, {
      ...users,
      items: users.items
        .filter(
          (user) =>
            isMaster(req.authUser) || user.assignedRole === 'OPERATIONAL',
        )
        .map((user) => ({
          ...user,
          canConfigurePermissions:
            !user.isMaster &&
            (isMaster(req.authUser) ||
              (can(req.authUser, 'staff.permissions') &&
                user.assignedRole === 'OPERATIONAL')),
          canResetPassword: canResetPassword(req.authUser, user),
        })),
    })
  })

  // Create user
  app.post<{
    Body: {
      login: string
      email: string
      password: string
    }
  }>('/users', { preHandler: authHook }, async (req, res) => {
    const { success, data, error } = AppUserCreateSchema.safeParse(req.body)

    if (!success) {
      return fail(res, 'Invalid body', 400, error.message)
    }

    try {
      return ok(res, publicUser(await userService.create(data, req.authUser)))
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        return fail(res, 'Login is already in use', 409)
      throw error
    }
  })

  // Update user
  app.put<{
    Params: {
      userId: string
    }
    Body: {
      login: string
      email: string
    }
  }>('/users/:userId', { preHandler: authHook }, async (req, res) => {
    const userId: number = Number(req.params.userId)

    const { success, data, error } = AppUserUpdateSchema.safeParse({
      ...req.body,
      id: userId,
    })

    if (!success) {
      return fail(res, 'Invalid body', 400, error.message)
    }

    try {
      const user = await userService.update(data, req.authUser)
      if (!user) return fail(res, 'User not found', 404)
      return ok(res, publicUser(user))
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        return fail(res, 'Login is already in use', 409)
      throw error
    }
  })

  // Disable user
  app.delete<{
    Params: {
      userId: string
    }
  }>(
    '/users/:userId',
    { preHandler: authHook },
    async (req, res): Promise<void> => {
      const userId: number = Number(req.params.userId)
      if (!Number.isSafeInteger(userId) || userId <= 0)
        return fail(res, 'Invalid user', 400)
      if (userId === Number(req.tokenPayload.sub)) {
        return fail(res, 'You cannot disable your own user account.', 409)
      }
      await userService.disable(userId, req.authUser)

      return ok(res)
    },
  )

  app.patch<{ Params: { userId: string } }>(
    '/users/:userId/restore',
    { preHandler: authHook },
    async (req, res) => {
      const userId = Number(req.params.userId)
      if (!Number.isSafeInteger(userId) || userId <= 0)
        return fail(res, 'Invalid user', 400)
      await userService.enable(userId, req.authUser)
      return ok(res)
    },
  )

  app.put<{ Params: { userId: string }; Body: unknown }>(
    '/users/:userId/temporary-password',
    { preHandler: [authHook, passwordAdminHook] },
    async (req, res) => {
      const userId = Number(req.params.userId)
      if (!Number.isSafeInteger(userId) || userId <= 0)
        return fail(res, 'Usuário inválido.', 400)
      const parsed = TemporaryPasswordSchema.safeParse(req.body)
      if (!parsed.success)
        return fail(res, 'Informe senhas iguais, de 8 a 32 caracteres.', 400)
      await userService.setTemporaryPassword(
        req.authUser,
        userId,
        parsed.data.password,
      )
      return ok(res)
    },
  )
}
