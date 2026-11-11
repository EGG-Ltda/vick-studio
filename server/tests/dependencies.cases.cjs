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
  alice,
  bob,
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
  const second = (await db.query('SELECT id FROM employees WHERE user_id=4'))
    .rows[0].id
  const date = (n) =>
    new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
  const services = {}
  await t.test(
    'dependencies: profile configuration ignores preserved permissions from other module versions',
    async () => {
      await db.query(
        "INSERT INTO profile_permissions(role,permission_key,allowed,delegatable) VALUES('ADMIN','future.module',true,false)",
      )
      try {
        const p = await get('/access/profiles')
        assert.ok(
          p.profiles.every((r) => r.permissions.length === p.catalog.length),
        )
        assert.ok(
          !p.profiles.some((r) =>
            r.permissions.some((g) => g.key === 'future.module'),
          ),
        )
      } finally {
        await db.query(
          "DELETE FROM profile_permissions WHERE permission_key='future.module'",
        )
      }
    },
  )
  let group, groupBody
  const dep = (id, patch = {}) => ({
    requiredTreatmentId: id,
    position: 'before',
    sameDay: true,
    consecutive: false,
    minMinutes: 15,
    maxMinutes: 90,
    ...patch,
  })
  async function update(id, dependencies, patch = {}) {
    const original = Object.values(services).find((s) => s.id === id)
    return send('PUT', '/treatments/' + id, {
      ...original,
      dependencies,
      ...patch,
    })
  }
  async function plan(ids, promotionId) {
    return send(
      'POST',
      '/booking/dependency-plan',
      { rootIds: ids, promotionId },
      '',
    )
  }
  async function body(p, day, times = {}, staff = false) {
    const appointments = []
    for (const n of p.nodes) {
      const employee = n.treatmentId === services.B.id ? second : employeeId,
        time =
          times[n.key] ??
          times[n.treatmentId] ??
          (n.treatmentId === services.B.id
            ? '10:30'
            : n.treatmentId === services.C.id
              ? '13:00'
              : '12:00')
      const q = new URLSearchParams({
        employeeId: String(employee),
        treatmentIds: String(n.treatmentId),
        date: day,
      })
      if (staff)
        q.set(
          'depositDeadline',
          new Date(day + 'T09:00:00-03:00').toISOString(),
        )
      const slots = await get(
        (staff ? '/booking/staff-slots' : '/customer/slots') + '?' + q,
        (staff ? master : alice).cookie,
      )
      const slot = slots.find(
        (s) =>
          Date.parse(s.startsAt) === Date.parse(day + 'T' + time + ':00-03:00'),
      )
      assert.ok(slot, `Missing ${time} slot for ${n.name}`)
      appointments.push({
        key: n.key,
        employeeId: employee,
        startsAt: slot.startsAt,
        expectedTotal: slot.total,
        expectedDeposit: slot.deposit,
        expectedDeadline: slot.deadline,
        expectedInstructions: slot.instructions,
        ...(staff ? { depositDeadline: q.get('depositDeadline') } : {}),
      })
    }
    return {
      rootIds: p.promotionId ? [] : p.rootIds,
      separate: p.separate,
      promotionId: p.promotionId ?? undefined,
      requestKey: randomUUID(),
      expectedPlan: p.signature,
      appointments,
    }
  }
  await t.test(
    'dependencies: create/edit rules reject self, indirect and concurrent cycles atomically',
    async () => {
      for (const name of ['A', 'B', 'C']) {
        services[name] = await send('POST', '/treatments', {
          name: 'Dependency ' + name,
          description: 'Dependency test service',
          price: 50,
          durationMinutes: 30,
          dependencies: [],
        })
        await db.query(
          'INSERT INTO employee_salon_treatments(employee_id,treatment_id,created_at) VALUES($1,$3,now()),($2,$3,now())',
          [employeeId, second, services[name].id],
        )
      }
      await update(services.A.id, [dep(services.B.id)])
      await send(
        'PUT',
        '/treatments/' + services.A.id,
        { ...services.A, dependencies: [dep(services.A.id)] },
        master.cookie,
        400,
      )
      await send(
        'PUT',
        '/treatments/' + services.B.id,
        { ...services.B, dependencies: [dep(services.A.id)] },
        master.cookie,
        400,
      )
      await update(services.B.id, [dep(services.C.id)])
      await send(
        'PUT',
        '/treatments/' + services.C.id,
        { ...services.C, dependencies: [dep(services.A.id)] },
        master.cookie,
        400,
      )
      await update(services.B.id, [])
      const responses = await Promise.all([
        request('PUT', '/treatments/' + services.B.id, master.cookie, {
          ...services.B,
          dependencies: [dep(services.C.id)],
        }),
        request('PUT', '/treatments/' + services.C.id, master.cookie, {
          ...services.C,
          dependencies: [dep(services.B.id)],
        }),
      ])
      assert.deepEqual(responses.map((r) => r.status).sort(), [200, 400])
      await update(services.B.id, [])
      await update(services.C.id, [])
      const saved = (await get('/treatments')).find(
        (s) => s.id === services.A.id,
      )
      assert.equal(saved.dependencies[0].requiredTreatmentId, services.B.id)
      await update(services.C.id, [dep(services.B.id, { maxMinutes: null })])
    },
  )
  await t.test(
    'dependencies: closure deduplicates required services and rejects omissions or old-route bypass',
    async () => {
      const p = await plan([services.A.id, services.C.id])
      assert.equal(p.nodes.length, 3)
      assert.equal(p.rules.length, 2)
      assert.equal(
        p.nodes.filter((n) => n.treatmentId === services.B.id).length,
        1,
      )
      const b = await body(p, date(22))
      await send(
        'POST',
        '/customer/booking-groups',
        { ...b, appointments: b.appointments.slice(0, 2) },
        alice.cookie,
        400,
      )
      const a = b.appointments.find(
        (a) =>
          a.key === p.nodes.find((n) => n.treatmentId === services.A.id).key,
      )
      await send(
        'POST',
        '/customer/bookings',
        { ...a, treatmentIds: [services.A.id], requestKey: randomUUID() },
        alice.cookie,
        409,
      )
    },
  )
  await t.test(
    'dependencies: invalid order, minimum/maximum intervals and overlapping customer times leave no bookings',
    async () => {
      const p = await plan([services.A.id])
      const before = Number(
        (await db.query('SELECT count(*) FROM salon_schedules')).rows[0].count,
      )
      for (const times of [
        { [services.B.id]: '13:00' },
        { [services.B.id]: '11:30' },
        { [services.B.id]: '09:00' },
        { [services.B.id]: '12:00' },
      ])
        await send(
          'POST',
          '/customer/booking-groups',
          await body(p, date(23), times),
          alice.cookie,
          409,
        )
      assert.equal(
        Number(
          (await db.query('SELECT count(*) FROM salon_schedules')).rows[0]
            .count,
        ),
        before,
      )
    },
  )
  await t.test(
    'dependencies: shared mandatory procedures can be explicitly separated with their own prices and reservations',
    async () => {
      const shared = await plan([services.A.id, services.C.id])
      assert.equal(shared.nodes.length, 3)
      const split = await send(
        'POST',
        '/booking/dependency-plan',
        {
          rootIds: [services.A.id, services.C.id],
          separate: [{ main: 'root:1', requiredTreatmentId: services.B.id }],
        },
        '',
      )
      assert.equal(split.nodes.length, 4)
      const splitFirst = await send(
        'POST',
        '/booking/dependency-plan',
        {
          rootIds: [services.A.id, services.C.id],
          separate: [{ main: 'root:0', requiredTreatmentId: services.B.id }],
        },
        '',
      )
      assert.equal(splitFirst.nodes.length, 4)
      const extra = split.nodes.find((n) => n.key.startsWith('separate:'))
      const b = await body(split, date(27), {
        [services.C.id]: '16:00',
        [extra.key]: '14:00',
      })
      const result = await send(
        'POST',
        '/customer/booking-groups',
        b,
        alice.cookie,
      )
      assert.equal(result.bookings.length, 4)
      assert.equal(
        result.bookings.reduce((s, b) => s + b.totalPrice, 0),
        200,
      )
    },
  )
  await t.test(
    'dependencies: different professionals reserve all linked appointments once; competitors cannot keep partial sets',
    async () => {
      const p = await plan([services.A.id, services.C.id])
      groupBody = await body(p, date(24))
      const results = await Promise.all([
        request('POST', '/customer/booking-groups', alice.cookie, groupBody),
        request('POST', '/customer/booking-groups', alice.cookie, groupBody),
      ])
      results.push(
        await request('POST', '/customer/booking-groups', bob.cookie, {
          ...groupBody,
          requestKey: randomUUID(),
        }),
      )
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 200, 409])
      group = requireStatus(results[0], 200).body.data
      assert.equal(group.id, results[1].body.data.id)
      assert.equal(group.bookings.length, 3)
      assert.equal(new Set(group.bookings.map((b) => b.employeeId)).size, 2)
      assert.equal(
        (
          await db.query(
            'SELECT count(*)::int AS n FROM booking_group_members WHERE group_id=$1',
            [group.id],
          )
        ).rows[0].n,
        3,
      )
      const member = group.bookings.find((b) => b.employeeId === employeeId),
        foreign = group.bookings.find((b) => b.employeeId === second)
      assert.ok(
        (
          await get(
            '/orders/' + member.id + '/dependencies',
            professional.cookie,
          )
        ).members.some((m) => m.id === foreign.id && !m.canOpen),
      )
      await get(
        '/orders/' + foreign.id + '/dependencies',
        professional.cookie,
        404,
      )
      await get('/orders/' + member.id + '/dependencies', alice.cookie, 401)
    },
  )
  await t.test(
    'dependencies: catalog changes preserve saved conditions, prices, durations and idempotent retries',
    async () => {
      await update(services.A.id, [], { price: 99, durationMinutes: 75 })
      const retry = await send(
        'POST',
        '/customer/booking-groups',
        groupBody,
        alice.cookie,
      )
      assert.equal(retry.id, group.id)
      const main = group.bookings.find(
        (b) => b.treatments[0].id === services.A.id,
      )
      const linked = await get('/orders/' + main.id + '/dependencies')
      assert.equal(linked.rules.length, 2)
      await send(
        'POST',
        `/orders/${main.id}/change`,
        {
          action: 'reschedule',
          reason: 'Invalid linked ordering',
          startsAt: date(24) + 'T09:00:00-03:00',
          employeeId,
          requestKey: randomUUID(),
        },
        master.cookie,
        409,
      )
      await send('POST', `/orders/${main.id}/change`, {
        action: 'reschedule',
        reason: 'Valid linked ordering',
        startsAt: date(24) + 'T12:30:00-03:00',
        employeeId,
        requestKey: randomUUID(),
      })
      const changed = await get('/booking/orders/' + main.id)
      assert.equal(changed.totalPrice, 50)
      assert.equal(
        (Date.parse(changed.endsAt) - Date.parse(changed.startsAt)) / 60000,
        30,
      )
      const slots = await get(
        `/orders/${main.id}/reschedule-slots?employeeId=${employeeId}&date=${date(24)}`,
      )
      assert.ok(
        !slots.some(
          (s) =>
            Date.parse(s.startsAt) === Date.parse(date(24) + 'T09:00:00-03:00'),
        ),
      )
      const history = await get(
        `/customers/${alice.body.data.customerId}/history?view=all&page=0`,
      )
      assert.ok(history.items.some((h) => h.groupId === group.id))
      const now = await plan([services.A.id])
      assert.equal(now.nodes.length, 1)
    },
  )
  await t.test(
    'dependencies: cancellation requires impact acknowledgment and does not cascade or generate refunds',
    async () => {
      const main = group.bookings.find(
          (b) => b.treatments[0].id === services.A.id,
        ),
        before = Number(
          (await db.query('SELECT count(*) FROM salon_transactions')).rows[0]
            .count,
        )
      const change = {
        action: 'cancel',
        reason: 'Customer requested cancellation',
        requestKey: randomUUID(),
      }
      await send(
        'POST',
        `/orders/${main.id}/change`,
        change,
        master.cookie,
        409,
      )
      await send('POST', `/orders/${main.id}/change`, {
        ...change,
        acknowledgeLinkedImpact: true,
      })
      const detail = await get(`/orders/${main.id}/dependencies`)
      assert.equal(detail.needsAttention, true)
      assert.equal(
        detail.members.filter((m) => m.status === 'cancelled').length,
        1,
      )
      assert.equal(
        Number(
          (await db.query('SELECT count(*) FROM salon_transactions')).rows[0]
            .count,
        ),
        before,
      )
    },
  )
  await t.test(
    'dependencies: inactive or unqualified dependencies and stale plan signatures block confirmation',
    async () => {
      await update(services.A.id, [dep(services.B.id)])
      const p = await plan([services.A.id]),
        b = await body(p, date(25))
      await update(services.A.id, [dep(services.B.id, { maxMinutes: 120 })])
      await send('POST', '/customer/booking-groups', b, alice.cookie, 409)
      await send('PATCH', '/treatments/' + services.B.id + '/status', {
        isActive: false,
      })
      const blocked = await plan([services.A.id])
      assert.ok(blocked.nodes.some((n) => n.blocked))
      await send(
        'POST',
        '/customer/booking-groups',
        { ...b, expectedPlan: blocked.signature },
        alice.cookie,
        409,
      )
      await send('PATCH', '/treatments/' + services.B.id + '/status', {
        isActive: true,
      })
      const missing = await send('POST', '/treatments', {
        name: 'No qualified dependency',
        description: 'No employee',
        price: 10,
        durationMinutes: 15,
      })
      await update(services.A.id, [dep(missing.id)])
      const unavailable = await plan([services.A.id])
      assert.ok(
        unavailable.nodes.find((n) => n.treatmentId === missing.id).blocked,
      )
      await update(services.A.id, [dep(services.B.id)])
    },
  )
  await t.test(
    'dependencies: staff route enforces own-professional scope and permits authorized administrative sets',
    async () => {
      const p = await plan([services.A.id]),
        b = {
          ...(await body(p, date(26), {}, true)),
          customerId: alice.body.data.customerId,
        }
      await send('POST', '/booking/staff-groups', b, professional.cookie, 403)
      const g = await send('POST', '/booking/staff-groups', b, manager.cookie)
      assert.equal(g.bookings.length, 2)
    },
  )
  await t.test(
    'dependencies: package procedures reuse included dependencies or add separately priced appointments atomically',
    async () => {
      const art = (
        await db.query('SELECT id FROM promotion_art ORDER BY id LIMIT 1')
      ).rows[0].id
      const today = date(0),
        end = date(30)
      const createPromotion = async (items) =>
        send('POST', '/social/promotions', {
          title: 'Dependency package ' + randomUUID().slice(0, 5),
          description: 'Services with prerequisites',
          conditions: 'Schedule all procedures now',
          artId: art,
          altText: 'Test artwork',
          startsOn: today,
          endsOn: end,
          active: true,
          price: 90,
          items,
        })
      const promo = await createPromotion([
          { treatmentId: services.A.id, quantity: 1 },
        ]),
        p = await plan([], promo.id),
        b = await body(p, date(19))
      assert.equal(p.nodes.length, 2)
      assert.equal(p.nodes.filter((n) => !n.included).length, 1)
      const publicData = await get('/public/promotions', ''),
        promotion = publicData.items.find((i) => i.id === promo.id)
      b.packageConditions = {
        expectedPrice: promotion.price,
        expectedConditions: promotion.conditions,
        expectedValidUntil: publicData.validUntil,
      }
      await send(
        'POST',
        '/customer/packages',
        {
          promotionId: promo.id,
          requestKey: randomUUID(),
          ...b.packageConditions,
          appointments: [
            {
              treatmentId: services.A.id,
              employeeId,
              startsAt: b.appointments.find((a) => a.key === 'root:0').startsAt,
            },
          ],
        },
        alice.cookie,
        409,
      )
      const g = await send('POST', '/customer/booking-groups', b, alice.cookie)
      assert.equal(g.bookings.filter((b) => b.packageUseId).length, 1)
      assert.equal(g.bookings.find((b) => !b.packageUseId).totalPrice, 50)
      assert.equal(g.bookings.find((b) => b.packageUseId).status, 'confirmed')
      const included = await createPromotion([
          { treatmentId: services.A.id, quantity: 1 },
          { treatmentId: services.B.id, quantity: 1 },
        ]),
        pi = await plan([], included.id)
      assert.equal(pi.nodes.length, 2)
      assert.ok(pi.nodes.every((n) => n.included))
    },
  )
}
