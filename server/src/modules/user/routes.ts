import { IUserService, AppUser, userServiceId } from '@/core/user'
import container from '@/di/bindings'
import { authHook } from '@/shared/middlewares/auth'
import { fail, ok } from '@/shared/utils/response'
import { FastifyInstance } from 'fastify'

type UserGetByIdRequest = {
  Params: {
    id: string
  }
}

type UpdateUserPutRequest = {
  Params: {
    id: string
  }
  Body: {
    email: string
  }
}

type DeleteUserRequest = {
  Params: {
    id: string
  }
}

export default async function userRoutes(app: FastifyInstance): Promise<void> {
  const userService: IUserService = container.get(userServiceId)

  // Update
  app.put<UpdateUserPutRequest>(
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
  app.delete<DeleteUserRequest>(
    '/users/@me',
    { preHandler: authHook },
    async (req, res): Promise<void> => {
      // const id: number = Number(req.tokenPayload['sub'])
      // await userService.delete(id)

      // return ok(res)
    },
  )

  // Get
  app.get<UserGetByIdRequest>(
    '/users/@me',
    { preHandler: authHook },
    async (req, res) => {
      // const id: number = Number(req.tokenPayload['sub'])
      // const user: AppUser = await userService.getById(id)

      // if (!user) {
      //   return fail(res, 'User not found', 404)
      // }

      // return ok(res, user)
    },
  )

  // Forget password
  app.post('/users/forget-password', async (req, res): Promise<void> => {})

  // Reset password
  app.post('/users/reset-password', async (req, res): Promise<void> => {})
}
