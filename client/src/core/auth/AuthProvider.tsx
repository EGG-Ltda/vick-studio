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
      signIn: (_email: string, _password: string) => setIsAuthenticated(true),
      signOut: () => setIsAuthenticated(false),
    }),
    [isAuthenticated],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export default AuthProvider
