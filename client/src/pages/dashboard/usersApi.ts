import { apiRequest } from '../../core/api/http'

export type User = {
  role:'MASTER'|'ADMIN'|'OPERATIONAL'|'DISABLED'
  assignedRole:'MASTER'|'ADMIN'|'OPERATIONAL'
  canConfigurePermissions:boolean
  id: number
  login: string
  email: string
  isActive: boolean
  removedAt: string | null
  canResetPassword: boolean
  isMaster?: boolean
  isAdmin?: boolean
  mustChangePassword?: boolean
}
export type UserInput = { login: string; email: string;role?:User['role'] }
export type UserPage = { items: User[]; hasNext: boolean }
export function listUsers(
  page: number,
  hideDisabled: boolean,
  signal?: AbortSignal,
) {
  return apiRequest<UserPage>(
    `/users?${new URLSearchParams({ page: String(page), hideDisabled: String(hideDisabled) })}`,
    { signal },
  )
}
export function createUser(input: UserInput & { password: string }) {
  return apiRequest<User>('/users', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
export function updateUser(id: number, input: UserInput) {
  return apiRequest<User>(`/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}
export function disableUser(id: number) {
  return apiRequest<void>(`/users/${id}`, { method: 'DELETE' })
}
export function restoreUser(id: number) {
  return apiRequest<void>(`/users/${id}/restore`, { method: 'PATCH' })
}

export function setTemporaryPassword(
  id: number,
  password: string,
  confirmPassword: string,
) {
  return apiRequest<void>(`/users/${id}/temporary-password`, {
    method: 'PUT',
    body: JSON.stringify({ password, confirmPassword }),
  })
}
