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
        'Não foi possível conectar ao servidor. Verifique se a API está em execução.',
      )
    }
    throw error
  }
  if (response.status === 401) {
    if (path === '/auth/signin') throw new Error('Login ou senha incorretos.')
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
    throw new Error('Sua sessão expirou. Entre novamente para continuar.')
  }
  const payload = (await response
    .json()
    .catch(() => null)) as ApiResponse<T> | null
  if (!payload || typeof payload.success !== 'boolean') {
    throw new Error(
      response.status >= 500
        ? 'Não foi possível conectar ao servidor. Verifique se a API está em execução.'
        : 'O servidor retornou uma resposta inválida. Tente novamente.',
    )
  }

  if (!response.ok || !payload.success) {
    throw new Error(payload.message ?? 'Não foi possível concluir a operação.')
  }

  return payload.data
}
