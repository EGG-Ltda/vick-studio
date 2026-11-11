const assert = require('node:assert/strict')
const { randomUUID, randomBytes } = require('node:crypto')
module.exports = async ({
  t,
  request,
  requireStatus,
  db,
  master,
  manager,
  professional,
  other,
  alice,
  employeeId,
}) => {
  const get = async (path, cookie = master.cookie, status = 200) =>
    requireStatus(await request('GET', path, cookie), status).body.data
  const send = async (
    method,
    path,
    body,
    cookie = master.cookie,
    status = 200,
  ) =>
    requireStatus(await request(method, path, cookie, body), status).body.data
  const original = await get('/access/profiles'),
    catalog = original.catalog
  const saveProfile = async (
    role,
    permissions,
    cookie = master.cookie,
    status = 200,
    version,
  ) => {
    const current = await get('/access/profiles')
    return send(
      'PUT',
      '/access/profiles/' + role,
      {
        version:
          version ?? current.profiles.find((p) => p.role === role).version,
        permissions,
      },
      cookie,
      status,
    )
  }
  const restore = async (role) =>
    saveProfile(
      role,
      original.profiles.find((p) => p.role === role).permissions,
    )
  function deny(grants, key) {
    const next = grants.map((g) => ({ ...g }))
    next.find((g) => g.key === key).allowed = false
    next.find((g) => g.key === key).delegatable = false
    let changed = true
    while (changed) {
      changed = false
      for (const c of catalog) {
        const g = next.find((g) => g.key === c.key)
        if (
          g.allowed &&
          c.requires.some((k) => !next.find((g) => g.key === k)?.allowed)
        ) {
          g.allowed = false
          changed = true
        }
        if (
          g.delegatable &&
          c.requires.some((k) => {
            const p = next.find((g) => g.key === k)
            return !p.allowed && !p.delegatable
          })
        ) {
          g.delegatable = false
          changed = true
        }
      }
    }
    return next
  }
  const today = new Date().toLocaleDateString('en-CA', {
      timeZone: 'America/Sao_Paulo',
    }),
    period = `from=${today}&to=${today}`
  let newUser, newAdmin, newSession
  await t.test(
    'access: users have explicit profiles and only MASTER creates or assigns accounts',
    async () => {
      assert.equal((await get('/auth/session')).role, 'MASTER')
      assert.equal((await get('/auth/session', manager.cookie)).role, 'ADMIN')
      assert.equal(
        (await get('/auth/session', professional.cookie)).role,
        'OPERATIONAL',
      )
      assert.ok(
        (await get('/auth/session', professional.cookie)).permissions.includes(
          'finance.view',
        ),
      )
      await get('/access/profiles', manager.cookie, 403)
      await get('/access/profiles', professional.cookie, 403)
      await get('/users', professional.cookie, 403)
      const password = randomBytes(12).toString('hex'),
        body = {
          login: 'acl-new',
          email: 'acl-new@example.test',
          password,
          role: 'OPERATIONAL',
        }
      await send('POST', '/users', body, manager.cookie, 403)
      await send(
        'POST',
        '/users',
        { ...body, role: 'MASTER' },
        professional.cookie,
        403,
      )
      newUser = await send('POST', '/users', body)
      assert.equal(newUser.role, 'OPERATIONAL')
      assert.equal(newUser.mustChangePassword, true)
      const limited = requireStatus(
        await request('POST', '/auth/signin', '', {
          login: body.login,
          password,
        }),
        200,
      )
      newSession = requireStatus(
        await request('POST', '/auth/change-password', limited.cookie, {
          newPassword: randomBytes(12).toString('hex'),
          confirmPassword: 'mismatch',
        }),
        400,
      )
      const personal = randomBytes(12).toString('hex')
      newSession = requireStatus(
        await request('POST', '/auth/change-password', limited.cookie, {
          newPassword: personal,
          confirmPassword: personal,
        }),
        200,
      )
      assert.ok(newSession.body.data.permissions.includes('agenda.view'))
      await send(
        'PUT',
        '/users/' + newUser.id,
        { login: body.login, email: body.email, role: 'ADMIN' },
        manager.cookie,
        403,
      )
      await send(
        'PUT',
        '/users/1',
        { login: 'user1', email: 'user1@example.test', role: 'OPERATIONAL' },
        master.cookie,
        403,
      )
      newAdmin = await send('POST', '/users', {
        ...body,
        login: 'acl-admin',
        email: 'acl-admin@example.test',
        role: 'ADMIN',
      })
      assert.equal(newAdmin.role, 'ADMIN')
      assert.ok(
        (await get('/users', manager.cookie)).items.every(
          (u) => u.assignedRole === 'OPERATIONAL',
        ),
      )
    },
  )
  await t.test(
    'access: ADMIN delegates only permitted employee functions and cannot edit any administrator or MASTER',
    async () => {
      await get('/access/users/1', manager.cookie, 403)
      await get('/access/users/2', manager.cookie, 403)
      await get('/access/users/' + newAdmin.id, manager.cookie, 403)
      await get('/access/users/3', professional.cookie, 403)
      const target = await get('/access/users/3', manager.cookie)
      assert.ok(
        target.permissions.find((p) => p.key === 'services.view').editable,
      )
      await send(
        'PUT',
        '/access/users/3',
        {
          profileVersion: target.profileVersion,
          changes: [{ key: 'users.create', allowed: true }],
        },
        manager.cookie,
        403,
      )
      await send(
        'PUT',
        '/access/users/3',
        {
          profileVersion: target.profileVersion,
          changes: [{ key: 'services.view', allowed: false }],
        },
        manager.cookie,
      )
      await get('/treatments', professional.cookie, 403)
      assert.ok(
        !(await get('/auth/session', professional.cookie)).permissions.includes(
          'services.view',
        ),
      )
      await send(
        'PUT',
        '/access/users/3',
        {
          profileVersion: target.profileVersion,
          changes: [{ key: 'services.view', allowed: null }],
        },
        manager.cookie,
      )
      await get('/treatments', professional.cookie)
    },
  )
  await t.test('access: financial-view delegation adjusts dependent actions and rejects inconsistent requests',async()=>{
    const target=await get('/access/users/3',manager.cookie)
    const keys=['finance.view','agenda.deposit','orders.payments','clients.financial']
    try{
      await send('PUT','/access/users/3',{profileVersion:target.profileVersion,changes:[{key:'finance.view',allowed:false}]},manager.cookie,400)
      assert.ok((await get('/auth/session',professional.cookie)).permissions.includes('finance.view'))
      await send('PUT','/access/users/3',{profileVersion:target.profileVersion,changes:keys.map(key=>({key,allowed:false}))},manager.cookie)
      await get('/finance?'+period,professional.cookie,403)
      assert.equal((await get('/customers/'+alice.body.data.customerId,professional.cookie)).totalPaid,null)
    }finally{await send('PUT','/access/users/3',{profileVersion:target.profileVersion,changes:keys.map(key=>({key,allowed:null}))},manager.cookie)}
  })
  await t.test('access: administrative cross-origin requests are rejected and self profile never leaks credentials',async()=>{
    requireStatus(await request('GET','/access/profiles',master.cookie,undefined,{Origin:'https://untrusted.example.test'}),403)
    const self=await get('/users/@me',professional.cookie)
    assert.equal(self.role,'OPERATIONAL');assert.equal('hashPassword' in self,false);assert.equal('passwordVersion' in self,false)
    await send('PUT','/users/@me',{},professional.cookie,403)
  })
  await t.test(
    'access: role ceilings revoke individual grants immediately and stale delegation is rejected',
    async () => {
      try {
        const op = original.profiles
          .find((p) => p.role === 'OPERATIONAL')
          .permissions.map((p) =>
            p.key === 'services.view'
              ? { ...p, allowed: false, delegatable: true }
              : { ...p },
          )
        await saveProfile('OPERATIONAL', op)
        await get('/treatments', professional.cookie, 403)
        const target = await get('/access/users/3', manager.cookie)
        await send(
          'PUT',
          '/access/users/3',
          {
            profileVersion: target.profileVersion,
            changes: [{ key: 'services.view', allowed: true }],
          },
          manager.cookie,
        )
        await get('/treatments', professional.cookie)
        await saveProfile(
          'OPERATIONAL',
          op.map((p) =>
            p.key === 'services.view' ? { ...p, delegatable: false } : p,
          ),
        )
        await get('/treatments', professional.cookie, 403)
        await send(
          'PUT',
          '/access/users/3',
          {
            profileVersion: target.profileVersion,
            changes: [{ key: 'services.view', allowed: true }],
          },
          manager.cookie,
          409,
        )
        const fresh = await get('/access/users/3', manager.cookie)
        await send(
          'PUT',
          '/access/users/3',
          {
            profileVersion: fresh.profileVersion,
            changes: [{ key: 'services.view', allowed: true }],
          },
          manager.cookie,
          403,
        )
        assert.equal(
          (
            await db.query(
              "SELECT count(*)::int AS n FROM user_permission_overrides WHERE user_id=3 AND permission_key='services.view'",
            )
          ).rows[0].n,
          0,
        )
        await saveProfile(
          'OPERATIONAL',
          op.map((p) =>
            p.key === 'users.create' ? { ...p, allowed: true } : p,
          ),
          manager.cookie,
          403,
        )
      } finally {
        await restore('OPERATIONAL')
      }
    },
  )
  await t.test(
    'access: password-reset permission is independent of other administrative functions',
    async () => {
      try {
        await saveProfile(
          'ADMIN',
          deny(
            original.profiles.find((p) => p.role === 'ADMIN').permissions,
            'users.passwords',
          ),
        )
        await get('/booking/settings', manager.cookie)
        await get('/booking/employees', manager.cookie)
        await get('/social/promotions', manager.cookie)
        await get('/finance/options', manager.cookie)
        await send(
          'PUT',
          '/users/3/temporary-password',
          {
            password: 'No-change-password-1',
            confirmPassword: 'No-change-password-1',
          },
          manager.cookie,
          403,
        )
      } finally {
        await restore('ADMIN')
      }
    },
  )
  await t.test(
    'access: revoking financial access redacts secondary screens and limits ADMIN delegation',
    async () => {
      try {
        const admin = deny(
          original.profiles.find((p) => p.role === 'ADMIN').permissions,
          'finance.view',
        )
        await saveProfile('ADMIN', admin)
        await get('/finance?' + period, manager.cookie, 403)
        const c = await get(
          '/customers/' + alice.body.data.customerId,
          manager.cookie,
        )
        assert.equal(c.totalPaid, null)
        assert.equal(c.canViewFinancial, false)
        await get('/customers/' + c.id + '/payments', manager.cookie, 403)
        const order = (
          await db.query(
            'SELECT id FROM salon_schedules WHERE customer_id=$1 ORDER BY id LIMIT 1',
            [c.id],
          )
        ).rows[0]
        const ledger = await get('/orders/' + order.id, manager.cookie)
        assert.equal(ledger.totalPaid, null)
        assert.equal(ledger.balance, null)
        assert.equal(ledger.extrasBalance, null)
        assert.deepEqual(ledger.payments, [])
        for (const p of await get(
          '/customers/' + c.id + '/packages',
          manager.cookie,
        )) {
          assert.equal(p.totalPaid, null)
          assert.deepEqual(p.receipts, [])
        }
        const target = await get('/access/users/3', manager.cookie)
        assert.equal(
          target.permissions.find((p) => p.key === 'finance.view').editable,
          false,
        )
        await send(
          'PUT',
          '/access/users/3',
          {
            profileVersion: target.profileVersion,
            changes: [{ key: 'finance.view', allowed: true }],
          },
          manager.cookie,
          403,
        )
      } finally {
        await restore('ADMIN')
      }
    },
  )
  await t.test(
    'access: ADMIN disables services but inactive catalog and permanent removal stay protected',
    async () => {
      const service = await send('POST', '/treatments', {
        name: 'Serviço de autorização',
        description: 'Teste de perfil',
        price: 15,
        durationMinutes: 15,
      })
      await send(
        'PATCH',
        '/treatments/' + service.id + '/status',
        { isActive: false },
        professional.cookie,
        403,
      )
      await send(
        'PATCH',
        '/treatments/' + service.id + '/status',
        { isActive: false },
        manager.cookie,
      )
      assert.ok(
        !(await get('/treatments?isActive=false', manager.cookie)).some(
          (s) => s.id === service.id,
        ),
      )
      assert.ok(
        (await get('/treatments?isActive=false')).some(
          (s) => s.id === service.id,
        ),
      )
      requireStatus(
        await request('DELETE', '/treatments/' + service.id, manager.cookie),
        404,
      )
      assert.equal(
        (
          await db.query('SELECT is_active FROM salon_treatments WHERE id=$1', [
            service.id,
          ])
        ).rows[0].is_active,
        false,
      )
      await send(
        'PATCH',
        '/treatments/' + service.id + '/status',
        { isActive: true },
        manager.cookie,
      )
    },
  )
  await t.test(
    'access: operational finance contains only attributed receipts and no global expenses',
    async () => {
      const own = await get('/finance?' + period, professional.cookie),
        otherData = await get('/finance?' + period, other.cookie),
        all = await get('/finance?' + period)
      assert.equal(own.scope, 'own')
      assert.equal(otherData.scope, 'own')
      assert.equal(all.scope, 'all')
      for (const item of own.items) {
        const assigned = (
          await db.query(
            'SELECT 1 FROM salon_schedule_treatments st JOIN employees e ON e.id=st.employee_id WHERE st.schedule_id=$1 AND e.user_id=3 AND e.is_active',
            [item.orderId],
          )
        ).rowCount
        assert.ok(assigned)
      }
      await get('/finance/options', professional.cookie, 403)
      const options = await get('/finance/options'),
        body = {
          description: 'Despesa geral restrita',
          amount: 7.11,
          isDebit: true,
          methodId: options.methods[0].id,
          typeId: options.types[0].id,
          requestKey: randomUUID(),
        }
      await send('POST', '/finance/manual', body, professional.cookie, 403)
      const entry = await send('POST', '/finance/manual', body, manager.cookie)
      assert.equal(
        (await send('POST', '/finance/manual', body, manager.cookie)).id,
        entry.id,
      )
      const after = await get('/finance?' + period, professional.cookie)
      assert.ok(!after.items.some((i) => i.id === entry.id))
      assert.equal(after.net, own.net)
      assert.equal(
        Math.round(
          ((await get('/finance?' + period)).expenses - all.expenses) * 100,
        ),
        711,
      )
    },
  )
  await t.test(
    'access: shared legacy orders attribute only each professional share and require administration for mutations',
    async () => {
      const otherEmployee = (
        await db.query('SELECT id FROM employees WHERE user_id=4')
      ).rows[0].id
      const date = new Date(Date.now() + 16 * 86400000)
        .toISOString()
        .slice(0, 10)
      const schedule = (
        await db.query(
          `INSERT INTO salon_schedules(customer_id,schedule_started_at,schedule_ended_at,no_treatments,status,total_price,created_at) VALUES($1,$2::timestamptz,$2::timestamptz+interval '1 hour',2,'confirmed',100,now()) RETURNING id`,
          [alice.body.data.customerId, date + 'T16:00:00-03:00'],
        )
      ).rows[0]
      await db.query(
        'INSERT INTO salon_schedule_treatments(schedule_id,employee_id,treatment_id,price) VALUES($1,$2,1,60),($1,$3,2,40)',
        [schedule.id, employeeId, otherEmployee],
      )
      const options = await get('/finance/options')
      const beforeOwn = await get('/finance?' + period, professional.cookie),
        beforeOther = await get('/finance?' + period, other.cookie)
      await send('POST', '/orders/' + schedule.id + '/payments', {
        amount: 100,
        methodId: options.methods[0].id,
        description: 'Recebimento compartilhado',
        requestKey: randomUUID(),
      })
      assert.equal(
        Math.round(
          ((await get('/finance?' + period, professional.cookie)).income -
            beforeOwn.income) *
            100,
        ),
        6000,
      )
      assert.equal(
        Math.round(
          ((await get('/finance?' + period, other.cookie)).income -
            beforeOther.income) *
            100,
        ),
        4000,
      )
      const history = await get(
          '/customers/' + alice.body.data.customerId + '/history',
          professional.cookie,
        ),
        item = history.items.find((h) => h.id === schedule.id)
      assert.equal(item.netPaid, 60)
      assert.equal(item.treatmentTotal, 60)
      assert.equal(item.treatments.length, 1)
      assert.equal(
        (
          await get(
            '/customers/' + alice.body.data.customerId + '/payments',
            other.cookie,
          )
        ).items.find((p) => p.orderId === schedule.id).amount,
        40,
      )
      const order = await get('/booking/orders/' + schedule.id, other.cookie)
      assert.equal(order.readOnlyShared, true)
      assert.equal(order.treatments.length, 1)
      assert.equal(order.treatments[0].id, 2)
      assert.equal(order.totalPrice, 40)
      const ledger = await get('/orders/' + schedule.id, other.cookie)
      assert.equal(ledger.canManage, false)
      assert.equal(ledger.totalPaid, null)
      await send(
        'POST',
        '/orders/' + schedule.id + '/complete',
        {},
        professional.cookie,
        403,
      )
      await send(
        'POST',
        '/orders/' + schedule.id + '/change',
        {
          action: 'cancel',
          reason: 'Tentativa operacional compartilhada',
          requestKey: randomUUID(),
        },
        other.cookie,
        403,
      )
    },
  )
  await t.test(
    'access: disabled sessions stay revoked after reactivation and role assignment is audited',
    async () => {
      await send(
        'DELETE',
        '/users/' + newUser.id,
        undefined,
        manager.cookie,
        403,
      )
      await send('DELETE', '/users/' + newUser.id, undefined)
      await get('/auth/session', newSession.cookie, 401)
      const disabled = (await get('/users?hideDisabled=false')).items.find(
        (u) => u.id === newUser.id,
      )
      assert.equal(disabled.role, 'DISABLED')
      assert.equal(disabled.assignedRole, 'OPERATIONAL')
      await send('PATCH', '/users/' + newUser.id + '/restore', {})
      await get('/auth/session', newSession.cookie, 401)
      await send('PUT', '/users/' + newUser.id, {
        login: 'acl-new',
        email: 'acl-new@example.test',
        role: 'ADMIN',
      })
      const rows = await get('/access/audit')
      assert.ok(
        rows.some(
          (a) =>
            a.targetUserId === newUser.id && a.action === 'update_user_profile',
        ),
      )
      const auditText = JSON.stringify(rows)
      assert.ok(!auditText.includes('hashPassword'))
      assert.ok(!auditText.includes('hash_password'))
    },
  )
}
