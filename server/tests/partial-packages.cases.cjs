const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const bcrypt = require('bcryptjs')
module.exports = async ({
  t,
  request,
  requireStatus,
  db,
  master,
  professional,
  alice,
  bob,
  cpf,
}) => {
  const get = async (path, cookie = master.cookie, status = 200) =>
    requireStatus(await request('GET', path, cookie), status).body.data
  const send = async (path, data, cookie = master.cookie, status = 200) =>
    requireStatus(await request('POST', path, cookie, data), status).body.data
  const day = (n) =>
    new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
  const time = (n, h) => day(n) + 'T' + h + ':00-03:00'
  const art = (
    await db.query('SELECT id FROM promotion_art ORDER BY id LIMIT 1')
  ).rows[0].id
  const services = []
  for (const [name, duration] of [
    ['Cabelo parcial', 60],
    ['Sobrancelha parcial', 30],
    ['Cuidado adicional', 15],
  ])
    services.push(
      (
        await db.query(
          'INSERT INTO salon_treatments(name,description,price,duration_minutes,is_active,created_at) VALUES($1,$1,100,$2,true,now()) RETURNING id',
          [name, duration],
        )
      ).rows[0].id,
    )
  const [hair, brow, extra] = services
  const employees = []
  const staffPassword = randomUUID().slice(0, 24),
    staffHash = await bcrypt.hash(staffPassword, 10)
  for (let i = 0; i < 2; i++) {
    const user = (
      await db.query(
        'INSERT INTO app_users(login,email,hash_password,is_active,created_at) SELECT $1,$2,hash_password,true,now() FROM app_users WHERE id=1 RETURNING id',
        ['partial.staff.' + i, 'partial' + i + '@example.test'],
      )
    ).rows[0].id
    await db.query('UPDATE app_users SET hash_password=$2 WHERE id=$1', [
      user,
      staffHash,
    ])
    const person = (
      await db.query(
        'INSERT INTO persons(name,cpf_cnpj,is_pj,created_at) VALUES($1,$2,false,now()) RETURNING id',
        ['Equipe parcial ' + i, cpf(456789120 + i)],
      )
    ).rows[0].id
    const employee = (
      await db.query(
        'INSERT INTO employees(person_id,user_id,is_active,created_at) VALUES($1,$2,true,now()) RETURNING id',
        [person, user],
      )
    ).rows[0].id
    employees.push(employee)
    await db.query(
      'INSERT INTO employee_salon_treatments(employee_id,treatment_id,created_at) SELECT $1,unnest($2::int[]),now()',
      [employee, services],
    )
    await db.query(
      "INSERT INTO employee_booking_hours(employee_id,weekday,opens_at,closes_at) SELECT $1,generate_series(0,6),'09:00','18:00'",
      [employee],
    )
  }
  await db.query(
    'INSERT INTO employee_commission_rates(employee_id,treatment_id,standard_percent,package_percent,updated_by) SELECT employee_id,treatment_id,0,0,1 FROM employee_salon_treatments WHERE employee_id=ANY($1::int[]) ON CONFLICT DO NOTHING',
    [employees],
  )
  const staff = requireStatus(
    await request('POST', '/auth/signin', '', {
      login: 'partial.staff.0',
      password: staffPassword,
    }),
    200,
  )
  await db.query(
    "INSERT INTO treatment_dependencies(treatment_id,required_treatment_id,position,same_day) VALUES($1,$2,'after',true)",
    [hair, brow],
  )
  let promotion = {
    title: 'Pacote parcial 2 + 2',
    description: 'Quatro utilizações individuais',
    conditions: 'Agende os pares dentro da validade',
    artId: Number(art),
    altText: 'Arte de teste',
    startsOn: day(-1),
    endsOn: day(25),
    active: true,
    price: 250,
    minimumPaymentPercent: 50,
    items: [
      { treatmentId: hair, quantity: 2 },
      { treatmentId: brow, quantity: 2 },
    ],
  }
  const promotionId = (await send('/social/promotions', promotion)).id
  const preview = (selection, cookie = alice.cookie, status = 200) =>
    send('/customer/package-plan', selection, cookie, status)
  let plan, firstKeys, purchaseId, initialResult, firstBody
  const payload = (p, selection, keys, offset = 12) => ({
    ...selection,
    expectedPlan: p.plan.signature,
    requestKey: randomUUID(),
    appointments: p.plan.nodes
      .filter((n) => keys.includes(n.key))
      .map((n) => ({
        key: n.key,
        employeeId: n.treatmentId === hair ? employees[0] : employees[1],
        startsAt: time(offset, n.treatmentId === hair ? '09:00' : '10:00'),
      })),
  })
  const ledger = () => get('/social/packages/' + purchaseId)
  await t.test(
    'partial packages: all contracted uses are distinct, dependencies are paired and ordered',
    async () => {
      plan = await preview({ promotionId })
      assert.equal(plan.plan.nodes.length, 4)
      assert.equal(plan.plan.rules.length, 2)
      assert.equal(new Set(plan.plan.rules.map((r) => r.required)).size, 2)
      assert.ok(
        plan.plan.nodes.every(
          (n) => n.included && n.price === 0 && n.chargedPrice === 0,
        ),
      )
      for (const r of plan.plan.rules)
        assert.ok(
          plan.plan.nodes.findIndex((n) => n.key === r.main) <
            plan.plan.nodes.findIndex((n) => n.key === r.required),
        )
      const rule = plan.plan.rules[0]
      firstKeys = [rule.main, rule.required]
      const incomplete = payload(plan, { promotionId }, [rule.main])
      await send(
        '/customer/package-reservations',
        incomplete,
        alice.cookie,
        409,
      )
      assert.equal(
        (
          await db.query(
            'SELECT count(*)::int AS n FROM package_purchases WHERE promotion_id=$1',
            [promotionId],
          )
        ).rows[0].n,
        0,
      )
      const invalid = payload(plan, { promotionId }, firstKeys)
      invalid.appointments[1].startsAt = time(12, '09:30')
      await send('/customer/package-reservations', invalid, alice.cookie, 409)
    },
  )
  await t.test(
    'partial packages: purchase and first pair are atomic/idempotent with two uses left and no per-use public prices',
    async () => {
      firstBody = payload(plan, { promotionId }, firstKeys)
      const both = await Promise.all([
        request(
          'POST',
          '/customer/package-reservations',
          alice.cookie,
          firstBody,
        ),
        request(
          'POST',
          '/customer/package-reservations',
          alice.cookie,
          firstBody,
        ),
      ])
      both.forEach((r) => requireStatus(r, 200))
      assert.equal(both[0].body.data.purchaseId, both[1].body.data.purchaseId)
      initialResult = both[0].body.data
      purchaseId = initialResult.purchaseId
      const owned = (await get('/customer/packages', alice.cookie)).find(
        (p) => p.id === purchaseId,
      )
      assert.equal(owned.uses.length, 4)
      assert.equal(owned.uses.filter((u) => u.state === 'available').length, 2)
      assert.equal(owned.uses.filter((u) => u.state === 'reserved').length, 2)
      assert.ok(owned.uses.every((u) => u.price === null))
      assert.deepEqual(owned.receipts, [])
      assert.ok(
        initialResult.appointments.every((a) => a.included && a.price === null),
      )
      assert.equal(owned.minimumPayment, 125)
      assert.equal(owned.minimumPaymentPercent, 50)
      await preview({ purchaseId }, bob.cookie, 404)
      await send(
        '/customer/package-reservations',
        {
          ...firstBody,
          requestKey: randomUUID(),
          purchaseId,
          promotionId: undefined,
        },
        bob.cookie,
        404,
      )
    },
  )
  let receipt, methodId
  await t.test(
    'partial packages: unassigned uses receive exact allocations, payment threshold and refunds gate start/completion',
    async () => {
      methodId = (await get('/social/payment-methods'))[0].id
      const before = (await get('/customers/' + alice.body.data.customerId))
        .totalPaid
      receipt = await send('/social/packages/' + purchaseId + '/payments', {
        amount: 124.99,
        methodId,
        description: 'Primeira parcela',
        requestKey: randomUUID(),
      })
      assert.equal(
        Math.round(
          ((await get('/customers/' + alice.body.data.customerId)).totalPaid -
            before) *
            100,
        ),
        12499,
      )
      const entries = (
        await db.query(
          'SELECT order_id,value FROM salon_transactions WHERE package_receipt_id=$1',
          [receipt.id],
        )
      ).rows
      assert.equal(
        Math.round(entries.reduce((s, r) => s + Number(r.value), 0) * 100),
        12499,
      )
      assert.ok(entries.some((r) => r.order_id === null))
      const schedule = (
        await db.query(
          'SELECT schedule_id FROM package_uses WHERE purchase_id=$1 AND state=$2 ORDER BY id LIMIT 1',
          [purchaseId, 'reserved'],
        )
      ).rows[0].schedule_id
      await db.query(
        "UPDATE salon_schedules SET schedule_started_at=now()-interval '1 day',schedule_ended_at=now()-interval '1 day'+interval '1 hour' WHERE id=$1",
        [schedule],
      )
      const ownLedger = await get('/orders/' + schedule, staff.cookie)
      assert.equal(ownLedger.packagePayment.released, false)
      assert.equal(ownLedger.packagePayment.minimum, null)
      assert.equal(ownLedger.packagePayment.paid, null)
      await assert.rejects(
        db.query(
          "UPDATE salon_schedules SET status='in_progress' WHERE id=$1",
          [schedule],
        ),
        (e) => e.code === 'P0001',
      )
      await send('/orders/' + schedule + '/start', {}, master.cookie, 409)
      await send('/orders/' + schedule + '/complete', {}, master.cookie, 409)
      await send('/orders/' + schedule + '/start', {}, professional.cookie, 404)
      await send('/social/packages/' + purchaseId + '/payments', {
        amount: 0.01,
        methodId,
        description: 'Completa mínimo',
        requestKey: randomUUID(),
      })
      await send('/orders/' + schedule + '/start', {})
      await send('/social/packages/' + purchaseId + '/refunds/' + receipt.id, {
        amount: 0.01,
        reason: 'Estorno do centavo',
        requestKey: randomUUID(),
      })
      await send('/orders/' + schedule + '/complete', {}, master.cookie, 409)
      await send('/social/packages/' + purchaseId + '/payments', {
        amount: 0.01,
        methodId,
        description: 'Reposição mínimo',
        requestKey: randomUUID(),
      })
      await send('/orders/' + schedule + '/complete', {})
      assert.equal(
        (await ledger()).uses.filter((u) => u.state === 'completed').length,
        1,
      )
      assert.equal(
        (await ledger()).uses.filter((u) => u.state === 'available').length,
        2,
      )
    },
  )
  await t.test(
    'partial packages: later bookings use saved price/rules/duration and racing requests reserve the balance once',
    async () => {
      const original = await ledger()
      await db.query(
        "UPDATE salon_treatments SET name='Nome novo',price=999,duration_minutes=120 WHERE id=$1",
        [hair],
      )
      await db.query(
        'DELETE FROM treatment_dependencies WHERE treatment_id=$1',
        [hair],
      )
      requireStatus(
        await request(
          'PUT',
          '/social/promotions/' + promotionId,
          master.cookie,
          {
            ...promotion,
            price: 999,
            minimumPaymentPercent: 100,
            items: [{ treatmentId: hair, quantity: 1 }],
          },
        ),
        200,
      )
      const p = await preview({ purchaseId }),
        keys = p.available
      assert.equal(p.terms.price, 250)
      assert.equal(p.terms.minimumPaymentPercent, 50)
      assert.equal(p.terms.validUntil, original.validUntil)
      assert.equal(p.plan.rules.length, 2)
      assert.equal(
        p.plan.nodes.find((n) => n.treatmentId === hair).durationMinutes,
        60,
      )
      const h = p.plan.nodes.find(
        (n) => n.treatmentId === hair && keys.includes(n.key),
      )
      const slots = await send(
        '/customer/package-slots',
        { purchaseId, key: h.key, employeeId: employees[0], date: day(15) },
        alice.cookie,
      )
      assert.ok(slots.length)
      assert.equal(slots[0].duration, 60)
      const b = payload(p, { purchaseId }, keys, 15)
      const results = await Promise.all([
        request('POST', '/customer/package-reservations', alice.cookie, b),
        request('POST', '/customer/package-reservations', alice.cookie, {
          ...b,
          requestKey: randomUUID(),
        }),
      ])
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409])
      assert.equal(
        (
          await db.query(
            'SELECT count(*)::int AS n FROM package_purchases WHERE id=$1',
            [purchaseId],
          )
        ).rows[0].n,
        1,
      )
      const all = await ledger()
      assert.equal(all.uses.length, 4)
      assert.equal(all.uses.filter((u) => u.state === 'available').length, 0)
      assert.equal(all.totalPaid, 125)
      assert.ok(all.uses.every((u) => u.name !== 'Nome novo'))
      assert.equal(
        (
          await db.query(
            'SELECT count(*)::int AS n FROM salon_transactions WHERE package_use_id IN (SELECT id FROM package_uses WHERE purchase_id=$1) AND order_id IS NULL',
            [purchaseId],
          )
        ).rows[0].n,
        0,
      )
      assert.equal((await preview({ purchaseId })).available.length, 0)
      assert.equal(
        (await send('/customer/package-reservations', firstBody, alice.cookie))
          .purchaseId,
        purchaseId,
      )
    },
  )
  await t.test(
    'partial packages: indirect additions are explicit and a slot race keeps no partial purchase',
    async () => {
      await db.query(
        "INSERT INTO treatment_dependencies(treatment_id,required_treatment_id,position,same_day) VALUES($1,$2,'after',true),($2,$3,'before',true)",
        [hair, brow, extra],
      )
      const id = (
        await send('/social/promotions', {
          ...promotion,
          title: 'Pacote com cuidado adicional',
        })
      ).id
      const p = await preview({ promotionId: id })
      assert.equal(p.plan.nodes.filter((n) => n.included).length, 4)
      assert.equal(p.plan.nodes.filter((n) => !n.included).length, 2)
      assert.ok(
        p.plan.nodes.filter((n) => !n.included).every((n) => n.price === 100),
      )
      const rule = p.plan.rules.find((r) => r.mainName === 'Nome novo'),
        extraRule = p.plan.rules.find((r) => r.main === rule.required)
      const keys = [rule.main, rule.required, extraRule.required]
      const b = {
        promotionId: id,
        expectedPlan: p.plan.signature,
        requestKey: randomUUID(),
        appointments: p.plan.nodes
          .filter((n) => keys.includes(n.key))
          .map((n) => ({
            key: n.key,
            employeeId: n.treatmentId === hair ? employees[0] : employees[1],
            startsAt: time(
              17,
              n.treatmentId === hair
                ? '09:00'
                : n.treatmentId === extra
                  ? '11:00'
                  : '11:15',
            ),
          })),
      }
      const races = await Promise.all([
        request('POST', '/customer/package-reservations', alice.cookie, b),
        request('POST', '/customer/package-reservations', bob.cookie, {
          ...b,
          requestKey: randomUUID(),
        }),
      ])
      assert.deepEqual(races.map((r) => r.status).sort(), [200, 409])
      const result = races.find((r) => r.status === 200).body.data
      assert.equal(result.appointments.filter((a) => !a.included).length, 1)
      assert.equal(result.appointments.find((a) => !a.included).price, 100)
      assert.equal(
        (
          await db.query(
            'SELECT count(*)::int AS n FROM package_purchases WHERE promotion_id=$1',
            [id],
          )
        ).rows[0].n,
        1,
      )
      assert.equal(
        (
          await db.query(
            'SELECT count(*)::int AS n FROM package_uses WHERE purchase_id=$1',
            [result.purchaseId],
          )
        ).rows[0].n,
        4,
      )
    },
  )
  await t.test(
    'partial packages: legacy payment setup is mandatory and fills only missing acquired terms',
    async () => {
      await db.query(
        'UPDATE package_purchases SET minimum_payment_percent=NULL WHERE id=$1',
        [purchaseId],
      )
      await db.query(
        'UPDATE promotions SET minimum_payment_percent=NULL WHERE id=$1',
        [promotionId],
      )
      const before = await ledger()
      assert.equal(before.minimumPaymentPercent, null)
      const publicList = await get('/public/promotions', '')
      assert.ok(!publicList.items.some((p) => p.id === promotionId))
      requireStatus(
        await request(
          'PUT',
          '/social/promotions/' + promotionId,
          master.cookie,
          { ...promotion, minimumPaymentPercent: 75 },
        ),
        200,
      )
      const configured = await ledger()
      assert.equal(configured.minimumPaymentPercent, 75)
      assert.equal(configured.price, 250)
      assert.equal(configured.totalPaid, 125)
      assert.equal(configured.uses.length, 4)
      requireStatus(
        await request(
          'PUT',
          '/social/promotions/' + promotionId,
          master.cookie,
          { ...promotion, minimumPaymentPercent: 90 },
        ),
        200,
      )
      assert.equal((await ledger()).minimumPaymentPercent, 75)
      await db.query(
        "UPDATE package_purchases SET valid_until=now()-interval '1 second' WHERE id=$1",
        [purchaseId],
      )
      await preview({ purchaseId }, alice.cookie, 409)
      assert.equal((await ledger()).uses.length, 4)
    },
  )
}
