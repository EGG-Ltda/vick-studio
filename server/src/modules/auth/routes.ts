import { authServiceId, IAuthService } from '@/core/auth'
import {
  ENVIRONMENT,
  JWT_TOKEN_ACCESS_EXP,
  JWT_TOKEN_REFRESH_EXP,
} from '@/core/config'
import { hashServiceId, IHashService } from '@/core/hash'
import { JwtPayload, JwtToken } from '@/core/jwt'
import { AppUser, IUserService, userServiceId } from '@/core/user'
import container from '@/di/bindings'
import { fail, ok } from '@/shared/utils/response'
import { FastifyInstance } from 'fastify'
import z from 'zod'

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

  // Sign In
  app.post<SigninPostRequest>('/auth/signin', async (req, res) => {
    const { success, data, error } = SigninPostSchema.safeParse(req.body)
    if (!success) {
      return fail(res, 'Invalid body', 400, error.message)
    }

    const user: AppUser = await userService.getByLoginWithPassword(data.login)
    if (!user) {
      return fail(res, 'Email or password incorrect', 401)
    }

    const isValidPassword: boolean = await hashService.compare(
      data.password,
      user.hashPassword,
    )

    if (!isValidPassword) {
      return fail(res, 'Email or password incorrect', 401)
    }

    const accessToken: JwtToken = authService.createAccessToken(user)
    const refreshToken: JwtToken = authService.createRefreshToken(user)

    user.hashPassword = undefined
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

    return ok(res, user)
  })

  // Refresh Token
  app.post('/auth/refresh', async (req, res) => {
    const refreshToken: string = req.cookies['refreshToken']
    if (!refreshToken) {
      return fail(res, 'Missing refresh token', 400)
    }

    const payload: JwtPayload = authService.verifyRefreshToken(refreshToken)
    const user: AppUser = await userService.getById(payload['vick:userId'])

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
    if (!refreshToken) {
      return fail(res, 'Missing refresh token', 400)
    }

    const payload: JwtPayload = authService.verifyRefreshToken(refreshToken)
    await authService.revokeRefreshToken(payload.jti)

    res
      .clearCookie('accessToken', { path: '/api' })
      .clearCookie('refreshToken', { path: '/api/auth' })

    return ok(res)
  })
}
