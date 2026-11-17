import { MASTER_USER_ID } from '@/core/config'
import { AppUser, PublicAppUser } from '@/core/user'

export function canManagePasswords(user: AppUser): boolean {
  return user.id === MASTER_USER_ID || user.isAdmin
}

export function publicUser(user: AppUser): PublicAppUser {
  return {
    id: user.id,
    login: user.login,
    email: user.email,
    isActive: user.isActive,
    isAdmin: user.isAdmin,
    isMaster: user.id === MASTER_USER_ID,
    canManagePasswords: canManagePasswords(user),
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    removedAt: user.removedAt,
  }
}

export function canResetPassword(
  actor: AppUser,
  target: Pick<AppUser, 'id' | 'isAdmin' | 'isActive' | 'removedAt'>,
): boolean {
  return (
    canManagePasswords(actor) &&
    !actor.mustChangePassword &&
    actor.id !== target.id &&
    target.isActive &&
    !target.removedAt &&
    (actor.id === MASTER_USER_ID ||
      (target.id !== MASTER_USER_ID && !target.isAdmin))
  )
}
