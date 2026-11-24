import { IGenericDatabaseClient } from '@/core/db'
import { permissionCatalog, roleCanHave } from '@/core/access'
export type ClassPolicy = {
  id: number
  name: string
  description: string
  level: 'administrative' | 'operational'
  data_scope: 'own' | 'salon'
  builtin_role: 'ADMIN' | 'OPERATIONAL' | null
  active: boolean
  admin_manageable: boolean
  version: number
}
export async function userPolicy(
  c: Pick<IGenericDatabaseClient, 'query'>,
  userId: number,
) {
  const policy = (
    await c.query(
      'SELECT c.*,COALESCE(p.version,c.version) AS version FROM app_users u JOIN access_classes c ON c.id=u.access_class_id LEFT JOIN access_profiles p ON p.role=c.builtin_role WHERE u.id=$1',
      [userId],
    )
  ).rows[0] as ClassPolicy | undefined
  if (!policy) return null
  const permissions = (
    await c.query(
      'SELECT permission_key AS key,allowed,delegatable FROM effective_class_permissions WHERE class_id=$1 ORDER BY permission_key',
      [policy.id],
    )
  ).rows
  return { ...policy, permissions }
}
export function classCanHave(
  policy: Pick<ClassPolicy, 'level' | 'data_scope' | 'builtin_role'>,
  key: string,
) {
  if (policy.data_scope === 'own') return roleCanHave('OPERATIONAL', key)
  if (policy.builtin_role) return roleCanHave(policy.builtin_role, key)
  if (policy.level === 'administrative')
    return permissionCatalog.some((p) => p[0] === key)
  if (
    [
      'classes.manage',
      'staff.permissions',
      'users.passwords',
      'users.view',
    ].includes(key)
  )
    return false
  return roleCanHave(
    policy.data_scope === 'salon' ? 'ADMIN' : 'OPERATIONAL',
    key,
  )
}
