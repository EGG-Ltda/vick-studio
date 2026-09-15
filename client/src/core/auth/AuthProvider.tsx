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
      signIn: async (_email: string, _password: string) => {
        const response: Response = await fetch('/api/auth/signin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email: _email, password: _password }),
        })
        if (response.ok) {
          setIsAuthenticated(true) //Comentar esse if se não quiser deixar habilitado o login para testes
        }
      },
      signOut: async () => {
        const response: Response = await fetch('/api/auth/signout', {
          method: 'POST',
        })
        if (response.ok) {
          setIsAuthenticated(false)
        }
      },
    }),
    [isAuthenticated],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export default AuthProvider
