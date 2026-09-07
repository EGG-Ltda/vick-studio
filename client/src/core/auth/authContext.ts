import { createContext } from 'react'

type AuthContextValue = {
  isAuthenticated: boolean
  signIn: (email: string, password: string) => void
  signOut: () => void
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
)
