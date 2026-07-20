import {
  JWT_TOKEN_ACCESS_TOPIC,
  JWT_TOKEN_REFRESH_TOPIC,
} from '@/core/config'
import { JwtService } from '@/infra/jwt/default/service'
import { ServiceIdentifier } from 'inversify'
import z from 'zod'

export const JwtPayloadSchema = z.object({
  jti: z.string(),
  sub: z.string(),
  iss: z.string(),
  aud: z.string(),
  exp: z.number(),
  nbf: z.number(),
  iat: z.number(),
  'vic:userId': z.number().optional(),
  'vic:topic': z
    .literal(JWT_TOKEN_ACCESS_TOPIC)
    .or(z.literal(JWT_TOKEN_REFRESH_TOPIC))
    .optional(),
})

export type JwtPayload = z.infer<typeof JwtPayloadSchema>
export type JwtToken = { token: string; payload: JwtPayload }

export const jwtServiceId: ServiceIdentifier<JwtService> =
  Symbol.for('JwtServiceId')
