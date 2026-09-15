import { JwtPayload, JwtToken } from '@/core/jwt'
import { AppUser } from '@/core/user'
import { ServiceIdentifier } from 'inversify'

export interface IAuthService {
  createAccessToken(user: AppUser): JwtToken
  createRefreshToken(user: AppUser): JwtToken
  revokeRefreshToken(jti: string): Promise<void>
  verifyAccessToken(token: string): JwtPayload
  verifyRefreshToken(token: string): JwtPayload
}

export const authServiceId: ServiceIdentifier<IAuthService> =
  Symbol.for('AuthServiceId')
