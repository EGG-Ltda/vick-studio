import { AppUser, PublicAppUser } from '@/core/user'
import { can, isMaster, allPermissionKeys } from '@/core/access'

export function canManagePasswords(user: AppUser): boolean {
  return can(user, 'users.passwords')
}

export function publicUser(user: AppUser): PublicAppUser {
  return {
    role:
      !user.isActive || user.removedAt
        ? 'DISABLED'
        : isMaster(user)
          ? 'MASTER'
          : user.role,
    assignedRole: isMaster(user) ? 'MASTER' : user.role,
    permissions:
      !user.isActive || user.removedAt
        ? []
        : isMaster(user)
          ? [...allPermissionKeys]
          : user.permissions,
    id: user.id,
    login: user.login,
    email: user.email,
    isActive: user.isActive,
    isAdmin: user.isAdmin,
    isMaster: isMaster(user),
    canManagePasswords: canManagePasswords(user),
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    removedAt: user.removedAt,
  }
}

export function canResetPassword(
  actor: AppUser,
  target: Pick<AppUser, 'id' | 'isAdmin' | 'isActive' | 'removedAt'> & {
    role: string
  },
): boolean {
  return (
    canManagePasswords(actor) &&
    !actor.mustChangePassword &&
    actor.id !== target.id &&
    target.isActive &&
    !target.removedAt &&
    (isMaster(actor) || (!isMaster(target) && target.role !== 'ADMIN'))
  )
}
