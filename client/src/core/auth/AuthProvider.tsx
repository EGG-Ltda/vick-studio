import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { AuthContext } from './authContext'
import { SESSION_EXPIRED_EVENT } from '../api/http'

type AuthProviderProps = {
  children: ReactNode
}

function AuthProvider({ children }: AuthProviderProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    const expireSession = () => setIsAuthenticated(false)
    window.addEventListener(SESSION_EXPIRED_EVENT, expireSession)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expireSession)
  }, [])

  const value = useMemo(
    () => ({
      isAuthenticated,
      signIn: async (login: string, password: string) => {
        const response: Response = await fetch('/api/auth/signin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ login, password }),
        })
        const payload: { message?: string } = await response.json()
        if (!response.ok) {
          throw new Error(payload.message ?? 'Login ou senha incorretos.')
        }

        setIsAuthenticated(true)
      },
      signOut: async () => {
        try {
          await fetch('/api/auth/signout', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: '{}',
          })
        } finally {
          setIsAuthenticated(false)
        }
      },
    }),
    [isAuthenticated],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export default AuthProvider
