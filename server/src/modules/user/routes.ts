import { IUserService, AppUser, userServiceId } from '@/core/user'
import container from '@/di/bindings'
import { authHook } from '@/shared/middlewares/auth'
import { fail, ok } from '@/shared/utils/response'
import { FastifyInstance } from 'fastify'

export default async function userRoutes(app: FastifyInstance): Promise<void> {
  const userService: IUserService = container.get(userServiceId)

  // Update
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

  // Delete
  app.delete(
    '/users/@me',
    { preHandler: authHook },
    async (req, res): Promise<void> => {
      // const id: number = Number(req.tokenPayload['sub'])
      // await userService.delete(id)
      // return ok(res)
    },
  )

  // Get
  app.get('/users/@me', { preHandler: authHook }, async (req, res) => {
    // const id: number = Number(req.tokenPayload['sub'])
    // const user: AppUser = await userService.getById(id)
    // if (!user) {
    //   return fail(res, 'User not found', 404)
    // }
    // return ok(res, user)
  })

  app.get<{
    Querystring: {
      page: string
    }
  }>('/users', { preHandler: authHook }, async (req, res) => {
    const page: number = parseInt(req.query.page)
    const users: AppUser[] = await userService.getAll(page)

    return ok(res, users)
  })

  // Forget password
  app.post('/users/forget-password', async (req, res): Promise<void> => {})

  // Reset password
  app.post('/users/reset-password', async (req, res): Promise<void> => {})
}
