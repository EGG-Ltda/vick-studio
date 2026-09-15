import { createContext } from 'react'

type SignInResult = {
  success: boolean
  message?: string
}

type AuthContextValue = {
  isAuthenticated: boolean
  signIn: (login: string, password: string) => Promise<SignInResult>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
)
