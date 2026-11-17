import type { AuthUser } from './authContext'
export const roleLabels = {
  MASTER: 'Master',
  ADMIN: 'Admin',
  OPERATIONAL: 'Operacional',
  DISABLED: 'Desabilitado',
} as const
export function allowed(user: AuthUser | null, key: string | string[]) {
  return (
    !!user &&
    (user.role === 'MASTER' ||
      (Array.isArray(key)
        ? key.some((k) => user.permissions?.includes(k))
        : user.permissions?.includes(key)))
  )
}
export const pagePermissions: Record<string, string | string[]> = {
  '/dashboard/schedule': 'agenda.view',
  '/dashboard/clientes': 'clients.view',
  '/dashboard/financeiro': 'finance.view',
  '/dashboard/produtos': 'products.view',
  '/dashboard/funcionarios': ['employees.view', 'commissions.view'],
  '/dashboard/servicos': 'services.view',
  '/dashboard/configuracoes-agenda': 'booking.settings',
  '/dashboard/usuarios': 'users.view',
  '/dashboard/social/aniversariantes': 'birthdays.view',
  '/dashboard/social/promocoes': 'promotions.view',
  '/dashboard/permissoes-perfis': 'staff.permissions',
}
export function firstAllowedPage(user: AuthUser | null) {
  return (
    Object.entries(pagePermissions).find(([, key]) =>
      allowed(user, key),
    )?.[0] ?? '/dashboard/sem-acesso'
  )
}
