import {
  AppUser,
  AppUserCreateSchema,
  AppUserUpdateSchema,
  IUserService,
  userServiceId,
} from '@/core/user'
import { container } from '@/di/bindings'
import { authHook } from '@/shared/middlewares/auth'
import { fail, ok } from '@/shared/utils/response'
import { FastifyInstance } from 'fastify'

export default async function userRoutes(app: FastifyInstance): Promise<void> {
  const userService: IUserService = container.get(userServiceId)

  // Get logged user
  app.get('/users/@me', { preHandler: authHook }, async (req, res) => {
    // const id: number = Number(req.tokenPayload['sub'])
    // const user: AppUser = await userService.getById(id)
    // if (!user) {
    //   return fail(res, 'User not found', 404)
    // }
    // return ok(res, user)
  })

  // Update logged user
  app.put(
    '/users/@me',
    { preHandler: authHook },
    async (req, res): Promise<void> => {
      // const id: number = Number(req.tokenPayload['sub'])
      // const email: string = String(req.body.email)
      // const user: AppUser = await userService.update(id, email)
      // return ok(res, user)
    },
  )

  // Soft delete logged user
  app.delete(
    '/users/@me',
    { preHandler: authHook },
    async (req, res): Promise<void> => {
      // const id: number = Number(req.tokenPayload['sub'])
      // await userService.delete(id)
      // return ok(res)
    },
  )

  // Get all users
  app.get<{
    Querystring: {
      page: string
      hideDisabled?: string
    }
  }>('/users', { preHandler: authHook }, async (req, res) => {
    const page: number = Number(req.query.page ?? 0)
    if (!Number.isSafeInteger(page) || page < 0 || page > 1000000) return fail(res, 'Invalid page', 400)
    if (req.query.hideDisabled !== undefined && !['true', 'false'].includes(req.query.hideDisabled)) return fail(res, 'Invalid filter', 400)
    const users = await userService.getAll(page, req.query.hideDisabled === 'true')

    return ok(res, users)
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
      return ok(res, await userService.create(data))
    } catch (error) {
      if ((error as { code?: string }).code === '23505') return fail(res, 'Este login já está em uso.', 409)
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
      const user = await userService.update(data)
      if (!user) return fail(res, 'Usuário não encontrado.', 404)
      return ok(res, user)
    } catch (error) {
      if ((error as { code?: string }).code === '23505') return fail(res, 'Este login já está em uso.', 409)
      throw error
    }
  })

  // Soft delete user
  app.delete<{
    Params: {
      userId: string
    }
  }>(
    '/users/:userId',
    { preHandler: authHook },
    async (req, res): Promise<void> => {
      const userId: number = Number(req.params.userId)
      if (!Number.isSafeInteger(userId) || userId <= 0) return fail(res, 'Invalid user', 400)
      if (userId === Number(req.tokenPayload.sub)) {
        return fail(res, 'Você não pode desabilitar seu próprio usuário.', 409)
      }
      await userService.delete(userId)

      return ok(res)
    },
  )

  app.patch<{ Params: { userId: string } }>(
    '/users/:userId/restore',
    { preHandler: authHook },
    async (req, res) => {
      const userId = Number(req.params.userId)
      if (!Number.isSafeInteger(userId) || userId <= 0) return fail(res, 'Invalid user', 400)
      await userService.restore(userId)
      return ok(res)
    },
  )

  // Forget password
  app.post('/users/forget-password', async (req, res): Promise<void> => {})

  // Reset password
  app.post('/users/reset-password', async (req, res): Promise<void> => {})
}
