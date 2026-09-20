import { createContext } from 'react'

type AuthContextValue = {
  isAuthenticated: boolean
  signIn: (login: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
)
