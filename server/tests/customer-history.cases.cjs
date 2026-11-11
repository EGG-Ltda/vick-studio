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
  first,
  staffData,
  employeeId,
  password,
  cpf,
  bodyFor,
}) => {
  const customerId = alice.body.data.customerId,
    orderId = first.id
  let extraId, paymentId, third, thirdOrder
  const clean = (data) => {
    const text = JSON.stringify(data)
    for (const name of [
      'password_hash',
      'hashPassword',
      'passwordVersion',
      'password_hash',
      'customerSession',
    ])
      assert.equal(text.includes('"' + name + '"'), false, text)
  }
  await t.test(
    'customers: public registration is searchable with pagination and safe profile fields',
    async () => {
      const list = requireStatus(
        await request(
          'GET',
          '/customers?search=' + encodeURIComponent(alice.body.data.email),
          master.cookie,
        ),
        200,
      ).body.data
      assert.equal(list.items.length, 1)
      assert.equal(list.items[0].id, customerId)
      clean(list)
      const profile = requireStatus(
        await request('GET', '/customers/' + customerId, master.cookie),
        200,
      ).body.data
      clean(profile)
      assert.equal(profile.canEdit, true)
      assert.equal(profile.completedCount, 0)
      assert.equal(profile.lastCompletedAt, null)
      assert.ok(profile.totalPaid >= 54)
      for (const search of [
        profile.name,
        profile.cpf,
        profile.phone,
        profile.email,
      ])
        assert.ok(
          requireStatus(
            await request(
              'GET',
              '/customers?search=' + encodeURIComponent(search),
              master.cookie,
            ),
            200,
          ).body.data.items.some((item) => item.id === customerId),
        )
      requireStatus(
        await request('GET', '/customers?page=-1', master.cookie),
        400,
      )
      assert.equal(
        requireStatus(
          await request(
            'GET',
            '/customers?search=nomatch-synthetic',
            master.cookie,
          ),
          200,
        ).body.data.total,
        0,
      )
      for (let i = 0; i < 23; i++)
        await db.query(
          `INSERT INTO persons(name,cpf_cnpj,is_pj,created_at) VALUES($1,$2,false,now())`,
          ['Pessoa paginação ' + i, 'pagination-' + i],
        )
      await db.query(
        `INSERT INTO customers(person_id,created_at) SELECT id,now() FROM persons WHERE cpf_cnpj LIKE 'pagination-%'`,
      )
      const page1 = requireStatus(
        await request('GET', '/customers?search=pagina&page=0', master.cookie),
        200,
      ).body.data
      const page2 = requireStatus(
        await request('GET', '/customers?search=pagina&page=1', master.cookie),
        200,
      ).body.data
      assert.equal(page1.items.length, 20)
      assert.equal(page1.hasNext, true)
      assert.equal(page2.items.length, 3)
      assert.ok(
        page2.items.every(
          (item) => !page1.items.some((old) => old.id === item.id),
        ),
      )
    },
  )
  await t.test(
    'customers: assigned staff scope, IDOR, customer isolation and legacy endpoint restrictions',
    async () => {
      const created = requireStatus(
        await request('POST', '/booking/employees', master.cookie, {
          ...staffData,
          name: 'Outra Profissional',
          userId: 4,
          cpf: cpf(678901234),
        }),
        200,
      ).body.data
      third = requireStatus(
        await request('POST', '/customer/register', '', {
          birthDate: '1990-05-20',
          name: 'Cliente Privado',
          cpf: cpf(789012345),
          phone: '21987654321',
          email: 'private@example.test',
          password,
        }),
        200,
      )
      const date = new Date(Date.now() + 20 * 86400000)
        .toISOString()
        .slice(0, 10)
      const slots = requireStatus(
        await request(
          'GET',
          `/customer/slots?employeeId=${created.id}&treatmentIds=1&date=${date}`,
          third.cookie,
        ),
        200,
      ).body.data
      const slot = slots[0]
      thirdOrder = requireStatus(
        await request('POST', '/customer/bookings', third.cookie, {
          ...bodyFor(slot),
          employeeId: created.id,
          treatmentIds: [1],
        }),
        200,
      ).body.data
      const profile = requireStatus(
        await request('GET', '/customers/' + customerId, professional.cookie),
        200,
      ).body.data
      assert.equal(profile.historyScope, 'assigned')
      assert.equal(profile.canEdit, false)
      const pendingLedger = requireStatus(
        await request('GET', `/orders/${thirdOrder.id}`, other.cookie),
        200,
      ).body.data
      assert.equal(pendingLedger.canAddConsumption, true)
      assert.equal(pendingLedger.canManage, false)
      const pendingItem = requireStatus(
        await request(
          'POST',
          `/orders/${thirdOrder.id}/consumptions`,
          other.cookie,
          {
            description: 'Chocolate antes da baixa do sinal',
            quantity: 2,
            unitPrice: 5,
            requestKey: randomUUID(),
          },
        ),
        200,
      ).body.data
      requireStatus(
        await request(
          'POST',
          `/orders/${thirdOrder.id}/consumptions/${pendingItem.id}/void`,
          other.cookie,
          { reason: 'Correção do lançamento' },
        ),
        200,
      )
      const mixedSlot = slots.find(
        (candidate) =>
          new Date(candidate.startsAt) >= new Date(thirdOrder.endsAt),
      )
      const mixed = requireStatus(
        await request('POST', '/customer/bookings', alice.cookie, {
          ...bodyFor(mixedSlot),
          employeeId: created.id,
          treatmentIds: [1],
        }),
        200,
      ).body.data
      requireStatus(
        await request(
          'POST',
          `/booking/orders/${mixed.id}/deposit`,
          other.cookie,
          { amount: 40 },
        ),
        200,
      )
      const assignedHistory = requireStatus(
        await request(
          'GET',
          `/customers/${customerId}/history`,
          professional.cookie,
        ),
        200,
      ).body.data
      assert.ok(!assignedHistory.items.some((item) => item.id === mixed.id))
      const assignedPayments = requireStatus(
        await request(
          'GET',
          `/customers/${customerId}/payments`,
          professional.cookie,
        ),
        200,
      ).body.data
      assert.ok(
        !assignedPayments.items.some((item) => item.orderId === mixed.id),
      )
      const globalSummary = requireStatus(
        await request('GET', `/customers/${customerId}`, master.cookie),
        200,
      ).body.data
      const ownSummary = requireStatus(
        await request('GET', `/customers/${customerId}`, professional.cookie),
        200,
      ).body.data
      assert.equal(globalSummary.totalPaid - ownSummary.totalPaid, 40)
      requireStatus(
        await request(
          'GET',
          `/booking/orders/${mixed.id}`,
          professional.cookie,
        ),
        404,
      )
      requireStatus(
        await request(
          'GET',
          '/customers/' + third.body.data.customerId,
          professional.cookie,
        ),
        404,
      )
      requireStatus(
        await request(
          'GET',
          '/customers/' + third.body.data.customerId + '/payments',
          professional.cookie,
        ),
        404,
      )
      requireStatus(
        await request('GET', '/orders/' + thirdOrder.id, professional.cookie),
        404,
      )
      requireStatus(
        await request(
          'GET',
          '/booking/orders/' + thirdOrder.id,
          professional.cookie,
        ),
        404,
      )
      const lookup = requireStatus(
        await request(
          'GET',
          '/booking/customers?search=Privado',
          professional.cookie,
        ),
        200,
      ).body.data
      assert.equal(lookup.length, 0)
      const foreign = requireStatus(
        await request('GET', '/customers', professional.cookie),
        200,
      ).body.data
      assert.ok(
        !foreign.items.some((row) => row.id === third.body.data.customerId),
      )
      requireStatus(await request('GET', '/customers', alice.cookie), 401)
      requireStatus(
        await request('GET', '/customers/' + customerId, third.cookie),
        401,
      )
      requireStatus(
        await request('GET', '/transactions?page=0', professional.cookie),
        403,
      )
      const own = requireStatus(
        await request('GET', '/customer/bookings', third.cookie),
        200,
      ).body.data
      assert.ok(own.every((row) => row.customerName === 'Cliente Privado'))
      assert.ok(
        own.every((row) => !('notes' in row) && !('internalNotes' in row)),
      )
    },
  )
  await t.test(
    'orders: deposit is counted exactly once and internal notes remain private',
    async () => {
      const ledger = requireStatus(
        await request('GET', '/orders/' + orderId, professional.cookie),
        200,
      ).body.data
      assert.equal(
        ledger.payments.filter((p) => p.kind === 'deposit').length,
        1,
      )
      assert.equal(ledger.totalPaid, 54)
      assert.equal(ledger.balance, 126)
      requireStatus(
        await request(
          'POST',
          '/booking/orders/' + orderId + '/deposit',
          professional.cookie,
          { amount: 54 },
        ),
        200,
      )
      assert.equal(
        requireStatus(
          await request('GET', '/orders/' + orderId, master.cookie),
          200,
        ).body.data.totalPaid,
        54,
      )
      requireStatus(
        await request(
          'POST',
          '/orders/' + orderId + '/notes',
          professional.cookie,
          { body: 'Preferência de finalização: acabamento natural.' },
        ),
        200,
      )
      requireStatus(
        await request('POST', '/orders/' + orderId + '/notes', other.cookie, {
          body: 'forbidden',
        }),
        404,
      )
      requireStatus(
        await request(
          'POST',
          '/customers/' + customerId + '/notes',
          professional.cookie,
          { body: 'forbidden' },
        ),
        403,
      )
      requireStatus(
        await request(
          'POST',
          '/customers/' + customerId + '/notes',
          manager.cookie,
          { body: 'Observação geral reservada à administração.' },
        ),
        200,
      )
      requireStatus(
        await request(
          'GET',
          '/customers/' + customerId + '/notes',
          professional.cookie,
        ),
        403,
      )
      assert.ok(
        requireStatus(
          await request(
            'GET',
            '/customers/' + customerId + '/notes',
            master.cookie,
          ),
          200,
        ).body.data.some((row) => row.body.includes('administração')),
      )
      const publicData = requireStatus(
        await request('GET', '/customer/bookings', alice.cookie),
        200,
      ).body.data
      assert.equal(
        JSON.stringify(publicData).includes('acabamento natural'),
        false,
      )
      assert.equal(JSON.stringify(publicData).includes('administração'), false)
    },
  )
  await t.test(
    'orders: consumptions keep original price, are idempotent and cancelled items stay auditable',
    async () => {
      const payload = {
        description: 'Chocolate',
        quantity: 2,
        unitPrice: 5,
        requestKey: randomUUID(),
      }
      const results = await Promise.all([
        request(
          'POST',
          '/orders/' + orderId + '/consumptions',
          professional.cookie,
          payload,
        ),
        request(
          'POST',
          '/orders/' + orderId + '/consumptions',
          professional.cookie,
          payload,
        ),
      ])
      results.forEach((result) => requireStatus(result, 200))
      assert.equal(results[0].body.data.id, results[1].body.data.id)
      extraId = results[0].body.data.id
      const ledger = requireStatus(
        await request('GET', '/orders/' + orderId, professional.cookie),
        200,
      ).body.data
      assert.equal(ledger.grandTotal, 190)
      assert.equal(ledger.totalPaid, 54)
      assert.equal(ledger.balance, 136)
      assert.equal(ledger.extras.length, 1)
      requireStatus(
        await request(
          'POST',
          '/orders/' + orderId + '/consumptions',
          professional.cookie,
          { ...payload, quantity: 3 },
        ),
        409,
      )
      requireStatus(
        await request(
          'POST',
          '/orders/' + orderId + '/consumptions',
          other.cookie,
          { ...payload, requestKey: randomUUID() },
        ),
        404,
      )
      requireStatus(
        await request(
          'POST',
          '/orders/' + orderId + '/consumptions/' + extraId + '/void',
          professional.cookie,
          { reason: 'Lançamento em duplicidade' },
        ),
        200,
      )
      const cancelled = requireStatus(
        await request('GET', '/orders/' + orderId, professional.cookie),
        200,
      ).body.data
      assert.equal(cancelled.grandTotal, 180)
      assert.ok(cancelled.extras[0].voidedAt)
      assert.equal(cancelled.extras[0].voidReason, 'Lançamento em duplicidade')
      requireStatus(
        await request(
          'POST',
          '/orders/' + orderId + '/consumptions',
          professional.cookie,
          { ...payload, requestKey: randomUUID() },
        ),
        200,
      )
    },
  )
  await t.test(
    'orders: receipts, overpayment prevention, partial refunds and concurrent refund limits',
    async () => {
      const ledger = requireStatus(
        await request('GET', '/orders/' + orderId, master.cookie),
        200,
      ).body.data
      const methodId = ledger.methods.find((m) => m.name === 'Pix').id
      const payload = {
        amount: 136,
        methodId,
        description: 'Saldo e consumo recebidos',
        requestKey: randomUUID(),
      }
      const results = await Promise.all([
        request(
          'POST',
          '/orders/' + orderId + '/payments',
          professional.cookie,
          payload,
        ),
        request(
          'POST',
          '/orders/' + orderId + '/payments',
          professional.cookie,
          payload,
        ),
      ])
      results.forEach((result) => requireStatus(result, 200))
      paymentId = results[0].body.data.id
      assert.equal(paymentId, results[1].body.data.id)
      requireStatus(
        await request(
          'POST',
          '/orders/' + orderId + '/payments',
          professional.cookie,
          { ...payload, requestKey: randomUUID(), amount: 1 },
        ),
        409,
      )
      let updated = requireStatus(
        await request('GET', '/orders/' + orderId, master.cookie),
        200,
      ).body.data
      assert.equal(updated.totalPaid, 190)
      assert.equal(updated.balance, 0)
      requireStatus(
        await request(
          'POST',
          `/orders/${orderId}/payments/${paymentId}/refund`,
          professional.cookie,
          {
            amount: 10,
            reason: 'Solicitado pela cliente',
            requestKey: randomUUID(),
          },
        ),
        403,
      )
      const refund = {
        amount: 10,
        reason: 'Solicitado pela cliente',
        requestKey: randomUUID(),
      }
      const firstRefund = requireStatus(
        await request(
          'POST',
          `/orders/${orderId}/payments/${paymentId}/refund`,
          master.cookie,
          refund,
        ),
        200,
      )
      assert.equal(
        requireStatus(
          await request(
            'POST',
            `/orders/${orderId}/payments/${paymentId}/refund`,
            master.cookie,
            refund,
          ),
          200,
        ).body.data.id,
        firstRefund.body.data.id,
      )
      const concurrent = await Promise.all([
        request(
          'POST',
          `/orders/${orderId}/payments/${paymentId}/refund`,
          manager.cookie,
          {
            amount: 100,
            reason: 'Devolução parcial A',
            requestKey: randomUUID(),
          },
        ),
        request(
          'POST',
          `/orders/${orderId}/payments/${paymentId}/refund`,
          manager.cookie,
          {
            amount: 100,
            reason: 'Devolução parcial B',
            requestKey: randomUUID(),
          },
        ),
      ])
      assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409])
      updated = requireStatus(
        await request('GET', '/orders/' + orderId, master.cookie),
        200,
      ).body.data
      assert.equal(updated.totalPaid, 80)
      assert.equal(updated.balance, 110)
      requireStatus(
        await request(
          'POST',
          `/orders/${orderId}/payments/${firstRefund.body.data.id}/refund`,
          master.cookie,
          { amount: 1, reason: 'Not allowed', requestKey: randomUUID() },
        ),
        404,
      )
      const summary = requireStatus(
        await request('GET', '/customers/' + customerId, master.cookie),
        200,
      ).body.data
      const actual = (
        await db.query(
          `SELECT COALESCE(sum(CASE WHEN t.ledger_kind='refund' THEN -abs(t.value) ELSE abs(t.value) END),0)::float AS total FROM salon_transactions t JOIN salon_schedules s ON s.id=t.order_id WHERE s.customer_id=$1 AND t.ledger_kind IS NOT NULL`,
          [customerId],
        )
      ).rows[0].total
      assert.equal(summary.totalPaid, actual)
    },
  )
  await t.test(
    'customers: completion defines performed treatments and catalog edits never change history prices or names',
    async () => {
      requireStatus(
        await request(
          'POST',
          '/orders/' + orderId + '/complete',
          professional.cookie,
          {},
        ),
        409,
      )
      assert.equal(
        requireStatus(
          await request(
            'GET',
            `/customers/${customerId}/history?view=completed`,
            master.cookie,
          ),
          200,
        ).body.data.items.length,
        0,
      )
      await db.query(
        `UPDATE salon_schedules SET schedule_started_at=now()-interval '2 hours',schedule_ended_at=now()-interval '30 minutes' WHERE id=$1`,
        [orderId],
      )
      const completed = requireStatus(
        await request(
          'POST',
          '/orders/' + orderId + '/complete',
          professional.cookie,
          {},
        ),
        200,
      )
      assert.equal(completed.body.data.id, orderId)
      requireStatus(
        await request(
          'POST',
          '/orders/' + orderId + '/complete',
          professional.cookie,
          {},
        ),
        200,
      )
      requireStatus(
        await request(
          'POST',
          '/orders/' + orderId + '/consumptions',
          professional.cookie,
          {
            description: 'After closed',
            quantity: 1,
            unitPrice: 1,
            requestKey: randomUUID(),
          },
        ),
        409,
      )
      await db.query(
        "UPDATE salon_treatments SET name='Nome atual do catálogo',price=999 WHERE id=1",
      )
      const history = requireStatus(
        await request(
          'GET',
          `/customers/${customerId}/history?view=completed`,
          master.cookie,
        ),
        200,
      ).body.data
      assert.equal(history.items.length, 1)
      assert.equal(history.items[0].treatmentTotal, 180)
      assert.equal(
        history.items[0].treatments.find((t) => t.name === 'Unha em gel').price,
        100,
      )
      const detail = requireStatus(
        await request('GET', '/customers/' + customerId, master.cookie),
        200,
      ).body.data
      assert.equal(detail.completedCount, 1)
      assert.ok(detail.lastCompletedAt)
      const all = requireStatus(
        await request('GET', `/customers/${customerId}/history`, master.cookie),
        200,
      ).body.data
      assert.ok(all.items.some((item) => item.status === 'cancelled'))
    },
  )
  await t.test(
    'customers: authorized profile edits reuse the account, audit changes and preserve authentication secrecy',
    async () => {
      const profile = requireStatus(
        await request('GET', '/customers/' + customerId, master.cookie),
        200,
      ).body.data
      const update = {
        name: profile.name + ' Atualizado',
        cpf: profile.cpf,
        email: 'edited-customer@example.test',
        phone: profile.phone,
      }
      requireStatus(
        await request(
          'PUT',
          '/customers/' + customerId,
          professional.cookie,
          update,
        ),
        403,
      )
      const foreign = requireStatus(
        await request(
          'GET',
          '/customers/' + third.body.data.customerId,
          master.cookie,
        ),
        200,
      ).body.data
      requireStatus(
        await request('PUT', '/customers/' + customerId, master.cookie, {
          ...update,
          email: foreign.email,
        }),
        409,
      )
      requireStatus(
        await request('PUT', '/customers/' + customerId, master.cookie, {
          ...update,
          cpf: foreign.cpf,
        }),
        409,
      )
      requireStatus(
        await request('PUT', '/customers/' + customerId, master.cookie, update),
        200,
      )
      requireStatus(
        await request('GET', '/customer/session', alice.cookie),
        401,
      )
      const signed = requireStatus(
        await request('POST', '/customer/login', '', {
          email: update.email,
          password,
        }),
        200,
      )
      assert.equal(signed.body.data.customerId, customerId)
      alice.cookie = signed.cookie
      const stored = (
        await db.query(
          'SELECT previous_data,current_data FROM customer_profile_changes WHERE customer_id=$1',
          [customerId],
        )
      ).rows
      assert.equal(stored.length, 1)
      clean(stored)
      const details = requireStatus(
        await request('GET', '/customers/' + customerId, master.cookie),
        200,
      ).body.data
      assert.equal(details.name, update.name)
      clean(details)
      assert.equal(
        requireStatus(
          await request(
            'GET',
            '/customers?search=edited-customer',
            master.cookie,
          ),
          200,
        ).body.data.items[0].id,
        customerId,
      )
    },
  )
}
