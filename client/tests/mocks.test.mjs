import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { mockRequest, resetDemo, mockPromotionArt } from '../src/mocks/api.ts'
import { day, today } from '../src/mocks/fixtures.ts'
const storage = new Map()
globalThis.sessionStorage = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
}
globalThis.fetch = () => {
  throw Error('A demonstração não pode acessar a rede.')
}
const get = (p) => mockRequest(p)
const send = (p, b, method = 'POST') =>
  mockRequest(p, { method, body: JSON.stringify(b) })
const login = (login) => send('/auth/signin', { login, password: 'demo12345' })
beforeEach(() => resetDemo())
test('transportes não possuem fetch executável e artes são locais', () => {
  const root = path.resolve('src')
  function inspect(folder) {
    for (const f of fs.readdirSync(folder, { withFileTypes: true })) {
      const name = path.join(folder, f.name)
      if (f.isDirectory()) inspect(name)
      else if (/\.tsx?$/.test(name)) {
        const source = ts.createSourceFile(
          name,
          fs.readFileSync(name, 'utf8'),
          ts.ScriptTarget.Latest,
          true,
        )
        function visit(n) {
          if (
            ts.isCallExpression(n) &&
            ts.isIdentifier(n.expression) &&
            n.expression.text === 'fetch'
          )
            assert.fail(`Fetch executável em ${name}`)
          ts.forEachChild(n, visit)
        }
        visit(source)
      }
    }
  }
  inspect(root)
  assert.equal(mockPromotionArt(1), '/demo-promotion.svg')
})
test('home, catálogo e promoções carregam sem backend ou login', async () => {
  const treatments = await get('/public/treatments?page=0'),
    catalog = await get('/booking/catalog'),
    promotions = await get('/public/promotions')
  assert.equal(treatments.length, 3)
  assert.equal(catalog.employees.length, 2)
  assert.equal(promotions.items.length, 1)
  await assert.rejects(get('/auth/session'), /sessão não iniciada/)
})
test('sessões do salão e cliente são independentes e não armazenam senhas', async () => {
  const u = await login('master.demo')
  assert.equal(u.role, 'MASTER')
  assert.ok(u.permissions.includes('profiles.manage'))
  await send('/customer/login', {
    email: 'cliente@demo.test',
    password: 'demo12345',
  })
  await send('/auth/signout', {})
  assert.equal((await get('/customer/session')).id, 1)
  assert.ok(!JSON.stringify([...storage]).includes('demo12345'))
  await assert.rejects(login('desconhecido'), /Demonstração/)
})
test('todas as telas administrativas recebem contratos completos', async () => {
  await login('master.demo')
  for (const route of [
    '/users?page=0',
    '/treatments?page=0',
    '/booking/employees',
    '/booking/settings',
    '/customers?search=&page=0',
    '/customers/1',
    '/customers/1/history?view=all&page=0',
    '/customers/1/payments?page=0',
    '/customers/1/notes',
    '/customers/1/packages',
    '/access/profiles',
    '/access/users/3',
    '/access/audit',
    '/social/promotions',
    '/social/birthdays?month=' + Number(today().slice(5, 7)),
    '/social/birthdays/today',
    '/finance?from=' + day(-30) + '&to=' + day(1),
    '/' + 'finance/options',
    '/orders/1',
    '/orders/1/changes',
    '/orders/1/dependencies',
  ])
    assert.notEqual(await get(route), undefined, route)
  assert.ok(Array.isArray(await get('/customers/1/packages')))
  assert.ok((await get('/customers/1')).completedCount > 0)
})
test('operacional visualiza exemplos de agenda e financeiro somente próprios', async () => {
  await login('carla.demo')
  const own = await get('/finance?from=' + day(-30) + '&to=' + day(1))
  assert.equal(own.scope, 'own')
  assert.equal(own.income, 80)
  await assert.rejects(get('/booking/orders/2'), /não disponível/)
  await assert.rejects(get('/finance/options'), /restritos/)
})
test('formulários simulam alterações locais e reset restaura os exemplos', async () => {
  await login('master.demo')
  const t = await send('/treatments', {
    name: 'Serviço demonstrativo',
    description: 'Exemplo',
    price: 22,
    durationMinutes: 30,
    dependencies: [],
  })
  assert.ok((await get('/treatments')).some((x) => x.id === t.id))
  await send('/customers/1', { name: 'Nome fictício alterado' }, 'PUT')
  assert.equal((await get('/customers/1')).name, 'Nome fictício alterado')
  await send('/orders/1/consumptions', {
    description: 'Chocolate fictício',
    quantity: 2,
    unitPrice: 5,
    requestKey: 'consumo-demo',
  })
  assert.equal((await get('/orders/1')).extrasTotal, 10)
  resetDemo()
  await login('master.demo')
  assert.equal((await get('/treatments')).length, 3)
})
test('agendamento e pacote mockados retornam conjuntos, comandas e histórico', async () => {
  await send('/customer/login', {
    email: 'cliente@demo.test',
    password: 'demo12345',
  })
  const p = await send('/booking/dependency-plan', { rootIds: [1] }),
    appointments = []
  for (const n of p.nodes) {
    const employeeId = n.treatmentId === 1 ? 2 : 1,
      time = n.treatmentId === 1 ? '12:00' : '10:00',
      slots = await get(
        `/customer/slots?employeeId=${employeeId}&treatmentIds=${n.treatmentId}&date=${day(2)}`,
      ),
      s = slots.find(
        (s) =>
          Date.parse(s.startsAt) ===
          Date.parse(day(2) + 'T' + time + ':00-03:00'),
      )
    assert.ok(s)
    appointments.push({
      key: n.key,
      employeeId,
      startsAt: s.startsAt,
      expectedDeposit: s.deposit,
      expectedDeadline: s.deadline,
    })
  }
  const b = { rootIds: [1], requestKey: 'group-demo', appointments },
    result = await send('/customer/booking-groups', b),
    retry = await send('/customer/booking-groups', b)
  assert.equal(result.bookings.length, 2)
  assert.equal(retry.id, result.id)
  await login('master.demo')
  assert.equal(
    (await get(`/orders/${result.bookings[0].id}/dependencies`)).members.length,
    2,
  )
  const pp = await send('/booking/dependency-plan', { promotionId: 1 }),
    pack = await send('/customer/booking-groups', {
      promotionId: 1,
      requestKey: 'package-demo',
      appointments: pp.nodes.map((n, i) => ({
        key: n.key,
        employeeId: 1,
        startsAt: day(3) + `T${i === 0 ? '10' : '12'}:00:00-03:00`,
      })),
    })
  assert.equal(pack.bookings.length, 2)
  assert.equal((await get('/customer/packages')).length, 1)
})
test('rotas ausentes e cancelamentos não fazem fallback para uma API real', async () => {
  await login('master.demo')
  await assert.rejects(get('/nao-existe'), /sem contrato/)
  const c = new AbortController()
  c.abort()
  await assert.rejects(mockRequest('/auth/session', { signal: c.signal }), {
    name: 'AbortError',
  })
})
