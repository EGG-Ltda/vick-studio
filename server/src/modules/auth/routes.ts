import { authServiceId, IAuthService } from '@/core/auth'
import {
  ENVIRONMENT,
  JWT_TOKEN_ACCESS_EXP,
  JWT_TOKEN_REFRESH_EXP,
} from '@/core/config'
import { hashServiceId, IHashService } from '@/core/hash'
import { JwtPayload, JwtToken } from '@/core/jwt'
import {
  IUserService,
  AppUser,
  userServiceId,
  PasswordChangeSchema,
} from '@/core/user'
import { container } from '@/di/bindings'
import { passwordChangeAuthHook } from '@/shared/middlewares/auth'
import { fail, ok } from '@/shared/utils/response'
import { FastifyInstance, FastifyReply } from 'fastify'
import z from 'zod'
import { publicUser } from '@/shared/utils/user'

const SigninPostSchema = z.object({
  login: z.string().min(1).max(255),
  password: z.string().min(8).max(32),
})

type SigninPost = z.infer<typeof SigninPostSchema>

type SigninPostRequest = {
  Body: SigninPost
}

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  const authService: IAuthService = container.get(authServiceId)
  const userService: IUserService = container.get(userServiceId)
  const hashService: IHashService = container.get(hashServiceId)

  function issueSession(res: FastifyReply, user: AppUser) {
    const accessToken = authService.createAccessToken(user)
    const refreshToken = authService.createRefreshToken(user)
    res
      .setCookie('accessToken', accessToken.token, {
        httpOnly: true,
        secure: ENVIRONMENT === 'production',
        sameSite: 'strict',
        path: '/api',
        maxAge: JWT_TOKEN_ACCESS_EXP,
      })
      .setCookie('refreshToken', refreshToken.token, {
        httpOnly: true,
        secure: ENVIRONMENT === 'production',
        sameSite: 'strict',
        path: '/api/auth',
        maxAge: JWT_TOKEN_REFRESH_EXP,
      })
  }

  app.get(
    '/auth/session',
    { preHandler: passwordChangeAuthHook },
    async (req, res) => {
      return ok(res, publicUser(req.authUser))
    },
  )

  app.post<{ Body: unknown }>(
    '/auth/change-password',
    { preHandler: passwordChangeAuthHook },
    async (req, res) => {
      const parsed = PasswordChangeSchema.safeParse(req.body)
      if (!parsed.success)
        return fail(res, 'Informe senhas iguais, de 8 a 32 caracteres.', 400)
      const user = await userService.changeTemporaryPassword(
        req.authUser,
        parsed.data.newPassword,
      )
      issueSession(res, user)
      return ok(res, publicUser(user))
    },
  )

  // Sign In
  app.post<SigninPostRequest>('/auth/signin', async (req, res) => {
    const { success, data, error } = SigninPostSchema.safeParse(req.body)
    if (!success) {
      return fail(res, 'Invalid body', 400, error.message)
    }

    const user: AppUser = await userService.getByLoginWithPassword(data.login)
    if (!user || !user.isActive || user.removedAt) {
      return fail(res, 'Email or password incorrect', 401)
    }

    const isValidPassword: boolean = await hashService.compare(
      data.password,
      user.hashPassword,
    )

    if (!isValidPassword) {
      return fail(res, 'Email or password incorrect', 401)
    }

    issueSession(res, user)
    return ok(res, publicUser(user))
  })

  // Refresh Token
  app.post('/auth/refresh', async (req, res) => {
    const refreshToken: string = req.cookies['refreshToken']
    if (!refreshToken) {
      return fail(res, 'Missing refresh token', 400)
    }

    const payload: JwtPayload = authService.verifyRefreshToken(refreshToken)
    const user: AppUser = await userService.getById(payload['vick:userId'])

    if (!user || !user.isActive || user.removedAt) {
      return fail(res, 'User is disabled or not found', 401)
    }

    if (payload['vick:passwordVersion'] !== user.passwordVersion) {
      return fail(res, 'Sua senha foi alterada. Entre novamente.', 401)
    }

    const newAccessToken: JwtToken = authService.createAccessToken(user)
    res.setCookie('accessToken', newAccessToken.token, {
      httpOnly: true,
      secure: ENVIRONMENT === 'production',
      sameSite: 'strict',
      path: '/api',
      maxAge: JWT_TOKEN_ACCESS_EXP,
    })

    return ok(res)
  })

  // Sign Out
  app.post('/auth/signout', async (req, res): Promise<void> => {
    const refreshToken: string = req.cookies['refreshToken']
    if (refreshToken) {
      try {
        const payload = authService.verifyRefreshToken(refreshToken)
        await authService.revokeRefreshToken(payload.jti)
      } catch {
        // Expired or invalid cookies must not prevent signing out.
      }
    }

    res
      .clearCookie('accessToken', { path: '/api' })
      .clearCookie('refreshToken', { path: '/api/auth' })

    return ok(res)
  })
}
