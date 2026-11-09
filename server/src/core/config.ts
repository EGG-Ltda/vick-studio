export const ENVIRONMENT: string = process.env.NODE_ENV
export const APP_INITIALIZED_AT: number = Date.now()

export const MASTER_USER_ID: number = Number(process.env.MASTER_USER_ID)
if (!Number.isSafeInteger(MASTER_USER_ID) || MASTER_USER_ID <= 0) {
  throw new Error('MASTER_USER_ID must be a positive safe integer')
}

export const JWT_TOKEN_ISSUER: string = process.env.JWT_TOKEN_ISSUER
export const JWT_TOKEN_AUDIENCE: string = process.env.JWT_TOKEN_AUDIENCE
export const JWT_TOKEN_ACCESS_EXP: number = parseInt(
  process.env.JWT_TOKEN_ACCESS_EXP,
)
export const JWT_TOKEN_REFRESH_EXP: number = parseInt(
  process.env.JWT_TOKEN_REFRESH_EXP,
)
export const JWT_TOKEN_ACCESS_TOPIC: string = process.env.JWT_TOKEN_ACCESS_TOPIC
export const JWT_TOKEN_REFRESH_TOPIC: string =
  process.env.JWT_TOKEN_REFRESH_TOPIC
