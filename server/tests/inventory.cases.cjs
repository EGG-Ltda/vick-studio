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
  const send = async (
    method,
    path,
    body,
    cookie = master.cookie,
    status = 200,
  ) =>
    requireStatus(await request(method, path, cookie, body), status).body.data
  const supplier = (
    await send('POST', '/inventory/suppliers', {
      name: 'Fornecedor consignado',
      contact: 'contato@example.test',
    })
  ).id
  const courtesySupplier = (
    await send('POST', '/inventory/suppliers', { name: 'Mercado cortesias' })
  ).id
  const productData = {
    name: 'Creme consignado',
    description: 'Venda na comanda',
    supplierId: supplier,
    kind: 'consigned',
    salePrice: 30,
    supplierPercent: 70,
    acquisitionCost: 0,
    active: true,
  }
  const product = (await send('POST', '/inventory/products', productData)).id
  const courtesy = (
    await send('POST', '/inventory/products', {
      ...productData,
      name: 'Água cortesia',
      supplierId: courtesySupplier,
      kind: 'courtesy',
      salePrice: 0,
      supplierPercent: 0,
      acquisitionCost: 2,
    })
  ).id
  const stock = async (id) =>
    Number(
      (await db.query('SELECT stock FROM inventory_products WHERE id=$1', [id]))
        .rows[0].stock,
    )
  const move = (id, body, cookie = master.cookie, status = 200) =>
    send(
      'POST',
      `/inventory/products/${id}/movements`,
      {
        kind: 'entry',
        quantity: 5,
        reason: 'Entrega do fornecedor',
        requestKey: randomUUID(),
        ...body,
      },
      cookie,
      status,
    )
  let sequence = 0
  const order = async () => {
    const start = new Date(Date.UTC(2010, 0, 1 + sequence++, 12))
    const row = (
      await db.query(
        `INSERT INTO salon_schedules(customer_id,schedule_started_at,schedule_ended_at,no_treatments,status,total_price,created_at) VALUES($1,$2,$3,1,'confirmed',100,now()) RETURNING id`,
        [
          alice.body.data.customerId,
          start,
          new Date(start.getTime() + 3600000),
        ],
      )
    ).rows[0]
    await db.query(
      'INSERT INTO salon_schedule_treatments(employee_id,schedule_id,treatment_id,price) VALUES($1,$2,1,100)',
      [employeeId, row.id],
    )
    return row.id
  }
  const method = (
    await db.query("SELECT id FROM payment_methods WHERE name='Pix'")
  ).rows[0].id
  const period = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  })
    .format(new Date())
    .slice(0, 7)
  const report = async (id = supplier) =>
    (await get(`/inventory/settlements?period=${period}&supplierId=${id}`))
      .items[0]
  const sale = (
    id,
    productId,
    quantity = 1,
    key = randomUUID(),
    cookie = professional.cookie,
    status = 200,
  ) =>
    send(
      'POST',
      `/orders/${id}/products`,
      { productId, quantity, requestKey: key },
      cookie,
      status,
    )
  const pay = (id, amount, key = randomUUID()) =>
    send('POST', `/orders/${id}/payments`, {
      amount,
      methodId: method,
      description: 'Pagamento junto com atendimento',
      requestKey: key,
    })
  const settle = (
    amount,
    key = randomUUID(),
    supplierId = supplier,
    status = 200,
  ) =>
    send(
      'POST',
      '/inventory/settlements',
      {
        supplierId,
        period,
        amount,
        methodId: method,
        description: 'Fechamento mensal de produtos',
        requestKey: key,
      },
      manager.cookie,
      status,
    )
  let paidOrder, line
  await t.test(
    'inventory: authenticated permissions, supplier access and operational commercial redaction',
    async () => {
      await get('/inventory/products', '', 401)
      await get('/inventory/products', alice.cookie, 401)
      await get('/inventory/products', professional.cookie, 403)
      await get(
        '/inventory/settlements?period=' + period,
        professional.cookie,
        403,
      )
      await move(product, {}, professional.cookie, 403)
      await db.query(
        "INSERT INTO user_permission_overrides(user_id,permission_key,allowed,updated_by) VALUES(3,'products.view',true,1)",
      )
      const data = await get('/inventory/products', professional.cookie)
      assert.ok(data.items.length >= 2)
      for (const p of data.items)
        for (const key of [
          'supplierPercent',
          'acquisitionCost',
          'supplierId',
          'supplierName',
        ])
          assert.equal(key in p, false)
      await get('/inventory/suppliers', professional.cookie, 403)
      await db.query(
        "DELETE FROM user_permission_overrides WHERE user_id=3 AND permission_key='products.view'",
      )
    },
  )
  await t.test(
    'inventory: invalid models, stock entry retry, negative stock and movement history',
    async () => {
      await send(
        'POST',
        '/inventory/products',
        { ...productData, supplierPercent: 101 },
        master.cookie,
        400,
      )
      await send(
        'POST',
        '/inventory/products',
        { ...productData, kind: 'courtesy' },
        master.cookie,
        400,
      )
      const body = { requestKey: randomUUID(), quantity: 5 }
      const entry = await move(product, body)
      assert.equal((await move(product, body)).id, entry.id)
      assert.equal(await stock(product), 5)
      await move(product, { ...body, quantity: 6 }, master.cookie, 409)
      await move(product, { kind: 'loss', quantity: 6 }, master.cookie, 409)
      assert.equal(await stock(product), 5)
      assert.equal(
        (await get(`/inventory/products/${product}/movements`)).items.length,
        1,
      )
    },
  )
  await t.test(
    'inventory: courtesy purchases create payable costs but free consumption has no sales repass',
    async () => {
      await move(courtesy, { unitCost: 2 })
      assert.equal(
        Number((await report(courtesySupplier)).periodDueCents),
        1000,
      )
      const id = await order()
      const item = await sale(id, courtesy)
      const ledger = await get('/orders/' + id)
      assert.equal(ledger.extras.find((x) => x.id === item.id).total, 0)
      assert.equal(ledger.grandTotal, 100)
      assert.equal(await stock(courtesy), 4)
      await send('POST', `/orders/${id}/consumptions/${item.id}/void`, {
        reason: 'Cortesia já consumida',
        restock: false,
      })
      assert.equal(await stock(courtesy), 4)
      assert.equal(Number((await report(courtesySupplier)).consignmentCents), 0)
      await settle(10, randomUUID(), courtesySupplier)
      assert.equal(Number((await report(courtesySupplier)).balanceCents), 0)
    },
  )
  await t.test(
    'inventory: order sales use server snapshots, retry once, own-staff scope and paid recognition',
    async () => {
      paidOrder = await order()
      const key = randomUUID()
      line = await sale(paidOrder, product, 1, key)
      assert.equal((await sale(paidOrder, product, 1, key)).id, line.id)
      await sale(paidOrder, product, 2, key, professional.cookie, 409)
      assert.equal(await stock(product), 4)
      await get(`/orders/${paidOrder}/products`, other.cookie, 404)
      await sale(paidOrder, product, 1, randomUUID(), other.cookie, 404)
      assert.equal(Number((await report()).consignmentCents), 0)
      await send('PUT', '/inventory/products/' + product, {
        ...productData,
        salePrice: 50,
        supplierPercent: 80,
      })
      let ledger = await get('/orders/' + paidOrder)
      assert.equal(ledger.extras.find((x) => x.id === line.id).unitPrice, 30)
      assert.equal(ledger.grandTotal, 130)
      await pay(paidOrder, 100)
      assert.equal(Number((await report()).consignmentCents), 0)
      const paymentKey = randomUUID()
      await pay(paidOrder, 30, paymentKey)
      await pay(paidOrder, 30, paymentKey)
      const closing = await report()
      assert.equal(Number(closing.consignmentCents), 2100)
      assert.equal(Number(closing.grossCents), 3000)
      assert.equal(Number(closing.balanceCents), 2100)
      ledger = await get('/orders/' + paidOrder)
      assert.equal(ledger.balance, 0)
    },
  )
  await t.test(
    'inventory: monthly supplier payments are idempotent, bounded and integrate with real finance',
    async () => {
      const key = randomUUID()
      const p = await settle(21, key)
      assert.equal((await settle(21, key)).id, p.id)
      await settle(1, randomUUID(), supplier, 409)
      const reportData = await report()
      assert.equal(Number(reportData.balanceCents), 0)
      assert.equal(Number(reportData.paidCents), 2100)
      const payment = (
        await db.query(
          'SELECT t.* FROM inventory_supplier_payments p JOIN salon_transactions t ON t.id=p.transaction_id WHERE p.id=$1',
          [p.id],
        )
      ).rows[0]
      assert.equal(payment.is_debit, true)
      assert.equal(Number(payment.value), 21)
      const statement = await get(
        `/inventory/suppliers/${supplier}/statement?period=${period}`,
      )
      assert.ok(
        statement.items.some(
          (e) => e.orderId === paidOrder && Number(e.amountCents) === 2100,
        ),
      )
      assert.equal(statement.payments.length, 1)
    },
  )
  await t.test(
    'inventory: explicit product returns reverse supplier debt, preserve payments and do not refund cash silently',
    async () => {
      await send(
        'POST',
        `/orders/${paidOrder}/consumptions/${line.id}/void`,
        { reason: 'Produto devolvido' },
        master.cookie,
        400,
      )
      await send('POST', `/orders/${paidOrder}/consumptions/${line.id}/void`, {
        reason: 'Produto devolvido intacto',
        restock: true,
      })
      assert.equal(await stock(product), 5)
      assert.equal(Number((await report()).balanceCents), -2100)
      assert.equal((await get('/orders/' + paidOrder)).balance, -30)
      await send(
        'POST',
        `/orders/${paidOrder}/consumptions/${line.id}/void`,
        { reason: 'Reenvio da devolução', restock: true },
        master.cookie,
        409,
      )
      assert.equal(await stock(product), 5)
      assert.equal(
        (
          await db.query(
            'SELECT count(*)::int AS n FROM inventory_supplier_payments WHERE supplier_id=$1',
            [supplier],
          )
        ).rows[0].n,
        1,
      )
    },
  )
  await t.test(
    'inventory: concurrent orders cannot oversell the last unit and completed orders accept no new sale',
    async () => {
      const last = (
        await send('POST', '/inventory/products', {
          ...productData,
          name: 'Última unidade',
        })
      ).id
      await move(last, { quantity: 1 })
      const a = await order(),
        b = await order()
      const results = await Promise.all([
        request('POST', `/orders/${a}/products`, professional.cookie, {
          productId: last,
          quantity: 1,
          requestKey: randomUUID(),
        }),
        request('POST', `/orders/${b}/products`, professional.cookie, {
          productId: last,
          quantity: 1,
          requestKey: randomUUID(),
        }),
      ])
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409])
      assert.equal(await stock(last), 0)
      await db.query(
        "UPDATE salon_schedules SET status='completed',completed_at=now() WHERE id=$1",
        [a],
      )
      await sale(a, product, 1, randomUUID(), professional.cookie, 409)
    },
  )
  await t.test(
    'inventory: inactive products, loss/return/adjustment history and stock totals remain consistent',
    async () => {
      await move(product, { kind: 'supplier_return', quantity: 1 })
      await move(product, {
        kind: 'loss',
        quantity: 1,
        reason: 'Produto vencido',
      })
      await move(product, {
        kind: 'adjustment',
        quantity: 2,
        reason: 'Contagem física conferida',
      })
      assert.equal(await stock(product), 5)
      const sum = (
        await db.query(
          'SELECT sum(quantity)::int AS n FROM inventory_movements WHERE product_id=$1',
          [product],
        )
      ).rows[0].n
      assert.equal(sum, await stock(product))
      await send('PUT', '/inventory/products/' + product, {
        ...productData,
        active: false,
      })
      assert.equal(
        (await get('/inventory/products')).items.some((p) => p.id === product),
        false,
      )
      assert.equal(
        (await get('/inventory/products?inactive=true')).items.some(
          (p) => p.id === product,
        ),
        true,
      )
      await sale(
        await order(),
        product,
        1,
        randomUUID(),
        professional.cookie,
        409,
      )
    },
  )
  await t.test(
    'inventory: courtesy supplier returns preserve previous payments as a supplier credit',
    async () => {
      await move(courtesy, {
        kind: 'supplier_return',
        quantity: 1,
        unitCost: 2,
        reason: 'Devolução aceita pelo mercado',
      })
      assert.equal(await stock(courtesy), 3)
      const closing = await report(courtesySupplier)
      assert.equal(Number(closing.balanceCents), -200)
      assert.equal(Number(closing.paidCents), 1000)
    },
  )
  await t.test(
    'inventory: fractional supplier percentage preserves cents and concurrent repayments cannot exceed debt',
    async () => {
      const supplierId = (
        await send('POST', '/inventory/suppliers', {
          name: 'Fornecedor centavos',
        })
      ).id
      const p = (
        await send('POST', '/inventory/products', {
          ...productData,
          supplierId,
          name: 'Produto centavos',
          salePrice: 0.05,
          supplierPercent: 33.33,
        })
      ).id
      await move(p, { quantity: 3 })
      const id = await order()
      await sale(id, p, 3)
      await pay(id, 100.15)
      const closing = await report(supplierId)
      assert.equal(Number(closing.grossCents), 15)
      assert.equal(Number(closing.consignmentCents), 5)
      const body = {
        supplierId,
        period,
        amount: 0.05,
        methodId: method,
        description: 'Repasse concorrente de centavos',
      }
      const responses = await Promise.all([
        request('POST', '/inventory/settlements', manager.cookie, {
          ...body,
          requestKey: randomUUID(),
        }),
        request('POST', '/inventory/settlements', manager.cookie, {
          ...body,
          requestKey: randomUUID(),
        }),
      ])
      assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409])
      assert.equal(Number((await report(supplierId)).balanceCents), 0)
    },
  )
}
