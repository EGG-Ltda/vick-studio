import { createContext } from 'react'

export type AuthUser = {
  role: 'MASTER' | 'ADMIN' | 'OPERATIONAL' | 'DISABLED'
  permissions: string[]
  id: number
  login: string
  email: string
  isAdmin: boolean
  isMaster: boolean
  canManagePasswords: boolean
  mustChangePassword: boolean
}

type AuthContextValue = {
  refreshAccess: () => Promise<void>
  isAuthenticated: boolean
  isLoading: boolean
  user: AuthUser | null
  mustChangePassword: boolean
  signIn: (login: string, password: string) => Promise<AuthUser>
  changePassword: (
    newPassword: string,
    confirmPassword: string,
  ) => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
)
