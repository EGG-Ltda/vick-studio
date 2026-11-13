import { mockRequest } from '../../mocks/api'
export type ApiResponse<T> = {
  data: T
  success: boolean
  message?: string
  code?: string
}

export const ACCESS_CHANGED_EVENT = 'vick:access-changed'
export const SESSION_EXPIRED_EVENT = 'vick:session-expired'
export const PASSWORD_CHANGE_REQUIRED_EVENT = 'vick:password-change-required'

export async function apiRequest<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  return mockRequest<T>(path, options)
  /* Integração HTTP real comentada nesta branch de demonstração.

  const headers = new Headers(options?.headers)
  if (options?.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      credentials: 'include',
      ...options,
      headers,
    })
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        'Unable to connect to the server. Check that the API is running.',
      )
    }
    throw error
  }
  if (response.status === 401) {
    if (path === '/auth/signin') throw new Error('Invalid login or password.')
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
    throw new Error('Your session has expired. Sign in again to continue.')
  }
  const payload = (await response
    .json()
    .catch(() => null)) as ApiResponse<T> | null
  if (!payload || typeof payload.success !== 'boolean') {
    throw new Error(
      response.status >= 500
        ? 'Unable to connect to the server. Check that the API is running.'
        : 'The server returned an invalid response. Please try again.',
    )
  }

  if (!response.ok || !payload.success) {
    if (payload.code === 'PERMISSION_DENIED')
      window.dispatchEvent(new Event(ACCESS_CHANGED_EVENT))
    if (payload.code === 'PASSWORD_CHANGE_REQUIRED') {
      window.dispatchEvent(new Event(PASSWORD_CHANGE_REQUIRED_EVENT))
    }
    throw new Error(payload.message ?? 'Unable to complete the operation.')
  }

  return payload.data
  */
}
