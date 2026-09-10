import { authServiceId, IAuthService } from '@/core/auth'
import { JwtPayload } from '@/core/jwt'
import container from '@/di/bindings'
import { fail } from '@/shared/utils/response'
import { FastifyReply, FastifyRequest } from 'fastify'

const authService: IAuthService = container.get(authServiceId)

declare module 'fastify' {
  interface FastifyRequest {
    tokenPayload?: JwtPayload
  }
}

export async function authHook(
  req: FastifyRequest,
  res: FastifyReply,
): Promise<void> {
  try {
    const token: string = req.cookies['accessToken']
    if (!token) {
      return fail(res, 'Missing access token', 401)
    }

    const payload: JwtPayload = authService.verifyAccessToken(token)
    if (!payload) {
      return fail(res, 'Invalid or expired token', 401)
    }

    req.tokenPayload = payload
  } catch (err) {
    return fail(res, 'Invalid or expired token', 401, err)
  }
}
