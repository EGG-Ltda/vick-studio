import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { AuthContext } from './authContext'
import type { AuthUser } from './authContext'
import {
  apiRequest,
  SESSION_EXPIRED_EVENT,
  PASSWORD_CHANGE_REQUIRED_EVENT,
} from '../api/http'

type AuthProviderProps = {
  children: ReactNode
}

function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const expireSession = () => setUser(null)
    const requirePasswordChange = () =>
      setUser((current) =>
        current ? { ...current, mustChangePassword: true } : null,
      )
    window.addEventListener(SESSION_EXPIRED_EVENT, expireSession)
    window.addEventListener(
      PASSWORD_CHANGE_REQUIRED_EVENT,
      requirePasswordChange,
    )
    const controller = new AbortController()
    apiRequest<AuthUser>('/auth/session', { signal: controller.signal })
      .then((session) => {
        if (!controller.signal.aborted) setUser(session)
      })
      .catch(() => {
        if (!controller.signal.aborted) setUser(null)
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })
    return () => {
      controller.abort()
      window.removeEventListener(SESSION_EXPIRED_EVENT, expireSession)
      window.removeEventListener(
        PASSWORD_CHANGE_REQUIRED_EVENT,
        requirePasswordChange,
      )
    }
  }, [])

  const value = useMemo(
    () => ({
      isAuthenticated: user !== null,
      isLoading,
      user,
      mustChangePassword: user?.mustChangePassword ?? false,
      signIn: async (login: string, password: string) => {
        const session = await apiRequest<AuthUser>('/auth/signin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ login, password }),
        })
        setUser(session)
        return session
      },
      changePassword: async (newPassword: string, confirmPassword: string) => {
        const session = await apiRequest<AuthUser>('/auth/change-password', {
          method: 'POST',
          body: JSON.stringify({
            newPassword,
            confirmPassword,
          }),
        })
        setUser(session)
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
          setUser(null)
        }
      },
    }),
    [user, isLoading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export default AuthProvider
