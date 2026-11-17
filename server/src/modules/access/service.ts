import {
  IDatabaseService,
  IDatabaseUnitOfWork,
  IGenericDatabaseClient,
} from '@/core/db'
import { AppUser, AppUserSchema } from '@/core/user'
import {
  allPermissionKeys,
  isMaster,
  can,
  permissionCatalog,
  Role,
  roleCanHave,
  validateDependencies,
  resolveDependencies,
  requireFreshMaster,
} from '@/core/access'
import { MASTER_USER_ID } from '@/core/config'
import { bookingError } from '../booking/service'
type Grant = { key: string; allowed: boolean; delegatable: boolean }
export class AccessService {
  constructor(
    private db: IDatabaseService,
    private work?: IDatabaseUnitOfWork,
  ) {}
  async query(sql: string, params: unknown[] = []) {
    const c = await this.db.getClient()
    try {
      return await c.query(sql, params)
    } finally {
      c.release()
    }
  }
  async hydrate(
    user: AppUser,
    client?: IGenericDatabaseClient,
  ): Promise<AppUser> {
    if (isMaster(user))
      return { ...user, role: 'MASTER', permissions: [...allPermissionKeys] }
    const query = (sql: string, params: unknown[]) =>
      client ? client.query(sql, params) : this.query(sql, params)
    const rows = (
      await query(
        `SELECT p.permission_key AS key,p.allowed,p.delegatable,o.allowed AS override FROM profile_permissions p LEFT JOIN user_permission_overrides o ON o.user_id=$1 AND o.permission_key=p.permission_key WHERE p.role=$2`,
        [user.id, user.role],
      )
    ).rows
    return {
      ...user,
      permissions: resolveDependencies(
        rows
          .filter(
            (r: {
              key: string
              allowed: boolean
              delegatable: boolean
              override: boolean | null
            }) =>
              roleCanHave(user.role, r.key) &&
              (r.allowed || r.delegatable) &&
              (r.override ?? r.allowed),
          )
          .map((r: { key: string }) => r.key),
      ),
    }
  }
  catalog() {
    return permissionCatalog.map(
      ([key, group, label, operational, requires]) => ({
        key,
        group,
        label,
        operational,
        requires,
      }),
    )
  }
  async profiles() {
    return (
      await this.query(
        `SELECT r.role,r.version,json_agg(json_build_object('key',p.permission_key,'allowed',p.allowed,'delegatable',p.delegatable) ORDER BY p.permission_key) AS permissions FROM access_profiles r JOIN profile_permissions p ON p.role=r.role GROUP BY r.role,r.version ORDER BY r.role`,
      )
    ).rows
  }
  async saveProfile(
    actor: AppUser,
    role: 'ADMIN' | 'OPERATIONAL',
    version: number,
    grants: Grant[],
  ) {
    if (!isMaster(actor))
      bookingError('Only MASTER can configure profiles.', 403)
    this.validateGrants(role, grants)
    const missing = [
      ...validateDependencies(
        grants.filter((g) => g.allowed).map((g) => g.key),
      ),
      ...validateDependencies(
        grants.filter((g) => g.allowed || g.delegatable).map((g) => g.key),
      ),
    ]
    if (missing.length)
      bookingError(
        'Enable required view permissions for: ' + missing.join(', '),
      )
    return this.work.transaction(async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(70430,1)', [])
      await requireFreshMaster(c, actor)
      const previous = (
        await c.query(
          'SELECT version FROM access_profiles WHERE role=$1 FOR UPDATE',
          [role],
        )
      ).rows[0]
      if (previous.version !== version)
        bookingError('Profile changed. Reload before saving.', 409)
      const old = (
        await c.query(
          'SELECT permission_key,allowed,delegatable FROM profile_permissions WHERE role=$1 ORDER BY permission_key',
          [role],
        )
      ).rows
      for (const g of grants)
        await c.query(
          'UPDATE profile_permissions SET allowed=$3,delegatable=$4 WHERE role=$1 AND permission_key=$2',
          [role, g.key, g.allowed, role === 'OPERATIONAL' && g.delegatable],
        )
      for (const g of grants.filter((g) => !g.allowed && !g.delegatable))
        await c.query(
          'DELETE FROM user_permission_overrides o USING app_users u WHERE o.user_id=u.id AND u.role=$1 AND o.permission_key=$2',
          [role, g.key],
        )
      // Revocations at profile level override all individual grants immediately.
      await c.query(
        'UPDATE access_profiles SET version=version+1 WHERE role=$1',
        [role],
      )
      await c.query(
        `INSERT INTO access_audit(actor_id,target_role,action,previous_data,current_data) VALUES($1,$2,'profile_permissions',$3,$4)`,
        [actor.id, role, JSON.stringify(old), JSON.stringify(grants)],
      )
      return { version: version + 1 }
    })
  }
  validateGrants(role: Role, grants: Grant[]) {
    if (
      grants.length !== permissionCatalog.length ||
      new Set(grants.map((g) => g.key)).size !== grants.length ||
      grants.some(
        (g) =>
          !permissionCatalog.some((p) => p[0] === g.key) ||
          ((g.allowed || g.delegatable) && !roleCanHave(role, g.key)) ||
          (role !== 'OPERATIONAL' && g.delegatable),
      )
    )
      bookingError('Invalid or protected profile permissions.')
  }
  async target(actor: AppUser, id: number) {
    if (
      !isMaster(actor) &&
      (!can(actor, 'staff.permissions') || actor.role !== 'ADMIN')
    )
      bookingError('Permission management is not allowed.', 403)
    const raw = (
      await this.query(
        `SELECT id,login,email,role,is_active AS "isActive",is_admin AS "isAdmin",must_change_password AS "mustChangePassword",password_version AS "passwordVersion",created_at AS "createdAt",updated_at AS "updatedAt",removed_at AS "removedAt" FROM app_users WHERE id=$1`,
        [id],
      )
    ).rows[0]
    if (!raw) bookingError('User not found.', 404)
    const target = AppUserSchema.parse(raw)
    if (isMaster(target) || id === actor.id)
      bookingError('MASTER permissions cannot be restricted or delegated.', 403)
    if (!isMaster(actor) && target.role !== 'OPERATIONAL')
      bookingError('ADMIN can configure operational users only.', 403)
    return target
  }
  async individual(actor: AppUser, id: number) {
    const target = await this.target(actor, id)
    const profiles = await this.profiles(),
      profile = profiles.find((p: { role: string }) => p.role === target.role)
    const overrides = (
      await this.query(
        'SELECT permission_key AS key,allowed FROM user_permission_overrides WHERE user_id=$1 ORDER BY permission_key',
        [id],
      )
    ).rows
    const effective = await this.hydrate(target)
    return {
      user: { id: target.id, login: target.login, role: target.role },
      profileVersion: profile.version,
      overrides,
      effective: effective.permissions,
      permissions: profile.permissions.map((p: Grant) => ({
        ...p,
        editable:
          roleCanHave(target.role, p.key) &&
          (isMaster(actor)
            ? p.allowed || p.delegatable
            : p.delegatable && can(actor, p.key)),
      })),
    }
  }
  async saveIndividual(
    actor: AppUser,
    id: number,
    profileVersion: number,
    changes: { key: string; allowed: boolean | null }[],
  ) {
    await this.target(actor, id)
    return this.work.transaction(async (c) => {
      // Serializes policy changes, role changes and delegation checks to avoid stale-authority races.
      await c.query('SELECT pg_advisory_xact_lock(70430,1)', [])
      const fresh = (
        await c.query(
          'SELECT role,is_active,removed_at,must_change_password,password_version FROM app_users WHERE id=$1',
          [actor.id],
        )
      ).rows[0]
      if (
        !fresh?.is_active ||
        fresh.removed_at ||
        fresh.must_change_password ||
        fresh.password_version !== actor.passwordVersion
      )
        bookingError('User is disabled.', 401)
      const freshActor = await this.hydrate(
        { ...actor, role: fresh.role as Role },
        c,
      )
      // Reads use the same transaction/client below; no nested pool acquisition under a transaction lock.
      const target = (
        await c.query('SELECT id,role FROM app_users WHERE id=$1 FOR UPDATE', [
          id,
        ])
      ).rows[0]
      if (
        !target ||
        id === MASTER_USER_ID ||
        target.role === 'MASTER' ||
        id === actor.id ||
        (!isMaster(freshActor) &&
          (freshActor.role !== 'ADMIN' ||
            !can(freshActor, 'staff.permissions') ||
            target.role !== 'OPERATIONAL'))
      )
        bookingError('Target is outside your permission-management scope.', 403)
      const profile = (
        await c.query('SELECT version FROM access_profiles WHERE role=$1', [
          target.role,
        ])
      ).rows[0]
      if (profile.version !== profileVersion)
        bookingError('Profile changed. Reload before saving.', 409)
      const policy = (
        await c.query(
          'SELECT permission_key AS key,allowed,delegatable FROM profile_permissions WHERE role=$1',
          [target.role],
        )
      ).rows
      const old = (
        await c.query(
          'SELECT permission_key AS key,allowed FROM user_permission_overrides WHERE user_id=$1',
          [id],
        )
      ).rows
      if (
        new Set(changes.map((g) => g.key)).size !== changes.length ||
        changes.length > permissionCatalog.length
      )
        bookingError('Duplicate or invalid permission changes.')
      for (const change of changes) {
        const p = policy.find((p: Grant) => p.key === change.key)
        if (
          !p ||
          !roleCanHave(target.role, change.key) ||
          (!isMaster(freshActor) &&
            (!p.delegatable || !can(freshActor, change.key))) ||
          (change.allowed === true && !p.allowed && !p.delegatable)
        )
          bookingError(
            'Permission is outside the limits defined by MASTER.',
            403,
          )
        if (change.allowed === null)
          await c.query(
            'DELETE FROM user_permission_overrides WHERE user_id=$1 AND permission_key=$2',
            [id, change.key],
          )
        else
          await c.query(
            'INSERT INTO user_permission_overrides(user_id,permission_key,allowed,updated_by) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,permission_key) DO UPDATE SET allowed=excluded.allowed,updated_by=excluded.updated_by,updated_at=now()',
            [id, change.key, change.allowed, actor.id],
          )
      }
      const updated = (
        await c.query(
          'SELECT permission_key AS key,allowed FROM user_permission_overrides WHERE user_id=$1',
          [id],
        )
      ).rows
      const allowed = policy
        .filter(
          (p: Grant) =>
            (p.allowed || p.delegatable) &&
            (updated.find(
              (o: { key: string; allowed: boolean }) => o.key === p.key,
            )?.allowed ??
              p.allowed),
        )
        .map((p: Grant) => p.key)
      const missing = validateDependencies(allowed)
      if (missing.length)
        bookingError(
          'Enable required view permissions or disable dependent actions: ' +
            missing.join(', '),
        )
      await c.query(
        `INSERT INTO access_audit(actor_id,target_user_id,action,previous_data,current_data) VALUES($1,$2,'user_permissions',$3,$4)`,
        [actor.id, id, JSON.stringify(old), JSON.stringify(updated)],
      )
      return { id }
    })
  }
}
