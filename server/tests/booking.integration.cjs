const { test } = require('node:test')
const assert = require('node:assert/strict')
const { Client } = require('pg')
const bcrypt = require('bcryptjs')
const { randomBytes, randomUUID } = require('node:crypto')
const { spawn, execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const net = require('node:net')
const { setTimeout: delay } = require('node:timers/promises')
const root = path.resolve(__dirname, '..')
const cpf = (seed) => {
  let s = String(seed).padStart(9, '0')
  for (let n = 9; n <= 10; n++) {
    const sum = [...s].reduce((a, c, i) => a + Number(c) * (n + 1 - i), 0)
    s += String(((sum * 10) % 11) % 10)
  }
  return s
}
test(
  'online booking: customers, deposit, deadlines, concurrency and released slots',
  { timeout: 180000 },
  async (t) => {
    assert.ok(
      process.env.TEST_DATABASE_CONNECTION_STRING,
      'Set TEST_DATABASE_CONNECTION_STRING',
    )
    const dbname = 'booking_test_' + randomBytes(8).toString('hex')
    const admin = new Client({
      connectionString: process.env.TEST_DATABASE_CONNECTION_STRING,
    })
    const url = new URL(process.env.TEST_DATABASE_CONNECTION_STRING)
    url.pathname = '/' + dbname
    const db = new Client({ connectionString: url.toString() })
    let child,
      created = false,
      base
    const password = randomBytes(16).toString('hex')
    const request = async (method, route, cookie = '', body) => {
      const response = await fetch(base + '/api' + route, {
        method,
        headers: {
          Cookie: cookie,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      return {
        status: response.status,
        body: await response.json(),
        cookie: response.headers
          .getSetCookie()
          .map((c) => c.split(';')[0])
          .join('; '),
      }
    }
    const requireStatus = (result, status) => {
      assert.equal(result.status, status, JSON.stringify(result.body))
      return result
    }
    await admin.connect()
    try {
      await admin.query('CREATE DATABASE "' + dbname + '"')
      created = true
      await db.connect()
      await db.query(fs.readFileSync(path.join(root, '../db/init.sql'), 'utf8'))
      for (let i = 1; i <= 4; i++)
        await db.query(
          `INSERT INTO app_users(login,email,hash_password,is_active,is_admin,created_at) VALUES($1,$2,$3,true,$4,now())`,
          [
            'user' + i,
            `user${i}@example.test`,
            await bcrypt.hash(password, 10),
            i === 2,
          ],
        )
      execFileSync(process.execPath, ['scripts/migrate.cjs'], {
        cwd: root,
        env: { ...process.env, DATABASE_CONNECTION_STRING: url.toString() },
        stdio: 'pipe',
      })
      execFileSync(process.execPath, ['scripts/migrate.cjs'], {
        cwd: root,
        env: { ...process.env, DATABASE_CONNECTION_STRING: url.toString() },
        stdio: 'pipe',
      })
      await db.query(
        `INSERT INTO salon_treatments(name,description,price,duration_minutes,is_active,created_at) VALUES('Unha em gel','Unhas',100,60,true,now()),('Esmaltação','Unhas',80,30,true,now()),('Inativo','Inativo',10,10,false,now())`,
      )
      const socket = net.createServer()
      await new Promise((r) => socket.listen(0, '127.0.0.1', r))
      const port = socket.address().port
      await new Promise((r) => socket.close(r))
      base = 'http://127.0.0.1:' + port
      child = spawn(process.execPath, ['dist/app.js'], {
        cwd: root,
        windowsHide: true,
        env: {
          ...process.env,
          DATABASE_CONNECTION_STRING: url.toString(),
          PORT: String(port),
          NODE_ENV: 'test',
          MASTER_USER_ID: '1',
          JWT_TOKEN_SECRET: randomBytes(32).toString('hex'),
          JWT_TOKEN_ISSUER: 'booking-test',
          JWT_TOKEN_AUDIENCE: 'booking-test',
          JWT_TOKEN_ACCESS_EXP: '3600',
          JWT_TOKEN_REFRESH_EXP: '604800',
          JWT_TOKEN_ACCESS_TOPIC: 'access',
          JWT_TOKEN_REFRESH_TOPIC: 'refresh',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let logs = ''
      child.stdout.on('data', (v) => (logs += v))
      child.stderr.on('data', (v) => (logs += v))
      let ready = false
      for (let i = 0; i < 100; i++) {
        try {
          const r = await request('GET', '/booking/catalog')
          if (r.status === 200) {
            ready = true
            break
          }
        } catch {}
        await delay(100)
      }
      assert.ok(ready, logs)
      const master = requireStatus(
          await request('POST', '/auth/signin', '', {
            login: 'user1',
            password,
          }),
          200,
        ),
        manager = requireStatus(
          await request('POST', '/auth/signin', '', {
            login: 'user2',
            password,
          }),
          200,
        ),
        professional = requireStatus(
          await request('POST', '/auth/signin', '', {
            login: 'user3',
            password,
          }),
          200,
        ),
        other = requireStatus(
          await request('POST', '/auth/signin', '', {
            login: 'user4',
            password,
          }),
          200,
        )
      const staffData = {
        name: 'Profissional Teste',
        cpf: cpf(123456789),
        userId: 3,
        active: true,
        treatmentIds: [1, 2],
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        opensAt: '09:00',
        closesAt: '18:00',
      }
      let employeeId, alice, bob
      await t.test(
        'employee validation identifies CPF, user and working-time errors',
        async () => {
          for (const [changes, expected] of [
            [{ cpf: '11111111111' }, /Invalid CPF/],
            [{ userId: 0 }, /Select a salon user/],
            [{ opensAt: '18:00', closesAt: '09:00' }, /Closing time/],
          ]) {
            const response = requireStatus(
              await request('POST', '/booking/employees', master.cookie, {
                ...staffData,
                ...changes,
              }),
              400,
            )
            assert.match(response.body.message, expected)
          }
        },
      )
      await t.test(
        'admin configuration and real professional qualifications',
        async () => {
          requireStatus(
            await request('PUT', '/booking/settings', other.cookie, {
              enabled: true,
              depositDays: 1,
              depositType: 'percent',
              depositValue: 30,
              paymentInstructions: 'Teste de sinal',
            }),
            403,
          )
          requireStatus(
            await request('PUT', '/booking/settings', master.cookie, {
              enabled: true,
              depositDays: 1,
              depositType: 'percent',
              depositValue: 30,
              paymentInstructions: 'Pagamento de teste no salão.',
            }),
            200,
          )
          const result = requireStatus(
            await request(
              'POST',
              '/booking/employees',
              master.cookie,
              staffData,
            ),
            200,
          )
          employeeId = result.body.data.id
          const catalog = requireStatus(
            await request('GET', '/booking/catalog'),
            200,
          ).body.data
          assert.equal(catalog.employees.length, 1)
          assert.equal(catalog.treatments.length, 2)
          assert.equal('cpf' in catalog.employees[0], false)
          assert.equal('email' in catalog.employees[0], false)
        },
      )
      const registration = {
        name: 'Cliente Alice',
        cpf: cpf(234567890),
        email: 'alice@example.test',
        phone: '11999999999',
        password,
      }
      await t.test(
        'customer registration, normalized duplicates and isolated sessions',
        async () => {
          requireStatus(
            await request('POST', '/customer/register', '', {
              ...registration,
              cpf: '11111111111',
            }),
            400,
          )
          alice = requireStatus(
            await request('POST', '/customer/register', '', registration),
            200,
          )
          assert.equal('password_hash' in alice.body.data, false)
          requireStatus(
            await request('POST', '/customer/register', '', {
              ...registration,
              email: 'other@example.test',
            }),
            409,
          )
          requireStatus(
            await request('POST', '/customer/register', '', {
              ...registration,
              cpf: cpf(345678901),
              email: 'ALICE@example.test',
            }),
            409,
          )
          bob = requireStatus(
            await request('POST', '/customer/register', '', {
              ...registration,
              name: 'Cliente Bob',
              cpf: cpf(456789012),
              email: 'bob@example.test',
            }),
            200,
          )
          requireStatus(
            await request('GET', '/customer/session', master.cookie),
            401,
          )
          requireStatus(await request('GET', '/users', alice.cookie), 401)
          requireStatus(
            await request('POST', '/customer/login', '', {
              email: registration.email,
              password: 'wrong',
            }),
            401,
          )
          const signed = requireStatus(
            await request('POST', '/customer/login', '', {
              email: 'ALICE@example.test',
              password,
            }),
            200,
          )
          assert.equal(signed.body.data.id, alice.body.data.id)
          const stored = (
            await db.query(
              'SELECT password_hash FROM customer_accounts WHERE id=$1',
              [alice.body.data.id],
            )
          ).rows[0]
          assert.notEqual(stored.password_hash, password)
          assert.ok(await bcrypt.compare(password, stored.password_hash))
        },
      )
      const date = new Date(Date.now() + 10 * 86400000)
        .toISOString()
        .slice(0, 10)
      const slotsRoute = (ids = '1,2') =>
        `/customer/slots?employeeId=${employeeId}&treatmentIds=${ids}&date=${date}`
      const bodyFor = (slot) => ({
        employeeId,
        treatmentIds: [1, 2],
        startsAt: slot.startsAt,
        requestKey: randomUUID(),
        expectedTotal: slot.total,
        expectedDeposit: slot.deposit,
        expectedDeadline: slot.deadline,
        expectedInstructions: slot.instructions,
      })
      let first, firstBody, initialSlots
      await t.test(
        'review contains backend prices, duration and 23:59 deadline in salon timezone',
        async () => {
          initialSlots = requireStatus(
            await request('GET', slotsRoute(), alice.cookie),
            200,
          ).body.data
          assert.ok(initialSlots.length > 0)
          const slot = initialSlots[0]
          assert.equal(slot.total, 180)
          assert.equal(slot.deposit, 54)
          assert.equal(slot.duration, 90)
          assert.ok(slot.deadline.endsWith('02:59:59.999Z'))
          assert.equal(
            new Date(slot.endsAt) - new Date(slot.startsAt),
            90 * 60000,
          )
          requireStatus(
            await request('POST', '/customer/bookings', alice.cookie, {
              ...bodyFor(slot),
              expectedTotal: 1,
            }),
            409,
          )
          requireStatus(
            await request('POST', '/customer/bookings', alice.cookie, {
              ...bodyFor(slot),
              startsAt: date + 'T23:00:00-03:00',
            }),
            409,
          )
          requireStatus(
            await request('POST', '/customer/bookings', alice.cookie, {
              ...bodyFor(slot),
              treatmentIds: [3],
            }),
            409,
          )
        },
      )
      await t.test(
        'simultaneous overlapping reservations and resubmissions create only one booking',
        async () => {
          firstBody = bodyFor(initialSlots[0])
          const otherBody = { ...firstBody, requestKey: randomUUID() }
          const results = await Promise.all([
            request('POST', '/customer/bookings', alice.cookie, firstBody),
            request('POST', '/customer/bookings', bob.cookie, otherBody),
          ])
          assert.deepEqual(results.map((r) => r.status).sort(), [200, 409])
          const winner = results.findIndex((r) => r.status === 200)
          if (winner === 1) {
            ;[alice, bob] = [bob, alice]
            firstBody = otherBody
          }
          first = results[winner].body.data
          assert.equal(first.status, 'awaiting_deposit')
          assert.equal(first.customerName, alice.body.data.name)
          assert.equal('employeeUserId' in first, false)
          const repeated = requireStatus(
            await request(
              'POST',
              '/customer/bookings',
              alice.cookie,
              firstBody,
            ),
            200,
          )
          assert.equal(repeated.body.data.id, first.id)
          assert.equal(
            (
              await db.query(
                'SELECT count(*)::int AS total FROM salon_schedules',
              )
            ).rows[0].total,
            1,
          )
          requireStatus(
            await request('POST', '/customer/bookings', alice.cookie, {
              ...firstBody,
              startsAt: initialSlots[1].startsAt,
            }),
            409,
          )
          const available = requireStatus(
            await request('GET', slotsRoute(), bob.cookie),
            200,
          ).body.data
          assert.ok(
            !available.some(
              (slot) =>
                new Date(slot.startsAt).getTime() ===
                new Date(first.startsAt).getTime(),
            ),
          )
        },
      )
      await t.test(
        'only responsible professional or administrators confirm, with audit and stable snapshot',
        async () => {
          requireStatus(
            await request(
              'POST',
              `/booking/orders/${first.id}/deposit`,
              other.cookie,
              { amount: 54 },
            ),
            403,
          )
          requireStatus(
            await request(
              'POST',
              `/booking/orders/${first.id}/deposit`,
              alice.cookie,
              { amount: 54 },
            ),
            401,
          )
          requireStatus(
            await request(
              'POST',
              `/booking/orders/${first.id}/deposit`,
              professional.cookie,
              { amount: 10 },
            ),
            400,
          )
          const result = requireStatus(
            await request(
              'POST',
              `/booking/orders/${first.id}/deposit`,
              professional.cookie,
              { amount: 54 },
            ),
            200,
          ).body.data
          assert.equal(result.status, 'confirmed')
          assert.equal(result.depositReceived, 54)
          assert.equal(result.depositConfirmedBy, 'user3')
          assert.ok(result.depositConfirmedAt)
          requireStatus(
            await request(
              'POST',
              `/booking/orders/${first.id}/deposit`,
              professional.cookie,
              { amount: 54 },
            ),
            200,
          )
          await db.query('UPDATE salon_treatments SET price=200 WHERE id=1')
          requireStatus(
            await request('PUT', '/booking/settings', manager.cookie, {
              enabled: true,
              depositDays: 3,
              depositType: 'fixed',
              depositValue: 40,
              paymentInstructions: 'Novas condições de teste.',
            }),
            200,
          )
          const original = requireStatus(
            await request('GET', `/booking/orders/${first.id}`, master.cookie),
            200,
          ).body.data
          assert.equal(original.totalPrice, 180)
          assert.equal(original.depositRequired, 54)
          assert.equal(
            original.paymentInstructions,
            'Pagamento de teste no salão.',
          )
          requireStatus(
            await request(
              'POST',
              '/customer/bookings',
              alice.cookie,
              firstBody,
            ),
            200,
          )
          requireStatus(
            await request(
              'POST',
              '/customer/bookings',
              bob.cookie,
              bodyFor(initialSlots[initialSlots.length - 1]),
            ),
            409,
          )
        },
      )
      let cancelled
      await t.test(
        'expired pending booking remains visible with a reason and releases the slot',
        async () => {
          const available = requireStatus(
            await request('GET', slotsRoute(), alice.cookie),
            200,
          ).body.data
          const payload = bodyFor(available[0])
          cancelled = requireStatus(
            await request('POST', '/customer/bookings', alice.cookie, payload),
            200,
          ).body.data
          await db.query(
            "UPDATE salon_schedules SET deposit_due_at=now()-interval '1 second' WHERE id=$1",
            [cancelled.id],
          )
          const history = requireStatus(
            await request('GET', '/customer/bookings', alice.cookie),
            200,
          ).body.data
          const old = history.find((item) => item.id === cancelled.id)
          assert.equal(old.status, 'cancelled')
          assert.equal(
            old.cancellationReason,
            'Deposit was not confirmed by the deadline.',
          )
          assert.ok(old.cancelledAt)
          requireStatus(
            await request(
              'POST',
              `/booking/orders/${cancelled.id}/deposit`,
              master.cookie,
              { amount: 40 },
            ),
            409,
          )
          const freed = requireStatus(
            await request('GET', slotsRoute(), bob.cookie),
            200,
          ).body.data.find(
            (slot) =>
              new Date(slot.startsAt).getTime() ===
              new Date(cancelled.startsAt).getTime(),
          )
          assert.ok(freed)
          const replacement = requireStatus(
            await request(
              'POST',
              '/customer/bookings',
              bob.cookie,
              bodyFor(freed),
            ),
            200,
          ).body.data
          assert.notEqual(replacement.id, cancelled.id)
          const dayStart = date + 'T00:00:00-03:00',
            dayEnd = date + 'T23:59:59-03:00'
          const agenda = requireStatus(
            await request(
              'GET',
              `/schedules?start=${encodeURIComponent(dayStart)}&end=${encodeURIComponent(dayEnd)}`,
              master.cookie,
            ),
            200,
          ).body.data
          assert.ok(
            agenda.some(
              (item) => item.id === cancelled.id && item.status === 'cancelled',
            ),
          )
          assert.ok(
            agenda.some(
              (item) =>
                item.id === replacement.id &&
                item.status === 'awaiting_deposit',
            ),
          )
          const confirmed = requireStatus(
            await request('GET', `/booking/orders/${first.id}`, master.cookie),
            200,
          ).body.data
          assert.equal(confirmed.status, 'confirmed')
        },
      )
      await t.test(
        'near reservations remain online with a short deadline and staff can override it',
        async () => {
          const tomorrow = new Date(Date.now() + 86400000)
              .toISOString()
              .slice(0, 10),
            specific = new Date(Date.now() + 3600000).toISOString()
          const query = `employeeId=${employeeId}&treatmentIds=1,2&date=${tomorrow}`
          const onlineSlots = requireStatus(
            await request('GET', '/customer/slots?' + query, alice.cookie),
            200,
          ).body.data
          assert.ok(onlineSlots.length > 0)
          const onlineSlot = onlineSlots[onlineSlots.length - 1]
          assert.equal(onlineSlot.shortNotice, true)
          assert.equal(onlineSlot.shortNoticeHours, 2)
          assert.ok(
            new Date(onlineSlot.deadline) <= new Date(Date.now() + 2 * 3600000),
          )
          const onlineBody = bodyFor(onlineSlot)
          const online = requireStatus(
            await request(
              'POST',
              '/customer/bookings',
              alice.cookie,
              onlineBody,
            ),
            200,
          ).body.data
          assert.equal(online.depositDueAt, onlineSlot.deadline)
          await delay(50)
          const replay = requireStatus(
            await request(
              'POST',
              '/customer/bookings',
              alice.cookie,
              onlineBody,
            ),
            200,
          ).body.data
          assert.equal(replay.id, online.id)
          assert.equal(replay.depositDueAt, online.depositDueAt)
          requireStatus(
            await request('PUT', '/booking/settings', manager.cookie, {
              enabled: true,
              depositDays: 3,
              shortNoticeHours: 1,
              depositType: 'fixed',
              depositValue: 40,
              paymentInstructions: 'Novas condições de teste.',
            }),
            200,
          )
          const shorter = requireStatus(
            await request('GET', '/customer/slots?' + query, alice.cookie),
            200,
          ).body.data
          assert.ok(shorter.length > 0)
          assert.equal(shorter[0].shortNoticeHours, 1)
          assert.ok(
            new Date(shorter[0].deadline) <= new Date(Date.now() + 3600000),
          )
          assert.equal(
            requireStatus(
              await request('GET', '/customer/bookings', alice.cookie),
              200,
            ).body.data.find((item) => item.id === online.id).depositDueAt,
            online.depositDueAt,
          )
          requireStatus(
            await request('PUT', '/booking/settings', manager.cookie, {
              enabled: true,
              depositDays: 3,
              shortNoticeHours: 2,
              depositType: 'fixed',
              depositValue: 40,
              paymentInstructions: 'Novas condições de teste.',
            }),
            200,
          )

          const available = requireStatus(
            await request(
              'GET',
              '/booking/staff-slots?' +
                query +
                '&depositDeadline=' +
                encodeURIComponent(specific),
              master.cookie,
            ),
            200,
          ).body.data
          assert.ok(available.length > 0)
          requireStatus(
            await request(
              'GET',
              '/booking/staff-slots?' +
                query +
                '&depositDeadline=' +
                encodeURIComponent(specific),
              other.cookie,
            ),
            403,
          )
          const staffBody = {
            ...bodyFor(available[0]),
            customerId: alice.body.data.customerId,
            depositDeadline: specific,
          }
          requireStatus(
            await request(
              'POST',
              '/customer/bookings',
              alice.cookie,
              staffBody,
            ),
            409,
          )
          const booked = requireStatus(
            await request(
              'POST',
              '/booking/staff-bookings',
              master.cookie,
              staffBody,
            ),
            200,
          ).body.data
          assert.equal(booked.depositDueAt, specific)
          const races = await Promise.all([
            request(
              'POST',
              `/booking/orders/${booked.id}/deposit`,
              master.cookie,
              { amount: 40 },
            ),
            request('GET', '/customer/bookings', alice.cookie),
          ])
          assert.ok([200, 409].includes(races[0].status))
        },
      )
      await t.test(
        'background routine cancels without anyone opening the agenda',
        async () => {
          const available = requireStatus(
            await request('GET', slotsRoute(), alice.cookie),
            200,
          ).body.data
          const order = requireStatus(
            await request(
              'POST',
              '/customer/bookings',
              alice.cookie,
              bodyFor(available[0]),
            ),
            200,
          ).body.data
          await db.query(
            "UPDATE salon_schedules SET deposit_due_at=now()-interval '1 second' WHERE id=$1",
            [order.id],
          )
          await delay(1200)
          const stored = (
            await db.query(
              'SELECT status,cancellation_reason FROM salon_schedules WHERE id=$1',
              [order.id],
            )
          ).rows[0]
          assert.equal(stored.status, 'cancelled')
          assert.equal(
            stored.cancellation_reason,
            'Deposit was not confirmed by the deadline.',
          )
        },
      )
      await t.test(
        'confirmation racing expiration never produces a paid cancellation',
        async () => {
          const available = requireStatus(
            await request('GET', slotsRoute(), alice.cookie),
            200,
          ).body.data
          const order = requireStatus(
            await request(
              'POST',
              '/customer/bookings',
              alice.cookie,
              bodyFor(available[0]),
            ),
            200,
          ).body.data
          await db.query(
            "UPDATE salon_schedules SET deposit_due_at=clock_timestamp()+interval '10 milliseconds' WHERE id=$1",
            [order.id],
          )
          await Promise.all([
            request(
              'POST',
              '/booking/orders/' + order.id + '/deposit',
              professional.cookie,
              { amount: 40 },
            ),
            request('GET', '/customer/bookings', alice.cookie),
          ])
          await delay(700)
          const stored = (
            await db.query(
              'SELECT status,deposit_confirmed_at,cancelled_at FROM salon_schedules WHERE id=$1',
              [order.id],
            )
          ).rows[0]
          assert.ok(['cancelled', 'confirmed'].includes(stored.status))
          assert.equal(
            Boolean(stored.deposit_confirmed_at),
            stored.status === 'confirmed',
          )
          assert.equal(
            Boolean(stored.cancelled_at),
            stored.status === 'cancelled',
          )
        },
      )
      await require('./customer-history.cases.cjs')({
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
      })
      await t.test(
        'availability respects disabled professionals and logout invalidates customer session',
        async () => {
          requireStatus(
            await request(
              'PUT',
              '/booking/employees/' + employeeId,
              master.cookie,
              { ...staffData, active: false },
            ),
            200,
          )
          assert.equal(
            requireStatus(
              await request('GET', '/booking/catalog'),
              200,
            ).body.data.employees.some(
              (employee) => employee.id === employeeId,
            ),
            false,
          )
          assert.equal(
            requireStatus(await request('GET', slotsRoute(), alice.cookie), 200)
              .body.data.length,
            0,
          )
          requireStatus(
            await request('POST', '/customer/logout', alice.cookie),
            200,
          )
          requireStatus(
            await request('GET', '/customer/session', alice.cookie),
            401,
          )
        },
      )
    } finally {
      if (child && child.exitCode === null) {
        await new Promise((resolve) => {
          child.once('exit', resolve)
          child.kill()
        })
      }
      await db.end().catch(() => {})
      if (created)
        await admin.query('DROP DATABASE "' + dbname + '" WITH (FORCE)')
      await admin.end()
    }
  },
)
