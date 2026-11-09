export type ApiResponse<T> = {
  data: T
  success: boolean
  message?: string
}

export const SESSION_EXPIRED_EVENT = 'vick:session-expired'

export async function apiRequest<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const headers = new Headers(options?.headers)
  if (options?.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...options,
    headers,
  })
  if (response.status === 401) {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
    throw new Error('Sua sessão expirou. Entre novamente para continuar.')
  }
  const payload = (await response.json()) as ApiResponse<T>

  if (!response.ok || !payload.success) {
    throw new Error(payload.message ?? 'Não foi possível concluir a operação.')
  }

  return payload.data
}
