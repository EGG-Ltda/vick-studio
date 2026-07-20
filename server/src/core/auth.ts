import { JwtPayload, JwtToken } from '@/core/jwt'
import { AppUser } from '@/core/user'
import { ServiceIdentifier } from 'inversify'

export interface IAuthService {
  createAccessToken(user: AppUser): JwtToken
  createRefreshToken(user: AppUser): JwtToken
  saveRefreshToken(token: JwtToken): Promise<void>
  revokeRefreshToken(jti: string): Promise<void>
  getRefreshToken(jti: string): Promise<string>
  verifyToken(token: string): JwtPayload
}

export const authServiceId: ServiceIdentifier<IAuthService> =
  Symbol.for('AuthServiceId')
