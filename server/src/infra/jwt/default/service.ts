import { JwtPayload, JwtPayloadSchema } from '@/core/jwt'
import { injectable } from 'inversify'
import jwt from 'jsonwebtoken'

@injectable()
export class JwtService {
  public sign(payload: any, secret: string): string {
    return jwt.sign(payload, secret)
  }

  public verify(token: string, secret: string): JwtPayload {
    const data: any = jwt.verify(token, secret)
    return JwtPayloadSchema.parse(data)
  }
}
