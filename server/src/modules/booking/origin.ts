const loopback = new Set(['localhost', '127.0.0.1', '[::1]'])

export function isBookingOriginAllowed(
  originValue: string,
  host: string,
  protocol: string,
  environment: string,
  publicOrigin?: string,
): boolean {
  try {
    const origin = new URL(originValue)
    if (!['http:', 'https:'].includes(origin.protocol)) return false
    if (publicOrigin) return origin.origin === new URL(publicOrigin).origin
    if (origin.origin === new URL(`${protocol}://${host}`).origin) return true
    // Vite's local proxy may rewrite Host to the API's port.
    return (
      environment === 'development' &&
      origin.protocol === 'http:' &&
      origin.port === '5173' &&
      loopback.has(origin.hostname) &&
      loopback.has(new URL(`${protocol}://${host}`).hostname)
    )
  } catch {
    return false
  }
}
