import {
  IDatabaseService,
  IDatabaseUnitOfWork,
  IGenericDatabaseClient,
} from '@/core/db'
import { AppUser } from '@/core/user'
import {
  can,
  isMaster,
  permissionCatalog,
  validateDependencies,
} from '@/core/access'
import { AccessService } from './service'
import { ClassPolicy, classCanHave, userPolicy } from './policy'
import { bookingError } from '../booking/service'
export type ClassGrant = { key: string; allowed: boolean; delegatable: boolean }
export type ClassInput = {
  name: string
  description: string
  level: 'administrative' | 'operational'
  dataScope: 'own' | 'salon'
  active: boolean
  adminManageable: boolean
  permissions: ClassGrant[]
  version?: number
}
export class ClassService {
  constructor(
    private db: IDatabaseService,
    private work: IDatabaseUnitOfWork,
  ) {}
  async query(sql: string, args: unknown[] = []) {
    const c = await this.db.getClient()
    try {
      return await c.query(sql, args)
    } finally {
      c.release()
    }
  }
  async fresh(c: IGenericDatabaseClient, actor: AppUser) {
    await c.query('SELECT pg_advisory_xact_lock(70430,1)', [])
    const row = (
      await c.query(
        'SELECT role,is_active,removed_at,must_change_password,password_version FROM app_users WHERE id=$1',
        [actor.id],
      )
    ).rows[0]
    if (
      !row?.is_active ||
      row.removed_at ||
      row.must_change_password ||
      row.password_version !== actor.passwordVersion
    )
      bookingError('Current authorization required.', 401)
    return new AccessService(this.db).hydrate({ ...actor, role: row.role }, c)
  }
  authorize(actor: AppUser) {
    if (
      !isMaster(actor) &&
      (actor.role !== 'ADMIN' ||
        !can(actor, 'classes.manage') ||
        !can(actor, 'staff.permissions'))
    )
      bookingError('Class management is not allowed.', 403)
  }
  async row(c: Pick<IGenericDatabaseClient, 'query'>, id: number) {
    const p = (
      await c.query(
        'SELECT c.*,COALESCE(p.version,c.version) AS version FROM access_classes c LEFT JOIN access_profiles p ON p.role=c.builtin_role WHERE c.id=$1',
        [id],
      )
    ).rows[0] as ClassPolicy
    if (!p) bookingError('Access class not found.', 404)
    return p
  }
  async options(actor: AppUser) {
    return (
      await this.query(
        `SELECT id,name,description,level,data_scope AS "dataScope",builtin_role AS "builtinRole" FROM access_classes WHERE active AND ($1::boolean OR (level='operational' AND data_scope='own' AND admin_manageable)) ORDER BY lower(name),id`,
        [isMaster(actor)],
      )
    ).rows
  }
  async list(actor: AppUser) {
    if (
      !isMaster(actor) &&
      (actor.role !== 'ADMIN' || !can(actor, 'staff.permissions'))
    )
      bookingError('Access class consultation is not allowed.', 403)
    const rows = (
      await this.query(
        `SELECT c.id,c.name,c.description,c.level,c.data_scope AS "dataScope",c.builtin_role AS "builtinRole",c.active,c.admin_manageable AS "adminManageable",COALESCE(p.version,c.version) AS version,(SELECT count(*)::int FROM app_users WHERE access_class_id=c.id) AS "userCount" FROM access_classes c LEFT JOIN access_profiles p ON p.role=c.builtin_role WHERE $1::boolean OR c.level='operational' ORDER BY c.builtin_role IS NULL,lower(c.name),c.id`,
        [isMaster(actor)],
      )
    ).rows
    const ceiling = (
      await this.query(
        "SELECT permission_key AS key,delegatable FROM profile_permissions WHERE role='OPERATIONAL'",
      )
    ).rows
    return {
      creationPermissions: permissionCatalog.map(([key]) => ({
        key,
        allowed: false,
        delegatable: false,
        eligible: true,
        editable:
          isMaster(actor) ||
          (!!ceiling.find((g: any) => g.key === key)?.delegatable &&
            can(actor, key)),
      })),
      catalog: new AccessService(this.db).catalog(),
      canCreate: isMaster(actor) || can(actor, 'classes.manage'),
      items: rows.map((p: any) => ({
        ...p,
        editable:
          isMaster(actor) ||
          (p.level === 'operational' &&
            p.dataScope === 'own' &&
            p.adminManageable &&
            (p.builtinRole === 'OPERATIONAL' || can(actor, 'classes.manage'))),
      })),
    }
  }
  async detail(actor: AppUser, id: number) {
    const list = await this.list(actor),
      item = list.items.find((p: any) => p.id === id)
    if (!item) bookingError('Access class not found.', 404)
    const p = await this.row({ query: this.query.bind(this) }, id)
    const permissions = (
      await this.query(
        'SELECT permission_key AS key,allowed,delegatable FROM effective_class_permissions WHERE class_id=$1',
        [id],
      )
    ).rows
    return {
      ...item,
      permissions: permissionCatalog.map(([key]) => {
        const g = permissions.find((p: any) => p.key === key) ?? {
          key,
          allowed: false,
          delegatable: false,
        }
        return {
          ...g,
          eligible: classCanHave(p, key),
          editable:
            item.editable &&
            classCanHave(p, key) &&
            (isMaster(actor) || (g.delegatable && can(actor, key))),
        }
      }),
    }
  }
  async audit(
    c: IGenericDatabaseClient,
    actor: AppUser,
    action: string,
    previous: unknown,
    current: unknown,
    userId?: number,
  ) {
    await c.query(
      'INSERT INTO access_audit(actor_id,target_user_id,action,previous_data,current_data) VALUES($1,$2,$3,$4,$5)',
      [
        actor.id,
        userId ?? null,
        action,
        JSON.stringify(previous),
        JSON.stringify(current),
      ],
    )
  }
  async save(actor: AppUser, id: number | null, d: ClassInput) {
    return this.work.transaction(async (c) => {
      const fresh = await this.fresh(c, actor)
      const master = isMaster(fresh)
      // The old operational defaults remain editable under the already-authorized delegation.
      const old = id ? await this.row(c, id) : null
      if (
        !master &&
        !(
          old?.builtin_role === 'OPERATIONAL' &&
          can(fresh, 'staff.permissions') &&
          fresh.role === 'ADMIN'
        )
      )
        this.authorize(fresh)
      if (old && old.version !== d.version)
        bookingError('Access class changed. Reload before saving.', 409)
      if (
        !master &&
        (d.level !== 'operational' ||
          d.dataScope !== 'own' ||
          (old &&
            (old.level !== 'operational' ||
              old.data_scope !== 'own' ||
              !old.admin_manageable)))
      )
        bookingError('Class is outside ADMIN delegation.', 403)
      if (
        !master &&
        old &&
        (d.adminManageable !== old.admin_manageable ||
          (old.builtin_role &&
            (d.name !== old.name ||
              d.description !== old.description ||
              d.active !== old.active)))
      )
        bookingError(
          'Only MASTER may change built-in class identity or delegation.',
          403,
        )
      if (old?.builtin_role && (!d.active || d.level !== old.level))
        bookingError('Built-in class is protected.', 403)
      const linked = old
        ? (
            await c.query(
              'SELECT count(*)::int n FROM app_users WHERE access_class_id=$1',
              [id],
            )
          ).rows[0].n
        : 0
      if (linked && (!d.active || old.level !== d.level))
        bookingError(
          'Reassign all linked users before deactivating or changing class level.',
          409,
        )
      const policy = {
        level: d.level,
        data_scope: d.dataScope,
        builtin_role: old?.builtin_role ?? null,
      }
      if (
        d.permissions.length !== permissionCatalog.length ||
        new Set(d.permissions.map((p) => p.key)).size !==
          d.permissions.length ||
        d.permissions.some(
          (p) =>
            !permissionCatalog.some((k) => k[0] === p.key) ||
            ((p.allowed || p.delegatable) && !classCanHave(policy, p.key)),
        )
      )
        bookingError('Invalid class permissions.')
      for (const keys of [
        d.permissions.filter((p) => p.allowed).map((p) => p.key),
        d.permissions
          .filter((p) => p.allowed || p.delegatable)
          .map((p) => p.key),
      ])
        if (validateDependencies(keys).length)
          bookingError('Enable required view permissions before their actions.')
      const previous = old
        ? (
            await c.query(
              'SELECT permission_key AS key,allowed,delegatable FROM effective_class_permissions WHERE class_id=$1',
              [id],
            )
          ).rows
        : []
      if (!master) {
        const ceiling = old
          ? previous
          : (
              await c.query(
                "SELECT permission_key AS key,allowed,delegatable FROM profile_permissions WHERE role='OPERATIONAL'",
                [],
              )
            ).rows
        for (const g of d.permissions) {
          const before = ceiling.find((p: any) => p.key === g.key)
          if (old) {
            if (
              g.delegatable !== !!before?.delegatable ||
              (g.allowed !== !!before?.allowed &&
                (!before?.delegatable || !can(fresh, g.key)))
            )
              bookingError('Permission exceeds MASTER delegation.', 403)
          } else if (
            g.delegatable ||
            (g.allowed && (!before?.delegatable || !can(fresh, g.key)))
          )
            bookingError('Permission exceeds MASTER delegation.', 403)
        }
      }
      if (!master && !old) {
        const ceiling = (
          await c.query(
            "SELECT permission_key AS key,delegatable FROM profile_permissions WHERE role='OPERATIONAL'",
            [],
          )
        ).rows
        d = {
          ...d,
          permissions: d.permissions.map((g) => ({
            ...g,
            delegatable:
              !!ceiling.find((p: any) => p.key === g.key)?.delegatable &&
              can(fresh, g.key) &&
              classCanHave(policy, g.key),
          })),
        }
      }
      let classId = id
      if (!id) {
        if (
          (await c.query('SELECT count(*)::int n FROM access_classes', []))
            .rows[0].n >= 200
        )
          bookingError('Access class limit reached.', 409)
        classId = (
          await c.query(
            'INSERT INTO access_classes(name,description,level,data_scope,active,admin_manageable,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
            [
              d.name,
              d.description,
              d.level,
              d.dataScope,
              d.active,
              master ? d.adminManageable : true,
              actor.id,
            ],
          )
        ).rows[0].id
      } else
        await c.query(
          'UPDATE access_classes SET name=$2,description=$3,level=$4,data_scope=$5,active=$6,admin_manageable=$7,version=version+1,updated_at=now() WHERE id=$1',
          [
            id,
            d.name,
            d.description,
            d.level,
            d.dataScope,
            d.active,
            master ? d.adminManageable : old.admin_manageable,
          ],
        )
      for (const p of d.permissions) {
        if (old?.builtin_role)
          await c.query(
            'UPDATE profile_permissions SET allowed=$3,delegatable=$4 WHERE role=$1 AND permission_key=$2',
            [
              old.builtin_role,
              p.key,
              p.allowed,
              old.builtin_role === 'OPERATIONAL' && p.delegatable,
            ],
          )
        else
          await c.query(
            'INSERT INTO class_permissions(class_id,permission_key,allowed,delegatable) VALUES($1,$2,$3,$4) ON CONFLICT(class_id,permission_key) DO UPDATE SET allowed=excluded.allowed,delegatable=excluded.delegatable',
            [classId, p.key, p.allowed, p.delegatable],
          )
      }
      if (old?.builtin_role)
        await c.query(
          'UPDATE access_profiles SET version=version+1 WHERE role=$1',
          [old.builtin_role],
        )
      // Existing individual exceptions are retained, but hydration always intersects the current class ceiling.
      await this.audit(
        c,
        fresh,
        id ? 'class_update' : 'class_create',
        { class: old, permissions: previous },
        { id: classId, ...d },
      )
      return { id: classId }
    })
  }
  async assignInTransaction(
    c: IGenericDatabaseClient,
    actor: AppUser,
    userId: number,
    classId: number,
  ) {
    const master = isMaster(actor)
    if (!master) this.authorize(actor)
    const target = (
      await c.query(
        'SELECT id,role,access_class_id FROM app_users WHERE id=$1 FOR UPDATE',
        [userId],
      )
    ).rows[0]
    if (!target) bookingError('User not found.', 404)
    if (isMaster(target) || target.id === actor.id)
      bookingError('MASTER and your own access class are protected.', 403)
    const next = await this.row(c, classId)
    if (!next.active) bookingError('Access class is inactive.', 409)
    const previous = await userPolicy(c, userId)
    if (
      !master &&
      (target.role !== 'OPERATIONAL' ||
        next.level !== 'operational' ||
        next.data_scope !== 'own' ||
        !next.admin_manageable ||
        (previous &&
          (!previous.admin_manageable || previous.data_scope !== 'own')))
    )
      bookingError('Class assignment is outside ADMIN delegation.', 403)
    if (!master) {
      const grants = (
        await c.query(
          'SELECT p.permission_key AS key,p.allowed,p.delegatable,o.allowed AS override FROM effective_class_permissions p LEFT JOIN user_permission_overrides o ON o.user_id=$2 AND o.permission_key=p.permission_key WHERE p.class_id=$1',
          [classId, userId],
        )
      ).rows
      for (const g of grants.filter(
        (g: any) => (g.allowed || g.delegatable) && (g.override ?? g.allowed),
      ))
        if (!g.delegatable || !can(actor, g.key))
          bookingError('Class grants exceed your delegated permissions.', 403)
    }
    await c.query(
      'UPDATE app_users SET access_class_id=$2,updated_at=now() WHERE id=$1',
      [userId, classId],
    )
    await this.audit(
      c,
      actor,
      'class_assignment',
      { classId: target.access_class_id },
      { classId },
      userId,
    )
    return { id: userId }
  }
  async assign(actor: AppUser, id: number, classId: number) {
    return this.work.transaction(async (c) =>
      this.assignInTransaction(c, await this.fresh(c, actor), id, classId),
    )
  }
}
