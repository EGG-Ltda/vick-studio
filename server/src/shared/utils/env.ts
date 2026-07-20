export function checkEnvironmentVariables(): void {
  const requiredEnvVars: string[] = [
    'PORT',
    'NODE_ENV',
    'JWT_TOKEN_SECRET',
    'JWT_TOKEN_ISSUER',
    'JWT_TOKEN_AUDIENCE',
    'JWT_TOKEN_ACCESS_EXP',
    'JWT_TOKEN_REFRESH_EXP',
    'JWT_TOKEN_ACCESS_TOPIC',
    'JWT_TOKEN_REFRESH_TOPIC',
    'DATABASE_CONNECTION_STRING',
  ]

  for (const varName of requiredEnvVars) {
    if (!process.env[varName]) {
      throw new Error(`${varName} cannot be null/undefined`)
    }
  }
}
