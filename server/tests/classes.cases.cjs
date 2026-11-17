const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
module.exports = async ({
  t,
  request,
  requireStatus,
  db,
  master,
  manager,
  professional,
  other,
  employeeId,
}) => {
  const send = async (
    method,
    path,
    body,
    cookie = master.cookie,
    status = 200,
  ) =>
    requireStatus(await request(method, path, cookie, body), status).body.data
  const get = (path, cookie = master.cookie, status = 200) =>
    send('GET', path, undefined, cookie, status)
  const list = await get('/access/classes'),
    catalog = list.catalog
  const admin = list.items.find((c) => c.builtinRole === 'ADMIN'),
    operational = list.items.find((c) => c.builtinRole === 'OPERATIONAL')
  const base = await get('/access/profiles'),
    adminOriginal = base.profiles.find((p) => p.role === 'ADMIN')
  const original = (
    await db.query(
      'SELECT role,access_class_id,hash_password,password_version FROM app_users WHERE id=3',
    )
  ).rows[0]
  const overrides = (
    await db.query(
      'SELECT permission_key,allowed,updated_by FROM user_permission_overrides WHERE user_id=3 ORDER BY permission_key',
    )
  ).rows
  const body = (name, keys = [], extras = {}) => ({
    name,
    description: 'Classe personalizada de teste',
    level: 'operational',
    dataScope: 'own',
    active: true,
    adminManageable: true,
    permissions: catalog.map((c) => ({
      key: c.key,
      allowed: keys.includes(c.key),
      delegatable: false,
    })),
    ...extras,
  })
  const create = (d, cookie = master.cookie, status = 200) =>
    send('POST', '/access/classes', d, cookie, status)
  const detail = (id) => get('/access/classes/' + id)
  const save = (id, d, cookie = master.cookie, status = 200) =>
    send('PUT', '/access/classes/' + id, d, cookie, status)
  const assign = (id, classId, cookie = master.cookie, status = 200) =>
    send('PUT', `/access/users/${id}/class`, { classId }, cookie, status)
  const refresh = () => get('/auth/session', professional.cookie)
  let finance, own, managed, financeEntry, race
  try {
    await t.test(
      'classes: migration preserves built-in policies, membership, password hashes and individual exceptions',
      async () => {
        assert.equal(original.access_class_id, operational.id)
        assert.equal(admin.dataScope, 'salon')
        assert.equal(operational.dataScope, 'own')
        const p = await get('/auth/session')
        assert.equal(p.accessClassId, null)
        assert.equal(p.isMaster, true)
        assert.ok(list.items.every((c) => c.builtinRole))
        await get('/access/classes', professional.cookie, 403)
        const session = await refresh()
        assert.equal(session.accessClassId, operational.id)
        assert.equal(session.dataScope, 'own')
      },
    )
    await t.test(
      'classes: MASTER creates a financial class and assigns it without replacing the current session',
      async () => {
        finance = await create(
          body('Financeiro de teste', ['finance.view', 'finance.manage'], {
            level: 'administrative',
            dataScope: 'salon',
            adminManageable: false,
          }),
        )
        await assign(3, finance.id)
        const session = await refresh()
        assert.equal(session.accessClassName, 'Financeiro de teste')
        assert.equal(session.role, 'ADMIN')
        assert.equal(session.isMaster, false)
        assert.equal(session.dataScope, 'salon')
        assert.deepEqual(session.permissions.sort(), [
          'finance.manage',
          'finance.view',
        ])
        await get('/users', professional.cookie, 403)
        await get('/treatments', professional.cookie, 403)
        await get('/access/classes', professional.cookie, 403)
        const opts = await get('/finance/options', professional.cookie)
        financeEntry = await send(
          'POST',
          '/finance/manual',
          {
            description: 'Pagamento pela classe financeira',
            amount: 12.34,
            isDebit: true,
            methodId: opts.methods[0].id,
            typeId: opts.types[0].id,
            requestKey: randomUUID(),
          },
          professional.cookie,
        )
        const data = await get(
          '/finance?from=2000-01-01&to=2099-12-31',
          professional.cookie,
        )
        assert.ok(data.items.some((i) => i.id === financeEntry.id))
      },
    )
    await t.test(
      'classes: own scope filters financial, client, order and commission information in the backend',
      async () => {
        own = await create(
          body('Equipe de teste', [
            'finance.view',
            'clients.view',
            'orders.view',
            'commissions.view',
          ]),
        )
        await assign(3, own.id)
        const session = await refresh()
        assert.equal(session.role, 'OPERATIONAL')
        assert.equal(session.dataScope, 'own')
        const data = await get(
          '/finance?from=2000-01-01&to=2099-12-31',
          professional.cookie,
        )
        assert.ok(!data.items.some((i) => i.id === financeEntry.id))
        assert.ok(data.items.every((i) => i.orderId))
        const commissions = await get(
          '/commissions/movements?from=2000-01-01&to=2099-12-31',
          professional.cookie,
        )
        assert.ok(commissions.items.every((i) => i.employeeId === employeeId))
        const foreign = (
          await db.query(
            'SELECT s.id FROM salon_schedules s WHERE NOT EXISTS(SELECT 1 FROM salon_schedule_treatments st JOIN employees e ON e.id=st.employee_id WHERE st.schedule_id=s.id AND e.user_id=3) LIMIT 1',
          )
        ).rows[0]
        if (foreign)
          await get('/orders/' + foreign.id, professional.cookie, 404)
        const clients = await get('/customers', professional.cookie)
        for (const c of clients.items)
          assert.ok(
            (
              await db.query(
                'SELECT 1 FROM salon_schedules s JOIN salon_schedule_treatments st ON st.schedule_id=s.id WHERE s.customer_id=$1 AND st.employee_id=$2',
                [c.id, employeeId],
              )
            ).rows.length,
          )
        await send('POST', '/finance/manual', {}, professional.cookie, 403)
      },
    )
    await t.test(
      'classes: names confer no powers and only MASTER may explicitly grant salon-wide scope',
      async () => {
        const noPower = await create(body('Master financeiro sem poderes'))
        await assign(3, noPower.id)
        assert.deepEqual((await refresh()).permissions, [])
        await get(
          '/finance?from=2000-01-01&to=2099-12-31',
          professional.cookie,
          403,
        )
        const global = await create(
          body('Relatório global operacional', ['finance.view'], {
            dataScope: 'salon',
          }),
        )
        await assign(3, global.id)
        assert.equal((await refresh()).role, 'OPERATIONAL')
        assert.equal((await refresh()).dataScope, 'salon')
        assert.ok(
          (
            await get(
              '/finance?from=2000-01-01&to=2099-12-31',
              professional.cookie,
            )
          ).items.some((i) => i.id === financeEntry.id),
        )
        await get('/users', professional.cookie, 403)
        await assign(3, own.id)
      },
    )
    await t.test(
      'classes: dependency validation, unique names, active classes and stale versions are enforced',
      async () => {
        await create(
          body('Inconsistente', ['finance.manage'], {
            level: 'administrative',
            dataScope: 'salon',
          }),
          master.cookie,
          400,
        )
        await create(
          body('  FINANCEIRO DE TESTE  ', [], {
            level: 'administrative',
            dataScope: 'salon',
          }),
          master.cookie,
          409,
        )
        const initial = await detail(own.id)
        await save(own.id, { ...initial, description: 'Descrição atualizada' })
        await save(own.id, initial, master.cookie, 409)
        await send(
          'PUT',
          '/access/users/3',
          {
            classId: finance.id,
            profileVersion: (await detail(own.id)).version,
            changes: [],
          },
          master.cookie,
          409,
        )
        const inactive = await create(
          body('Classe inativa', [], { active: false }),
        )
        await assign(3, inactive.id, master.cookie, 409)
        assert.ok(
          !(await get('/access/classes/options')).some(
            (c) => c.id === inactive.id,
          ),
        )
      },
    )
    await t.test(
      'classes: existing sessions immediately follow class permissions and authorized individual exceptions',
      async () => {
        let d = await detail(own.id)
        await save(own.id, {
          ...d,
          permissions: d.permissions.map((g) => ({
            ...g,
            allowed: g.key === 'finance.view' ? false : g.allowed,
            delegatable: g.key === 'finance.view' ? true : g.delegatable,
          })),
        })
        await get(
          '/finance?from=2000-01-01&to=2099-12-31',
          professional.cookie,
          403,
        )
        let individual = await get('/access/users/3')
        await send('PUT', '/access/users/3', {
          profileVersion: individual.profileVersion,
          changes: [{ key: 'finance.view', allowed: true }],
        })
        await get('/finance?from=2000-01-01&to=2099-12-31', professional.cookie)
        d = await detail(own.id)
        await save(own.id, {
          ...d,
          permissions: d.permissions.map((g) => ({
            ...g,
            allowed: g.key === 'finance.view' ? false : g.allowed,
            delegatable: g.key === 'finance.view' ? false : g.delegatable,
          })),
        })
        await get(
          '/finance?from=2000-01-01&to=2099-12-31',
          professional.cookie,
          403,
        )
        // Restore the original exception, so class changes never silently erase it.
        if (overrides.some((o) => o.permission_key === 'finance.view'))
          await db.query(
            'UPDATE user_permission_overrides SET allowed=$2,updated_by=$3 WHERE user_id=3 AND permission_key=$1',
            [
              'finance.view',
              overrides.find((o) => o.permission_key === 'finance.view')
                .allowed,
              overrides.find((o) => o.permission_key === 'finance.view')
                .updated_by,
            ],
          )
        else
          await db.query(
            "DELETE FROM user_permission_overrides WHERE user_id=3 AND permission_key='finance.view'",
          )
      },
    )
    await t.test(
      'classes: ADMIN management is explicitly enabled by MASTER and stays inside delegated operational ceilings',
      async () => {
        await create(
          body('Sem autorização', ['finance.view']),
          manager.cookie,
          403,
        )
        const profiles = await get('/access/profiles'),
          p = profiles.profiles.find((p) => p.role === 'ADMIN')
        await send('PUT', '/access/profiles/ADMIN', {
          version: p.version,
          permissions: p.permissions.map((g) => ({
            ...g,
            allowed: g.key === 'classes.manage' ? true : g.allowed,
          })),
        })
        managed = await create(
          body('Equipe criada pelo Admin', ['finance.view']),
          manager.cookie,
        )
        let d = await detail(managed.id)
        assert.equal(d.level, 'operational')
        assert.equal(d.adminManageable, true)
        assert.equal(
          d.permissions.find((g) => g.key === 'finance.view').delegatable,
          true,
        )
        await assign(3, managed.id, manager.cookie)
        assert.equal((await refresh()).accessClassId, managed.id)
        d = await detail(managed.id)
        await save(
          managed.id,
          {
            ...d,
            name: 'Equipe renomeada pelo Admin',
            description: 'Apenas comissão autorizada',
            permissions: d.permissions.map((g) => ({ ...g, allowed: false })),
          },
          manager.cookie,
        )
        await get(
          '/finance?from=2000-01-01&to=2099-12-31',
          professional.cookie,
          403,
        )
        await save(
          managed.id,
          { ...(await detail(managed.id)), dataScope: 'salon' },
          manager.cookie,
          403,
        )
        await create(
          body('Admin indevido', [], {
            level: 'administrative',
            dataScope: 'salon',
          }),
          manager.cookie,
          403,
        )
        await save(finance.id, await detail(finance.id), manager.cookie, 403)
        await assign(2, managed.id, manager.cookie, 403)
        await assign(1, managed.id, manager.cookie, 403)
        await assign(3, finance.id, manager.cookie, 403)
      },
    )
    await t.test(
      'classes: linked users prevent deactivation and changes of level; reassignment is explicit',
      async () => {
        let d = await detail(managed.id)
        await save(managed.id, { ...d, active: false }, master.cookie, 409)
        await save(
          managed.id,
          { ...d, level: 'administrative', dataScope: 'salon' },
          master.cookie,
          409,
        )
        await assign(3, operational.id)
        d = await detail(managed.id)
        await save(managed.id, { ...d, active: false }, manager.cookie)
        await assign(3, managed.id, master.cookie, 409)
        await save(
          admin.id,
          { ...(await detail(admin.id)), active: false },
          master.cookie,
          403,
        )
      },
    )
    await t.test(
      'classes: create/edit user support custom classes atomically and never change MASTER through class assignment',
      async () => {
        const login = 'class.' + randomUUID().slice(0, 10)
        const u = await send('POST', '/users', {
          login,
          email: login + '@example.test',
          password: 'Test-password-123',
          accessClassId: finance.id,
        })
        assert.equal(u.accessClassName, 'Financeiro de teste')
        assert.equal(u.role, 'ADMIN')
        const updated = await send('PUT', '/users/' + u.id, {
          login,
          email: u.email,
          accessClassId: own.id,
        })
        assert.equal(updated.accessClassName, (await detail(own.id)).name)
        assert.equal(updated.role, 'OPERATIONAL')
        await assign(1, own.id, master.cookie, 403)
        const before = (await db.query('SELECT count(*)::int n FROM app_users'))
          .rows[0].n
        await send(
          'POST',
          '/users',
          {
            login: 'bad.' + randomUUID().slice(0, 8),
            email: 'bad.' + randomUUID() + '@example.test',
            password: 'Test-password-123',
            accessClassId: managed.id,
          },
          master.cookie,
          409,
        )
        assert.equal(
          (await db.query('SELECT count(*)::int n FROM app_users')).rows[0].n,
          before,
        )
      },
    )
    await t.test(
      'classes: concurrent deactivation and assignment cannot link users to inactive classes',
      async () => {
        race = await create(body('Classe concorrente'))
        const d = await detail(race.id)
        const results = await Promise.all([
          request('PUT', '/access/classes/' + race.id, master.cookie, {
            ...d,
            active: false,
          }),
          request('PUT', '/access/users/4/class', master.cookie, {
            classId: race.id,
          }),
        ])
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 409])
        assert.equal(
          (
            await db.query(
              'SELECT count(*)::int n FROM app_users u JOIN access_classes c ON c.id=u.access_class_id WHERE NOT c.active',
            )
          ).rows[0].n,
          0,
        )
        await assign(4, operational.id)
      },
    )
    await t.test(
      'classes: class and assignment audit is recorded without credentials; migration preserves user exceptions',
      async () => {
        const audit = await get('/access/classes/' + own.id + '/audit')
        assert.ok(audit.some((a) => a.action === 'class_create'))
        assert.ok(audit.some((a) => a.action === 'class_assignment'))
        assert.ok(audit.some((a) => a.action === 'class_update'))
        assert.ok(audit.every((a) => a.author && a.createdAt))
        assert.ok(!JSON.stringify(audit).includes('hash_password'))
        const current = (
          await db.query(
            'SELECT hash_password,password_version FROM app_users WHERE id=3',
          )
        ).rows[0]
        assert.equal(current.hash_password, original.hash_password)
        assert.equal(current.password_version, original.password_version)
        assert.deepEqual(
          (
            await db.query(
              'SELECT permission_key,allowed,updated_by FROM user_permission_overrides WHERE user_id=3 ORDER BY permission_key',
            )
          ).rows,
          overrides,
        )
      },
    )
  } finally {
    await assign(3, operational.id)
    const profiles = await get('/access/profiles'),
      p = profiles.profiles.find((p) => p.role === 'ADMIN')
    await send('PUT', '/access/profiles/ADMIN', {
      version: p.version,
      permissions: adminOriginal.permissions,
    })
  }
}
