import type { AuthUser } from './authContext'
export const roleLabels = {
  MASTER: 'Master',
  ADMIN: 'Admin',
  OPERATIONAL: 'Operacional',
  DISABLED: 'Desabilitado',
} as const
export function allowed(user: AuthUser | null, key: string) {
  return !!user && (user.role === 'MASTER' || user.permissions?.includes(key))
}
export const pagePermissions: Record<string, string> = {
  '/dashboard/schedule': 'agenda.view',
  '/dashboard/clientes': 'clients.view',
  '/dashboard/financeiro': 'finance.view',
  '/dashboard/funcionarios': 'employees.view',
  '/dashboard/servicos': 'services.view',
  '/dashboard/configuracoes-agenda': 'booking.settings',
  '/dashboard/usuarios': 'users.view',
  '/dashboard/social/aniversariantes': 'birthdays.view',
  '/dashboard/social/promocoes': 'promotions.view',
  '/dashboard/permissoes-perfis': 'profiles.manage',
}
export function firstAllowedPage(user: AuthUser | null) {
  return (
    Object.entries(pagePermissions).find(([, key]) =>
      allowed(user, key),
    )?.[0] ?? '/dashboard/sem-acesso'
  )
}
