export const JWT_TOKEN_ISSUER: string = process.env.JWT_TOKEN_ISSUER
export const JWT_TOKEN_AUDIENCE: string = process.env.JWT_TOKEN_AUDIENCE
export const JWT_TOKEN_ACCESS_EXP: number = parseInt(
  process.env.JWT_TOKEN_ACCESS_EXP
)
export const JWT_TOKEN_REFRESH_EXP: number = parseInt(
  process.env.JWT_TOKEN_REFRESH_EXP
)
export const JWT_TOKEN_ACCESS_TOPIC: string = process.env.JWT_TOKEN_ACCESS_TOPIC
export const JWT_TOKEN_REFRESH_TOPIC: string =
  process.env.JWT_TOKEN_REFRESH_TOPIC
