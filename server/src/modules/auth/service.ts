import { IAuthService } from '@/core/auth'
import {
  APP_INITIALIZED_AT,
  JWT_TOKEN_ACCESS_EXP,
  JWT_TOKEN_ACCESS_TOPIC,
  JWT_TOKEN_AUDIENCE,
  JWT_TOKEN_ISSUER,
  JWT_TOKEN_REFRESH_EXP,
  JWT_TOKEN_REFRESH_TOPIC,
} from '@/core/config'
import { JwtPayload, jwtServiceId, JwtToken } from '@/core/jwt'
import { AppUser } from '@/core/user'
import { JwtService } from '@/infra/jwt/default/service'
import { randomBytes, randomUUID } from 'crypto'
import { inject, injectable } from 'inversify'

@injectable()
export class AuthService implements IAuthService {
  // jti -> revokedAt
  private readonly revokedTokens: Map<string, number> = new Map()

  public constructor(
    @inject(jwtServiceId)
    private readonly jwtService: JwtService,
  ) {}

  public createAccessToken(user: AppUser): JwtToken {
    const now: number = Math.floor(Date.now() / 1000)
    const exp: number = now + JWT_TOKEN_ACCESS_EXP

    const payload: JwtPayload = {
      jti: randomUUID(),
      sub: user.id.toString(),
      iss: JWT_TOKEN_ISSUER,
      aud: JWT_TOKEN_AUDIENCE,
      exp,
      nbf: now,
      iat: now,
      'vick:topic': JWT_TOKEN_ACCESS_TOPIC,
    }

    return {
      token: this.jwtService.sign(payload, this.getTokenSecret()),
      payload,
    }
  }

  public createRefreshToken(user: AppUser): JwtToken {
    const now: number = Math.floor(Date.now() / 1000)
    const exp: number = now + JWT_TOKEN_REFRESH_EXP

    const payload: JwtPayload = {
      jti: randomUUID(),
      sub: randomBytes(32).toString('base64'),
      iss: JWT_TOKEN_ISSUER,
      aud: JWT_TOKEN_AUDIENCE,
      exp,
      nbf: now,
      iat: now,
      'vick:topic': JWT_TOKEN_REFRESH_TOPIC,
      'vick:userId': user.id,
    }

    return {
      token: this.jwtService.sign(payload, this.getTokenSecret()),
      payload,
    }
  }

  public async revokeRefreshToken(jti: string): Promise<void> {
    this.clearRevokedTokens()
    this.revokedTokens.set(jti, Date.now())
  }

  private verifyToken(token: string): JwtPayload {
    if (Date.now() < APP_INITIALIZED_AT) {
      throw new Error('Invalid token')
    }

    return this.jwtService.verify(token, this.getTokenSecret())
  }

  public verifyAccessToken(token: string): JwtPayload {
    const payload: JwtPayload = this.verifyToken(token)
    if (payload['vick:topic'] !== JWT_TOKEN_ACCESS_TOPIC) {
      throw new Error('Invalid token type')
    }

    return payload
  }

  public verifyRefreshToken(token: string): JwtPayload {
    const payload: JwtPayload = this.verifyToken(token)
    if (payload['vick:topic'] !== JWT_TOKEN_REFRESH_TOPIC) {
      throw new Error('Invalid token type')
    }

    this.clearRevokedTokens()
    if (this.revokedTokens.has(payload.jti)) {
      throw new Error('Revoked refresh token')
    }

    return payload
  }

  private getTokenSecret(): string {
    return process.env.JWT_TOKEN_SECRET
  }

  private clearRevokedTokens(): void {
    this.revokedTokens.forEach((value, key) => {
      const expiresAt = value + JWT_TOKEN_REFRESH_EXP

      if (expiresAt <= Date.now()) {
        this.revokedTokens.delete(key)
      }
    })
  }
}
