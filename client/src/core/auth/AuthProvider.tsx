import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { AuthContext } from './authContext'

type AuthProviderProps = {
  children: ReactNode
}

function AuthProvider({ children }: AuthProviderProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  const value = useMemo(
    () => ({
      isAuthenticated,
      signIn: async (login: string, password: string) => {
        try {
          const response = await fetch('/api/auth/signin', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ login, password }),
          })
          const payload = await response.json().catch(() => null) as {
            success?: boolean
            message?: string
          } | null

          if (!response.ok || !payload?.success) {
            return {
              success: false,
              message: payload?.message ?? 'Não foi possível entrar. Tente novamente.',
            }
          }

          setIsAuthenticated(true)
          return { success: true }
        } catch {
          return {
            success: false,
            message: 'Não foi possível conectar ao servidor. Tente novamente.',
          }
        }
      },
      signOut: async () => {
        try {
          const response = await fetch('/api/auth/signout', {
            method: 'POST',
          })
          if (response.ok) {
            setIsAuthenticated(false)
          }
        } catch {
          setIsAuthenticated(false)
        }
      },
    }),
    [isAuthenticated],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export default AuthProvider
