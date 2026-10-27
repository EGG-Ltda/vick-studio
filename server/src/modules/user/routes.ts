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
    }
  }>('/users', { preHandler: authHook }, async (req, res) => {
    const page: number = Number(req.query.page)
    const users: AppUser[] = await userService.getAll(page)

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

    const user: AppUser = await userService.create(data)
    return ok(res, user)
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
      userId,
    })

    if (!success) {
      return fail(res, 'Invalid body', 400, error.message)
    }

    const user: AppUser = await userService.update(data)
    return ok(res, user)
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
      await userService.delete(userId)

      return ok(res)
    },
  )

  // Forget password
  app.post('/users/forget-password', async (req, res): Promise<void> => {})

  // Reset password
  app.post('/users/reset-password', async (req, res): Promise<void> => {})
}
