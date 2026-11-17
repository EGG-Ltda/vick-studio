const assert = require('node:assert/strict')
const bcrypt = require('bcryptjs')
const { randomUUID, randomBytes } = require('node:crypto')
module.exports = async ({
  t,
  request,
  requireStatus,
  db,
  master,
  manager,
  professional,
  alice,
  cpf,
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
  const password = randomBytes(12).toString('hex')
  const account = (
    await db.query(
      "INSERT INTO app_users(login,email,hash_password,is_active,created_at) VALUES('availability.staff','availability@example.test',$1,true,now()) RETURNING id",
      [await bcrypt.hash(password, 10)],
    )
  ).rows[0]
  const person = (
    await db.query(
      'INSERT INTO persons(name,cpf_cnpj,is_pj,created_at) VALUES($1,$2,false,now()) RETURNING id',
      ['Funcionária Disponibilidade', cpf(987123456)],
    )
  ).rows[0]
  const employee = (
    await db.query(
      'INSERT INTO employees(person_id,user_id,is_active,created_at) VALUES($1,$2,true,now()) RETURNING id',
      [person.id, account.id],
    )
  ).rows[0].id
  const treatment = (
    await db.query(
      "INSERT INTO salon_treatments(name,description,price,duration_minutes,is_active,created_at) VALUES('Disponibilidade teste','Teste',100,60,true,now()) RETURNING id",
    )
  ).rows[0].id
  await db.query(
    'INSERT INTO employee_salon_treatments(employee_id,treatment_id,created_at) VALUES($1,$2,now())',
    [employee, treatment],
  )
  await db.query(
    "INSERT INTO employee_booking_hours(employee_id,weekday,opens_at,closes_at,lunch_start) SELECT $1,day,'09:00','18:00','12:00' FROM generate_series(0,6) day",
    [employee],
  )
  const staff = requireStatus(
    await request('POST', '/auth/signin', '', {
      login: 'availability.staff',
      password,
    }),
    200,
  )
  const date = (n) =>
    new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
  const hour = (iso) =>
    new Date(iso)
      .toLocaleTimeString('en-GB', { timeZone: 'America/Sao_Paulo' })
      .slice(0, 5)
  const slots = async (day) =>
    get(
      `/customer/slots?employeeId=${employee}&treatmentIds=${treatment}&date=${day}`,
      alice.cookie,
    )
  const req = (body, cookie = staff.cookie, status = 200) =>
    send(
      'POST',
      '/availability/requests',
      {
        kind: 'lunch',
        date: date(45),
        startsAt: '11:00',
        reason: 'Compromisso durante o almoço',
        requestKey: randomUUID(),
        ...body,
      },
      cookie,
      status,
    )
  const decide = (
    id,
    action = 'approve',
    cookie = manager.cookie,
    status = 200,
    key = randomUUID(),
  ) =>
    send(
      'POST',
      `/availability/requests/${id}/decision`,
      { action, reason: 'Solicitação analisada pela gestão', requestKey: key },
      cookie,
      status,
    )
  const employeeData = {
    name: 'Funcionária Disponibilidade',
    cpf: cpf(987123456),
    userId: account.id,
    active: true,
    treatmentIds: [treatment],
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    opensAt: '09:00',
    closesAt: '18:00',
  }
  const save = (body, status = 200) =>
    send(
      'PUT',
      '/booking/employees/' + employee,
      { ...employeeData, ...body },
      master.cookie,
      status,
    )
  const book = async (day, time) => {
    const slot = (await slots(day)).find((s) => hour(s.startsAt) === time)
    assert.ok(slot, day + ' ' + time)
    return request('POST', '/customer/bookings', alice.cookie, {
      employeeId: employee,
      treatmentIds: [treatment],
      startsAt: slot.startsAt,
      requestKey: randomUUID(),
      expectedTotal: slot.total,
      expectedDeposit: slot.deposit,
      expectedDeadline: slot.deadline,
      expectedInstructions: slot.instructions,
    })
  }
  let lunchRequest
  await t.test(
    'availability: lunch, weekday and end-of-shift restrictions apply to public slots',
    async () => {
      let times = (await slots(date(45))).map((s) => hour(s.startsAt))
      assert.ok(times.includes('11:00'))
      assert.ok(!times.includes('11:15'))
      assert.ok(!times.includes('12:00'))
      assert.ok(times.includes('13:00'))
      assert.ok(times.includes('17:00'))
      assert.ok(!times.includes('17:15'))
      const weekday = new Date(date(46) + 'T12:00:00Z').getUTCDay()
      await save({
        hours: Array.from({ length: 7 }, (_, i) => ({
          weekday: i,
          opensAt: '09:00',
          closesAt: '18:00',
          lunchStart: '12:00',
        })).filter((h) => h.weekday !== weekday),
      })
      assert.equal((await slots(date(46))).length, 0)
      await save({
        hours: Array.from({ length: 7 }, (_, weekday) => ({
          weekday,
          opensAt: '09:00',
          closesAt: '18:00',
          lunchStart: '12:00',
        })),
      })
      await save({ lunchStart: '17:30', hours: undefined }, 400)
    },
  )
  await t.test(
    'availability: requests are scoped, future-only, idempotent, and notify authorized managers',
    async () => {
      await get('/availability/requests', alice.cookie, 401)
      await req({ startsAt: '08:00' }, staff.cookie, 409)
      await req({ date: '2020-01-01' }, staff.cookie, 400)
      await req({}, master.cookie, 403)
      const key = randomUUID()
      lunchRequest = await req({ requestKey: key })
      // Even non-overlapping lunch changes cannot create two lunches on one date.
      await req({ startsAt: '10:00' }, staff.cookie, 409)
      assert.equal((await req({ requestKey: key })).id, lunchRequest.id)
      await req({ requestKey: key, startsAt: '10:00' }, staff.cookie, 409)
      const own = await get('/availability/requests', staff.cookie)
      assert.ok(own.items.some((r) => r.id === lunchRequest.id))
      assert.equal(own.canManage, false)
      assert.equal(
        (await get('/availability/requests', professional.cookie)).items.some(
          (r) => r.id === lunchRequest.id,
        ),
        false,
      )
      await get(
        `/availability/requests/${lunchRequest.id}/events`,
        professional.cookie,
        404,
      )
      assert.ok(
        (await get('/availability/notices', manager.cookie)).items.some(
          (n) => n.kind === 'review',
        ),
      )
      assert.ok(
        (await slots(date(45))).some((s) => hour(s.startsAt) === '11:00'),
        'pending must not block',
      )
    },
  )
  await t.test(
    'availability: approval replaces only this day lunch, rejects operational approvals and records audit',
    async () => {
      await decide(lunchRequest.id, 'approve', staff.cookie, 404)
      const key = randomUUID()
      await decide(lunchRequest.id, 'approve', manager.cookie, 200, key)
      await decide(lunchRequest.id, 'approve', manager.cookie, 200, key)
      const times = (await slots(date(45))).map((s) => hour(s.startsAt))
      assert.ok(!times.includes('11:00'))
      assert.ok(times.includes('12:00'))
      assert.ok(times.includes('13:00'))
      assert.ok(
        !(await slots(date(46))).some((s) => hour(s.startsAt) === '12:00'),
      )
      const history = await get(
        `/availability/requests/${lunchRequest.id}/events`,
        staff.cookie,
      )
      assert.deepEqual(
        history.map((e) => e.action),
        ['request', 'approve'],
      )
      assert.ok(
        (await get('/availability/notices', staff.cookie)).items.some(
          (n) => n.kind === 'decision',
        ),
      )
      const blocks = await get(
        `/availability/blocks?start=${date(45)}T00:00:00-03:00&end=${date(46)}T00:00:00-03:00`,
        staff.cookie,
      )
      assert.ok(blocks.every((b) => b.employeeId === employee))
      assert.ok(blocks.some((b) => hour(b.startsAt) === '11:00'))
      assert.equal(JSON.stringify(blocks).includes('Compromisso'), false)
    },
  )
  await t.test(
    'availability: restoring lunch and changing working hours detect future appointment conflicts',
    async () => {
      requireStatus(await book(date(45), '12:00'), 200)
      await decide(lunchRequest.id, 'cancel', manager.cookie, 409)
      assert.equal(
        (
          await db.query(
            'SELECT status FROM employee_availability_requests WHERE id=$1',
            [lunchRequest.id],
          )
        ).rows[0].status,
        'approved',
      )
      await save({ opensAt: '14:00', lunchStart: '15:00' }, 409)
      const current = (
        await db.query(
          'SELECT opens_at FROM employee_booking_hours WHERE employee_id=$1 LIMIT 1',
          [employee],
        )
      ).rows[0]
      assert.equal(current.opens_at, '09:00:00')
    },
  )
  await t.test(
    'availability: absences conflict-check again at approval, and refusals/cancellations do not block',
    async () => {
      const d = date(48)
      const absence = await req({
        kind: 'absence',
        date: d,
        startsAt: '14:00',
        endsAt: '15:00',
      })
      requireStatus(await book(d, '14:00'), 200)
      await decide(absence.id, 'approve', master.cookie, 409)
      await decide(absence.id, 'decline', master.cookie)
      const cancelled = await req({
        kind: 'absence',
        date: date(49),
        startsAt: '14:00',
        endsAt: '15:00',
      })
      await decide(cancelled.id, 'cancel', staff.cookie)
      assert.ok(
        (await slots(date(49))).some((s) => hour(s.startsAt) === '14:00'),
      )
      await decide(cancelled.id, 'approve', master.cookie, 409)
    },
  )
  await t.test(
    'availability: vacation blocks every inclusive day, cancellation releases it and permission revocation is immediate',
    async () => {
      const vacation = await req({
        kind: 'vacation',
        date: date(50),
        endDate: date(51),
        startsAt: undefined,
      })
      await decide(vacation.id)
      assert.equal((await slots(date(50))).length, 0)
      assert.equal((await slots(date(51))).length, 0)
      assert.ok((await slots(date(52))).length)
      await decide(vacation.id, 'cancel', staff.cookie, 403)
      await decide(vacation.id, 'cancel', master.cookie)
      assert.ok((await slots(date(50))).length)
      await db.query(
        "INSERT INTO user_permission_overrides(user_id,permission_key,allowed,updated_by) VALUES($1,'availability.request',false,1)",
        [account.id],
      )
      await req(
        { kind: 'absence', date: date(52), startsAt: '14:00', endsAt: '15:00' },
        staff.cookie,
        403,
      )
      await db.query(
        "DELETE FROM user_permission_overrides WHERE user_id=$1 AND permission_key='availability.request'",
        [account.id],
      )
    },
  )
  await t.test(
    'availability: booking racing approval has exactly one winner and keeps a consistent calendar',
    async () => {
      const day = date(54),
        absence = await req({
          kind: 'absence',
          date: day,
          startsAt: '14:00',
          endsAt: '15:00',
        })
      const slot = (await slots(day)).find((s) => hour(s.startsAt) === '14:00')
      assert.ok(slot)
      const results = await Promise.all([
        request('POST', '/customer/bookings', alice.cookie, {
          employeeId: employee,
          treatmentIds: [treatment],
          startsAt: slot.startsAt,
          requestKey: randomUUID(),
          expectedTotal: slot.total,
          expectedDeposit: slot.deposit,
          expectedDeadline: slot.deadline,
          expectedInstructions: slot.instructions,
        }),
        request(
          'POST',
          `/availability/requests/${absence.id}/decision`,
          master.cookie,
          {
            action: 'approve',
            reason: 'Aprovação simultânea validada',
            requestKey: randomUUID(),
          },
        ),
      ])
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409])
      const status = (
        await db.query(
          'SELECT status FROM employee_availability_requests WHERE id=$1',
          [absence.id],
        )
      ).rows[0].status
      const booked = (
        await db.query(
          "SELECT count(*)::int AS n FROM salon_schedules s JOIN salon_schedule_treatments st ON st.schedule_id=s.id WHERE st.employee_id=$1 AND s.status<>'cancelled' AND (s.schedule_started_at AT TIME ZONE 'America/Sao_Paulo')::date=$2::date",
          [employee, day],
        )
      ).rows[0].n
      assert.equal(status === 'approved' ? 0 : 1, booked)
    },
  )
}
