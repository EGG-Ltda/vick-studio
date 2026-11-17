const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
module.exports = async ({
  t,
  request,
  requireStatus,
  db,
  master,
  professional,
  other,
  alice,
  bob,
  employeeId,
}) => {
  let art, promotion, purchase, body, receiptId
  const secondEmployee = (
    await db.query('SELECT id FROM employees WHERE user_id=4')
  ).rows[0].id
  const date = (offset) =>
    new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)
  const get = async (route, cookie = master.cookie) =>
    requireStatus(await request('GET', route, cookie), 200).body.data
  const send = async (route, data, cookie = master.cookie, status = 200) =>
    requireStatus(await request('POST', route, cookie, data), status).body.data
  const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6lN8AAAAASUVORK5CYII='
  await t.test(
    'social: mandatory valid birth date and scoped birthday alerts on the salon day',
    async () => {
      const registration = {
        name: 'Data Invalida',
        cpf: '52998224725',
        phone: '11999999999',
        email: 'birth@example.test',
        password: 'Test-password-123',
      }
      await send('/customer/register', registration, '', 400)
      await send(
        '/customer/register',
        { ...registration, birthDate: '2999-01-01' },
        '',
        400,
      )
      await send(
        '/customer/register',
        { ...registration, birthDate: '2001-02-29' },
        '',
        400,
      )
      const today = (
        await db.query(
          "SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date::text AS day",
        )
      ).rows[0].day
      const birth = '1990' + today.slice(4)
      await db.query(
        'UPDATE persons SET born_at=$1 WHERE id=(SELECT person_id FROM customers WHERE id=$2)',
        [birth, alice.body.data.customerId],
      )
      const scoped = await get(
        '/social/birthdays?month=' + Number(today.slice(5, 7)),
        professional.cookie,
      )
      assert.ok(
        scoped.items.some(
          (i) => i.id === alice.body.data.customerId && i.isToday,
        ),
      )
      assert.ok((await get('/social/birthdays/today')).count >= 1)
      requireStatus(
        await request('GET', '/social/birthdays?month=1', alice.cookie),
        401,
      )
      const original = await get('/customers/' + alice.body.data.customerId)
      requireStatus(
        await request('PUT', '/customers/' + original.id, master.cookie, {
          ...original,
          birthDate: '2999-01-01',
        }),
        400,
      )
      requireStatus(
        await request('PUT', '/customers/' + original.id, master.cookie, {
          ...original,
          birthDate: '1991-02-28',
        }),
        200,
      )
      const month = await get(
        '/social/birthdays?month=' + Number(today.slice(5, 7)),
      )
      assert.ok(!month.items.some((i) => i.id === original.id && i.isToday))
    },
  )
  await t.test(
    'social: artwork format/size and backend promotion permissions and public validity',
    async () => {
      await send(
        '/social/art',
        { mime: 'image/png', base64: png },
        professional.cookie,
        403,
      )
      await send(
        '/social/art',
        {
          mime: 'image/png',
          base64: Buffer.from('<svg onload="alert(1)"></svg>').toString(
            'base64',
          ),
        },
        master.cookie,
        400,
      )
      await send(
        '/social/art',
        {
          mime: 'image/png',
          base64: Buffer.alloc(3145729, 1).toString('base64'),
        },
        master.cookie,
        400,
      )
      art = await send('/social/art', { mime: 'image/png', base64: png })
      promotion = {
        title: 'Cuidado completo',
        description: 'Unhas e cabelo com horários independentes.',
        conditions: 'Todos os procedimentos na aquisição; sem sinal.',
        artId: art.id,
        altText: 'Campanha de cuidado completo',
        startsOn: date(-1),
        endsOn: date(5),
        active: true,
        price: 150.01,
        items: [
          { treatmentId: 1, quantity: 1 },
          { treatmentId: 2, quantity: 1 },
        ],
      }
      await send('/social/promotions', promotion, professional.cookie, 403)
      await send(
        '/social/promotions',
        { ...promotion, altText: '' },
        master.cookie,
        400,
      )
      const result = await send('/social/promotions', promotion)
      promotion.id = result.id
      const publicData = await get('/public/promotions', '')
      assert.ok(publicData.items.some((p) => p.id === promotion.id))
      requireStatus(
        await request(
          'PUT',
          '/social/promotions/' + promotion.id,
          master.cookie,
          { ...promotion, active: false },
        ),
        200,
      )
      assert.ok(!(await get('/public/promotions', '')).items.length)
      requireStatus(
        await request(
          'PUT',
          '/social/promotions/' + promotion.id,
          master.cookie,
          promotion,
        ),
        200,
      )
    },
  )
  await t.test(
    'packages: all appointments required, overlaps and out-of-validity fail without partial records',
    async () => {
      const catalog = await get('/public/promotions', '')
      body = {
        promotionId: promotion.id,
        expectedPrice: promotion.price,
        expectedConditions: promotion.conditions,
        expectedValidUntil: catalog.validUntil,
        requestKey: randomUUID(),
        appointments: [
          { treatmentId: 1, employeeId, startsAt: date(6) + 'T09:00:00-03:00' },
          {
            treatmentId: 2,
            employeeId: secondEmployee,
            startsAt: date(7) + 'T10:00:00-03:00',
          },
        ],
      }
      await send(
        '/customer/packages',
        { ...body, appointments: body.appointments.slice(0, 1) },
        alice.cookie,
        400,
      )
      await send(
        '/customer/packages',
        {
          ...body,
          appointments: [
            body.appointments[0],
            {
              ...body.appointments[1],
              startsAt: body.appointments[0].startsAt,
            },
          ],
        },
        alice.cookie,
        409,
      )
      await send(
        '/customer/packages',
        {
          ...body,
          appointments: [
            body.appointments[0],
            { ...body.appointments[1], startsAt: date(60) + 'T10:00:00-03:00' },
          ],
        },
        alice.cookie,
        409,
      )
      assert.equal(
        (await db.query('SELECT count(*)::int AS n FROM package_purchases'))
          .rows[0].n,
        0,
      )
      assert.equal(
        (await db.query('SELECT count(*)::int AS n FROM package_uses')).rows[0]
          .n,
        0,
      )
    },
  )
  await t.test(
    'packages: atomic concurrent reservation, exact cent allocation, no deposit and ownership',
    async () => {
      const alternativeBody = { ...body, requestKey: randomUUID() }
      const results = await Promise.all([
        request('POST', '/customer/packages', alice.cookie, body),
        request('POST', '/customer/packages', bob.cookie, alternativeBody),
      ])
      assert.deepEqual(
        results.map((r) => r.status).sort(),
        [200, 409],
        JSON.stringify(results),
      )
      // Whichever customer wins is the owner for the following assertions.
      if (results[0].status !== 200) {
        ;[alice, bob] = [bob, alice]
        body = alternativeBody
        purchase = results[1].body.data
      } else purchase = results[0].body.data
      assert.equal(
        (await send('/customer/packages', body, alice.cookie)).id,
        purchase.id,
      )
      assert.equal(
        (await db.query('SELECT count(*)::int AS n FROM package_uses')).rows[0]
          .n,
        2,
      )
      const list = await get('/customer/packages', alice.cookie)
      purchase = list.find((p) => p.id === purchase.id)
      assert.equal(purchase.uses.length, 2)
      assert.equal(purchase.totalPaid, 0)
      assert.equal(
        purchase.uses.reduce((s, u) => s + Math.round(u.price * 100), 0),
        15001,
      )
      assert.ok(
        purchase.uses.every(
          (u) => u.state === 'reserved' && u.status === 'confirmed',
        ),
      )
      assert.ok(
        !(await get('/customer/packages', bob.cookie)).some(
          (p) => p.id === purchase.id,
        ),
      )
      requireStatus(
        await request(
          'GET',
          '/customers/' + alice.body.data.customerId + '/packages',
          bob.cookie,
        ),
        401,
      )
      const values = (
        await db.query(
          'SELECT status,deposit_required,deposit_due_at FROM salon_schedules WHERE id=ANY($1::int[])',
          [purchase.uses.map((u) => u.scheduleId)],
        )
      ).rows
      assert.ok(
        values.every(
          (s) =>
            s.status === 'confirmed' &&
            s.deposit_required === null &&
            s.deposit_due_at === null,
        ),
      )
      const before = purchase.validUntil
      await db.query('UPDATE booking_settings SET package_validity_months=2')
      assert.equal(
        (await get('/customer/packages', alice.cookie)).find(
          (p) => p.id === purchase.id,
        ).validUntil,
        before,
      )
      await db.query('UPDATE booking_settings SET package_validity_months=1')
      await db.query(
        "UPDATE salon_treatments SET name='Catálogo alterado depois',price=300 WHERE id=1",
      )
      const unchanged = (await get('/customer/packages', alice.cookie)).find(
        (p) => p.id === purchase.id,
      )
      assert.equal(unchanged.price, purchase.price)
      assert.equal(unchanged.uses[0].name, purchase.uses[0].name)
      const scoped = (
        await get(
          '/customers/' + alice.body.data.customerId + '/packages',
          professional.cookie,
        )
      ).find((p) => p.id === purchase.id)
      assert.equal(scoped.uses.length, 1)
      assert.equal(scoped.totalPaid, null)
    },
  )
  await t.test(
    'packages: payment retry counted once, split amounts reconcile and individual package billing blocked',
    async () => {
      const methods = await get('/social/payment-methods'),
        methodId = methods[0].id
      const before = (await get('/customers/' + alice.body.data.customerId))
        .totalPaid
      const payment = {
        amount: 150.01,
        methodId,
        description: 'Pagamento do pacote',
        requestKey: randomUUID(),
      }
      await send(
        '/social/packages/' + purchase.id + '/payments',
        payment,
        professional.cookie,
        403,
      )
      const r = await send(
        '/social/packages/' + purchase.id + '/payments',
        payment,
      )
      receiptId = r.id
      assert.equal(
        (await send('/social/packages/' + purchase.id + '/payments', payment))
          .id,
        r.id,
      )
      await send(
        '/social/packages/' + purchase.id + '/payments',
        { ...payment, requestKey: randomUUID() },
        master.cookie,
        409,
      )
      const entries = (
        await db.query(
          'SELECT value FROM salon_transactions WHERE package_receipt_id=$1',
          [receiptId],
        )
      ).rows
      assert.equal(
        entries.reduce((s, r) => s + Math.round(Number(r.value) * 100), 0),
        15001,
      )
      const after = (await get('/customers/' + alice.body.data.customerId))
        .totalPaid
      assert.equal(Math.round((after - before) * 100), 15001)
      await send(
        '/orders/' + purchase.uses[0].scheduleId + '/payments',
        { ...payment, amount: 1, requestKey: randomUUID() },
        master.cookie,
        409,
      )
      const ledger = await get('/orders/' + purchase.uses[0].scheduleId)
      const entry = ledger.payments.find(
        (p) => p.packageReceiptId === receiptId,
      )
      await send(
        '/orders/' +
          purchase.uses[0].scheduleId +
          '/payments/' +
          entry.id +
          '/refund',
        {
          amount: 0.01,
          reason: 'Use package refund',
          requestKey: randomUUID(),
        },
        master.cookie,
        404,
      )
    },
  )
  await t.test(
    'packages: partial and competing refunds never exceed the original payment or double accounting',
    async () => {
      const route = '/social/packages/' + purchase.id + '/refunds/' + receiptId
      const partial = {
        amount: 0.01,
        reason: 'Ajuste de um centavo',
        requestKey: randomUUID(),
      }
      const r = await send(route, partial)
      assert.equal((await send(route, partial)).id, r.id)
      const results = await Promise.all([
        request('POST', route, master.cookie, {
          amount: 100,
          reason: 'Estorno parcial A',
          requestKey: randomUUID(),
        }),
        request('POST', route, master.cookie, {
          amount: 100,
          reason: 'Estorno parcial B',
          requestKey: randomUUID(),
        }),
      ])
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409])
      const p = await get('/social/packages/' + purchase.id)
      assert.equal(p.totalPaid, 50)
      const total = Number(
        (
          await db.query(
            "SELECT sum(CASE WHEN ledger_kind='refund' THEN -value ELSE value END) AS total FROM salon_transactions WHERE package_receipt_id IN (SELECT id FROM package_receipts WHERE purchase_id=$1)",
            [purchase.id],
          )
        ).rows[0].total,
      )
      assert.equal(total, p.totalPaid)
    },
  )
  await t.test(
    'agenda: failed reschedule preserves original, authorized changes audited and cancellation never returns uses or money',
    async () => {
      const first = purchase.uses[0],
        second = purchase.uses[1]
      const reason = 'Pedido da cliente'
      const slots = await get(
        `/orders/${first.scheduleId}/reschedule-slots?employeeId=${first.employeeId}&date=${date(6)}`,
        professional.cookie,
      )
      assert.ok(
        slots.some(
          (s) =>
            new Date(s.startsAt).getTime() ===
            new Date(first.startsAt).getTime(),
        ),
      )
      await send(
        '/orders/' + first.scheduleId + '/change',
        { action: 'no_show', reason, requestKey: randomUUID() },
        master.cookie,
        409,
      )

      // Even on another professional the customer cannot have two overlapping package procedures.
      await send(
        '/orders/' + first.scheduleId + '/change',
        {
          action: 'reschedule',
          employeeId: second.employeeId,
          startsAt: second.startsAt,
          reason,
          requestKey: randomUUID(),
        },
        master.cookie,
        409,
      )
      const original = await get('/booking/orders/' + first.scheduleId)
      assert.equal(
        new Date(original.startsAt).getTime(),
        new Date(first.startsAt).getTime(),
      )
      const reschedule = {
        action: 'reschedule',
        employeeId: second.employeeId,
        startsAt: date(8) + 'T11:00:00-03:00',
        reason,
        requestKey: randomUUID(),
      }
      await send(
        '/orders/' + first.scheduleId + '/change',
        reschedule,
        professional.cookie,
        403,
      )
      await send('/orders/' + first.scheduleId + '/change', reschedule)
      await send('/orders/' + first.scheduleId + '/change', reschedule)
      assert.equal(
        (await get('/orders/' + first.scheduleId + '/changes')).length,
        1,
      )
      const tooLate = {
        ...reschedule,
        startsAt: date(60) + 'T11:00:00-03:00',
        requestKey: randomUUID(),
      }
      await send(
        '/orders/' + first.scheduleId + '/change',
        tooLate,
        master.cookie,
        409,
      )
      const before = (await get('/social/packages/' + purchase.id)).totalPaid
      await send('/orders/' + first.scheduleId + '/change', {
        action: 'cancel',
        reason,
        requestKey: randomUUID(),
      })
      let updated = await get('/social/packages/' + purchase.id)
      assert.equal(updated.totalPaid, before)
      assert.equal(
        updated.uses.find((u) => u.id === first.id).state,
        'cancelled',
      )
      await send(
        '/orders/' + first.scheduleId + '/change',
        { ...reschedule, requestKey: randomUUID() },
        master.cookie,
        409,
      )
      await send('/orders/' + first.scheduleId + '/change', {
        action: 'return_use',
        reason,
        requestKey: randomUUID(),
      })
      await send('/orders/' + first.scheduleId + '/change', {
        ...reschedule,
        startsAt: date(9) + 'T11:00:00-03:00',
        requestKey: randomUUID(),
      })
      updated = await get('/social/packages/' + purchase.id)
      assert.equal(
        updated.uses.find((u) => u.id === first.id).state,
        'reserved',
      )
      assert.equal(updated.uses.length, 2)
    },
  )
  await t.test(
    'packages: completion alone consumes utilization, expired appointments remain unperformed in history',
    async () => {
      const first = purchase.uses[0],
        second = purchase.uses[1]
      await send(
        '/orders/' + first.scheduleId + '/complete',
        {},
        master.cookie,
        409,
      )
      await db.query(
        "UPDATE salon_schedules SET schedule_started_at=now()-interval '10 days',schedule_ended_at=now()-interval '10 days'+interval '1 hour' WHERE id=$1",
        [first.scheduleId],
      )
      await send('/orders/' + first.scheduleId + '/complete', {})
      await send('/orders/' + first.scheduleId + '/complete', {})
      let p = await get('/social/packages/' + purchase.id)
      assert.equal(p.uses.find((u) => u.id === first.id).state, 'completed')
      await send(
        '/orders/' + first.scheduleId + '/change',
        {
          action: 'return_use',
          reason: 'Não pode devolver concluído',
          requestKey: randomUUID(),
        },
        master.cookie,
        409,
      )
      await db.query(
        "UPDATE package_purchases SET valid_until=now()-interval '1 second' WHERE id=$1",
        [purchase.id],
      )
      await db.query(
        "UPDATE salon_schedules SET schedule_started_at=now()-interval '11 days',schedule_ended_at=now()-interval '11 days'+interval '1 hour' WHERE id=$1",
        [second.scheduleId],
      )
      await send(
        '/orders/' + second.scheduleId + '/complete',
        {},
        master.cookie,
        409,
      )
      p = await get('/social/packages/' + purchase.id)
      assert.equal(p.uses.find((u) => u.id === second.id).state, 'expired')
      assert.equal(p.uses.find((u) => u.id === first.id).state, 'completed')
    },
  )
}
