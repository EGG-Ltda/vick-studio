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
  employeeId,
}) => {
  const get = async (path, cookie = master.cookie, status = 200) =>
    requireStatus(await request('GET', path, cookie), status).body.data
  const post = async (path, body = {}, cookie = master.cookie, status = 200) =>
    requireStatus(await request('POST', path, cookie, body), status).body.data
  const treatment = (
    await db.query(
      "INSERT INTO salon_treatments(name,description,price,duration_minutes,is_active,created_at) VALUES('Comissão específica','Teste',100,30,true,now()) RETURNING id",
    )
  ).rows[0].id
  await db.query(
    'INSERT INTO employee_salon_treatments(employee_id,treatment_id,created_at) VALUES($1,$2,now())',
    [employeeId, treatment],
  )
  const otherEmployee = (
    await db.query('SELECT id FROM employees WHERE user_id=4')
  ).rows[0].id
  const customerId = alice.body.data.customerId
  const method = (
    await db.query(
      'SELECT id FROM payment_methods WHERE removed_at IS NULL ORDER BY id LIMIT 1',
    )
  ).rows[0].id
  let setting, first, payment, packageOrder
  const put = async (body, cookie = master.cookie, status = 200) =>
    requireStatus(
      await request(
        'PUT',
        `/commissions/employees/${employeeId}/rates`,
        cookie,
        body,
      ),
      status,
    ).body.data
  async function configure(standardPercent, packagePercent) {
    setting = await get(`/commissions/employees/${employeeId}`)
    const rates = setting.items.map((r) => ({
      treatmentId: r.treatmentId,
      standardPercent:
        r.treatmentId === treatment ? standardPercent : r.standardPercent,
      packagePercent:
        r.treatmentId === treatment ? packagePercent : r.packagePercent,
    }))
    await put({ version: setting.employee.version, rates })
    return rates
  }
  let sequence = 200
  async function order({ sale = 100, gross = 100, extra = 0 } = {}) {
    const id = (
      await db.query(
        "INSERT INTO salon_schedules(customer_id,schedule_started_at,schedule_ended_at,no_treatments,status,total_price,created_at) VALUES($1,now()-($3*interval '1 day'),now()-($3*interval '1 day')+interval '30 minutes',1,'confirmed',$2,now()) RETURNING id",
        [customerId, sale, sequence++],
      )
    ).rows[0].id
    await db.query(
      'INSERT INTO salon_schedule_treatments(employee_id,schedule_id,treatment_id,price,gross_price) VALUES($1,$2,$3,$4,$5)',
      [employeeId, id, treatment, sale, gross],
    )
    if (extra)
      await db.query(
        "INSERT INTO order_consumptions(schedule_id,description,quantity,unit_price,request_key,created_by) VALUES($1,'Produto',1,$2,$3,1)",
        [id, extra, randomUUID()],
      )
    return id
  }
  const complete = (id) => post(`/orders/${id}/complete`)
  const rows = (id) => get(`/commissions/orders/${id}`)
  const pay = (id, amount) =>
    post(`/orders/${id}/payments`, {
      amount,
      methodId: method,
      description: 'Pagamento do teste',
      requestKey: randomUUID(),
    })
  const refund = (
    id,
    paymentId,
    amount,
    commissionScope = 'services',
    key = randomUUID(),
  ) =>
    post(`/orders/${id}/payments/${paymentId}/refund`, {
      amount,
      reason: 'Devolução do procedimento',
      commissionScope,
      requestKey: key,
    })
  await t.test(
    'commissions: null differs from explicit zero, missing package or standard configuration blocks completion',
    async () => {
      first = await order()
      assert.equal((await get(`/orders/${first}`)).commissionPending, true)
      await post(`/orders/${first}/complete`, {}, master.cookie, 409)
      await configure(0, null)
      await post(`/orders/${first}/complete`, {}, master.cookie, 409)
      await configure(null, 0)
      await post(`/orders/${first}/complete`, {}, master.cookie, 409)
      await configure(0, 0)
      await complete(first)
      assert.equal((await rows(first)).items[0].amount, 0)
      const data = await get(`/commissions/employees/${employeeId}`)
      assert.ok(data.audit.length >= 3)
    },
  )
  await t.test(
    'commissions: validation, optimistic versions, new qualifications and protected backend permissions',
    async () => {
      setting = await get(`/commissions/employees/${employeeId}`)
      const rates = setting.items.map((r) => ({
        treatmentId: r.treatmentId,
        standardPercent: r.standardPercent,
        packagePercent: r.packagePercent,
      }))
      for (const invalid of [-1, 100.01, 20.123])
        await put(
          {
            version: setting.employee.version,
            rates: rates.map((r) => ({ ...r, standardPercent: invalid })),
          },
          master.cookie,
          400,
        )
      await put(
        { version: setting.employee.version, rates: rates.slice(1) },
        master.cookie,
        409,
      )
      await configure(40, 30)
      await put(
        { version: setting.employee.version, rates },
        master.cookie,
        409,
      )
      await put(
        { version: setting.employee.version, rates },
        professional.cookie,
        403,
      )
      await get(
        `/commissions/employees/${otherEmployee}`,
        professional.cookie,
        404,
      )
      await get('/commissions/options', alice.cookie, 401)
      const own = await get('/commissions/rates', professional.cookie)
      assert.ok(own.items.every((r) => r.employeeId === employeeId))
      await get(`/commissions/employees/${employeeId}`, manager.cookie)
    },
  )
  await t.test(
    'commissions: gross before discounts, unpaid completion, snapshots, concurrent retry and no automatic employee payment',
    async () => {
      first = await order({ sale: 80, gross: 100 })
      const before = (
        await db.query(
          "SELECT count(*)::int n FROM salon_transactions WHERE type_id=(SELECT id FROM transaction_types WHERE name='Pagamento de comissões')",
        )
      ).rows[0].n
      await Promise.all([complete(first), complete(first)])
      let c = (await rows(first)).items
      assert.equal(c.length, 1)
      assert.equal(c[0].amount, 40)
      assert.equal(c[0].grossAmount, 100)
      assert.equal(c[0].percent, 40)
      await configure(50, 25)
      await db.query('UPDATE salon_treatments SET price=999 WHERE id=$1', [
        treatment,
      ])
      await db.query(
        'UPDATE salon_schedule_treatments SET gross_price=999 WHERE schedule_id=$1',
        [first],
      )
      await complete(first)
      c = (await rows(first)).items
      assert.equal(c[0].amount, 40)
      assert.equal(c[0].grossAmount, 100)
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int n FROM salon_transactions WHERE type_id=(SELECT id FROM transaction_types WHERE name='Pagamento de comissões')",
          )
        ).rows[0].n,
        before,
      )
      payment = await pay(first, 80)
      await refund(first, payment.id, 40)
      assert.equal((await rows(first)).items[0].reversed, 20)
      await refund(first, payment.id, 40)
      assert.equal((await rows(first)).items[0].reversed, 40)
      await configure(40, 30)
    },
  )
  await t.test(
    'commissions: partial and full refunds are proportional, audited, capped and idempotent',
    async () => {
      const id = await order()
      await complete(id)
      const p = await pay(id, 100),
        key = randomUUID()
      await Promise.all([
        refund(id, p.id, 50, 'services', key),
        refund(id, p.id, 50, 'services', key),
      ])
      assert.equal((await rows(id)).items[0].reversed, 20)
      const results = await Promise.all([
        request(
          'POST',
          `/orders/${id}/payments/${p.id}/refund`,
          master.cookie,
          {
            amount: 50,
            reason: 'Devolução final',
            commissionScope: 'services',
            requestKey: randomUUID(),
          },
        ),
        request(
          'POST',
          `/orders/${id}/payments/${p.id}/refund`,
          master.cookie,
          {
            amount: 50,
            reason: 'Devolução final concorrente',
            commissionScope: 'services',
            requestKey: randomUUID(),
          },
        ),
      ])
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409])
      assert.equal((await rows(id)).items[0].reversed, 40)
      const audit = (
        await db.query(
          'SELECT a.reason,a.created_by,a.created_at FROM employee_commission_adjustments a JOIN employee_commissions c ON c.id=a.commission_id WHERE c.schedule_id=$1',
          [id],
        )
      ).rows
      assert.equal(audit.length, 2)
      assert.ok(
        audit.every((a) => a.created_by === 1 && a.reason && a.created_at),
      )
    },
  )
  await t.test(
    'commissions: refunds before completion and mixed consumption scopes preserve service commissions correctly',
    async () => {
      const before = await order(),
        p = await pay(before, 100)
      await refund(before, p.id, 50)
      assert.equal((await rows(before)).items.length, 0)
      await complete(before)
      assert.equal((await rows(before)).items[0].reversed, 20)
      const id = await order({ extra: 100 })
      await complete(id)
      const all = await pay(id, 200)
      await refund(id, all.id, 50, 'extras')
      assert.equal((await rows(id)).items[0].reversed, 0)
      await refund(id, all.id, 100, 'proportional')
      assert.equal((await rows(id)).items[0].reversed, 20)
    },
  )
  await t.test(
    'commissions: later products and voided consumptions do not change frozen refund attribution',
    async () => {
      const id = await order(),
        p = await pay(id, 100)
      await post(`/orders/${id}/consumptions`, {
        description: 'Produto após pagamento',
        quantity: 1,
        unitPrice: 100,
        requestKey: randomUUID(),
      })
      await refund(id, p.id, 50, 'proportional')
      await complete(id)
      assert.equal((await rows(id)).items[0].reversed, 20)
      const second = await order({ extra: 100 })
      await db.query(
        'UPDATE order_consumptions SET voided_at=now(),voided_by=1,void_reason=$2 WHERE schedule_id=$1',
        [second, 'Cancelado antes de receber'],
      )
      const payment = await pay(second, 100)
      await complete(second)
      await refund(second, payment.id, 100, 'proportional')
      assert.equal((await rows(second)).items[0].reversed, 40)
    },
  )
  await t.test(
    'commissions: package uses their allocated gross value and specific rate, not the whole package',
    async () => {
      const purchase = (
        await db.query(
          "INSERT INTO package_purchases(customer_id,account_id,promotion_id,title,conditions,price,valid_until,request_key,fingerprint,minimum_payment_percent) SELECT customer_id,account_id,promotion_id,'Pacote de comissão','Teste',200,now()+interval '1 month',$1,'commission-fixture',1 FROM package_purchases ORDER BY id LIMIT 1 RETURNING *",
          [randomUUID()],
        )
      ).rows[0]
      assert.ok(purchase)
      const use = (
        await db.query(
          "INSERT INTO package_uses(purchase_id,treatment_id,treatment_name,duration_minutes,price,state) VALUES($1,$2,'Utilização comissão',30,60,'reserved') RETURNING id",
          [purchase.id, treatment],
        )
      ).rows[0].id
      packageOrder = await order({ sale: 60, gross: 60 })
      await db.query(
        'UPDATE salon_schedules SET package_use_id=$2 WHERE id=$1',
        [packageOrder, use],
      )
      await db.query('UPDATE package_uses SET schedule_id=$2 WHERE id=$1', [
        use,
        packageOrder,
      ])
      await db.query(
        "INSERT INTO package_uses(purchase_id,treatment_id,treatment_name,duration_minutes,price,state) VALUES($1,$2,'Utilização restante',30,140,'available')",
        [purchase.id, treatment],
      )
      const receipt = await post(`/social/packages/${purchase.id}/payments`, {
        amount: 200,
        methodId: method,
        description: 'Pagamento pacote',
        requestKey: randomUUID(),
      })
      await complete(packageOrder)
      const c = (await rows(packageOrder)).items[0]
      assert.equal(c.grossAmount, 60)
      assert.equal(c.percent, 30)
      assert.equal(c.amount, 18)
      // Existing receipt allocation is the accounting source for package refunds.
      const requestKey = randomUUID(),
        body = {
          amount: 100,
          reason: 'Devolução parcial do pacote',
          requestKey,
        }
      await post(`/social/packages/${purchase.id}/refunds/${receipt.id}`, body)
      await post(`/social/packages/${purchase.id}/refunds/${receipt.id}`, body)
      assert.equal((await rows(packageOrder)).items[0].reversed, 9)
    },
  )
  await t.test(
    'commissions: manual closings consume credits once, post-payment adjustments compensate the next closing',
    async () => {
      let b = await get(`/commissions/employees/${employeeId}/balance`)
      const payload = {
        expectedAmount: b.pending,
        methodId: method,
        description: 'Fechamento manual de teste',
        requestKey: randomUUID(),
      }
      const a = await post(
        `/commissions/employees/${employeeId}/closings`,
        payload,
      )
      const retry = await post(
        `/commissions/employees/${employeeId}/closings`,
        payload,
      )
      assert.equal(a.id, retry.id)
      assert.equal(
        (await get(`/commissions/employees/${employeeId}/balance`)).pending,
        0,
      )
      const id = await order()
      await complete(id)
      b = await get(`/commissions/employees/${employeeId}/balance`)
      assert.equal(b.pending, 40)
      await post(`/commissions/employees/${employeeId}/closings`, {
        ...payload,
        expectedAmount: 40,
        requestKey: randomUUID(),
      })
      const p = await pay(id, 100)
      await refund(id, p.id, 50)
      assert.equal(
        (await get(`/commissions/employees/${employeeId}/balance`)).pending,
        -20,
      )
      await post(
        `/commissions/employees/${employeeId}/closings`,
        { ...payload, expectedAmount: 0, requestKey: randomUUID() },
        master.cookie,
        409,
      )
      const next = await order()
      await complete(next)
      b = await get(`/commissions/employees/${employeeId}/balance`)
      assert.equal(b.pending, 20)
      await post(
        `/commissions/employees/${employeeId}/closings`,
        { ...payload, expectedAmount: 40, requestKey: randomUUID() },
        master.cookie,
        409,
      )
      const key = randomUUID(),
        body = { ...payload, expectedAmount: 20, requestKey: key }
      const results = await Promise.all([
        post(`/commissions/employees/${employeeId}/closings`, body),
        post(`/commissions/employees/${employeeId}/closings`, body),
      ])
      assert.equal(results[0].id, results[1].id)
      assert.equal(
        (await get(`/commissions/employees/${employeeId}/balance`)).pending,
        0,
      )
      await post(
        `/commissions/employees/${employeeId}/closings`,
        body,
        professional.cookie,
        403,
      )
    },
  )
  await t.test(
    'commissions: annulment reverses only the remainder and never silently refunds customer payments',
    async () => {
      const id = await order()
      await complete(id)
      const p = await pay(id, 100)
      await refund(id, p.id, 50)
      const body = {
        reason: 'Atendimento anulado pelo gestor',
        acknowledgeLinkedImpact: true,
      }
      await post(
        `/commissions/orders/${id}/annul`,
        body,
        professional.cookie,
        403,
      )
      await post(`/commissions/orders/${id}/annul`, body)
      await post(`/commissions/orders/${id}/annul`, body)
      const c = (await rows(id)).items[0]
      assert.equal(c.amount, 40)
      assert.equal(c.reversed, 40)
      assert.equal(
        (
          await db.query(
            "SELECT sum(value)::float amount FROM salon_transactions WHERE order_id=$1 AND ledger_kind='refund'",
            [id],
          )
        ).rows[0].amount,
        50,
      )
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int n FROM schedule_changes WHERE schedule_id=$1 AND action='annul'",
            [id],
          )
        ).rows[0].n,
        1,
      )
      await post(`/orders/${id}/complete`, {}, master.cookie, 409)
    },
  )
  await t.test(
    'commissions: filtered totals reconcile, operational scope and financial secrecy apply on every endpoint',
    async () => {
      const date = (
        await db.query(
          "SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date::text d",
        )
      ).rows[0].d
      const data = await get(
        `/commissions/movements?employeeId=${employeeId}&treatmentId=${treatment}&from=${date}&to=${date}`,
      )
      const sum = (
        await db.query(
          'SELECT COALESCE(sum(amount),0)::float total FROM employee_commissions WHERE employee_id=$1 AND treatment_id=$2',
          [employeeId, treatment],
        )
      ).rows[0].total
      assert.equal(data.totals.recognized, sum)
      assert.equal(
        Math.round((data.totals.recognized - data.totals.adjustments) * 100),
        Math.round(data.totals.net * 100),
      )
      const own = await get('/commissions/movements', professional.cookie)
      assert.ok(own.items.every((i) => i.employeeId === employeeId))
      assert.equal(
        (
          await get(
            `/commissions/movements?employeeId=${otherEmployee}`,
            professional.cookie,
          )
        ).items.length,
        0,
      )
      for (const suffix of ['', '/balance', '/closings'])
        await get(
          `/commissions/employees/${employeeId}${suffix}`,
          other.cookie,
          404,
        )
      await get(`/commissions/orders/${first}`, other.cookie, 404)
      const catalog = await get('/access/profiles')
      assert.ok(JSON.stringify(catalog).includes('commissions.manage'))
    },
  )
}
