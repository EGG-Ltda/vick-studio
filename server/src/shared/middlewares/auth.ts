import { authServiceId, IAuthService } from '@/core/auth'
import { AppUser, IUserService, userServiceId } from '@/core/user'
import { JwtPayload } from '@/core/jwt'
import { container } from '@/di/bindings'
import { fail } from '@/shared/utils/response'
import { FastifyReply, FastifyRequest } from 'fastify'
import { canManagePasswords } from '@/shared/utils/user'
import { salonWide } from '@/core/access'
import { isBookingOriginAllowed } from '@/modules/booking/origin'
import { enforceRoutePermission } from './permissions'

const authService: IAuthService = container.get(authServiceId)
export async function salonAdminHook(
  req: FastifyRequest,
  res: FastifyReply,
): Promise<void> {
  if (!req.authUser || !salonWide(req.authUser))
    return fail(res, 'Salon administrator access is required.', 403)
}

declare module 'fastify' {
  interface FastifyRequest {
    tokenPayload?: JwtPayload
    authUser?: AppUser
  }
}

export async function authHook(
  req: FastifyRequest,
  res: FastifyReply,
): Promise<void> {
  return authenticate(req, res, false)
}

export async function passwordChangeAuthHook(
  req: FastifyRequest,
  res: FastifyReply,
): Promise<void> {
  return authenticate(req, res, true)
}

export async function passwordAdminHook(
  req: FastifyRequest,
  res: FastifyReply,
): Promise<void> {
  if (!req.authUser || !canManagePasswords(req.authUser)) {
    return fail(res, 'Apenas ADMIN ou MASTER pode redefinir senhas.', 403)
  }
}

async function authenticate(
  req: FastifyRequest,
  res: FastifyReply,
  allowPasswordChange: boolean,
): Promise<void> {
  if (
    req.headers.origin &&
    !isBookingOriginAllowed(
      req.headers.origin,
      req.headers.host ?? '',
      req.protocol,
      process.env.NODE_ENV,
      process.env.PUBLIC_ORIGIN,
    )
  )
    return fail(
      res,
      'Cross-origin administrative requests are not allowed.',
      403,
    )
  const token: string = req.cookies['accessToken']
  if (!token) {
    return fail(res, 'Missing access token', 401)
  }

  let payload: JwtPayload
  try {
    payload = authService.verifyAccessToken(token)
  } catch (err) {
    return fail(res, 'Invalid or expired token', 401, err)
  }
  const userId = Number(payload?.sub)
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return fail(res, 'Invalid or expired token', 401)
  }

  const userService: IUserService = container.get(userServiceId)
  const user = await userService.getById(userId)
  if (!user || !user.isActive || user.removedAt) {
    return fail(res, 'User is disabled or not found', 401)
  }
  if (payload['vick:passwordVersion'] !== user.passwordVersion) {
    return fail(res, 'Sua senha foi alterada. Entre novamente.', 401)
  }
  if (user.mustChangePassword && !allowPasswordChange) {
    res.status(403).send({
      success: false,
      code: 'PASSWORD_CHANGE_REQUIRED',
      message: 'Defina sua senha pessoal antes de continuar.',
    })
    return
  }
  req.tokenPayload = payload
  req.authUser = user
  if (!allowPasswordChange) return enforceRoutePermission(req, res)
}
