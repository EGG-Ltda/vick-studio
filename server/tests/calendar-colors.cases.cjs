const assert = require('node:assert/strict')
const { randomBytes } = require('node:crypto')

module.exports = async ({
  t,
  request,
  requireStatus,
  db,
  master,
  manager,
  professional,
  employeeId,
}) => {
  const get = async (path, cookie = master.cookie) =>
    requireStatus(await request('GET', path, cookie), 200).body.data
  const target = (
    await db.query(
      'SELECT u.* FROM app_users u JOIN employees e ON e.user_id=u.id WHERE e.id=$1',
      [employeeId],
    )
  ).rows[0]
  const profile = { login: target.login, email: target.email }
  const update = (body, cookie = master.cookie) =>
    request('PUT', `/users/${target.id}`, cookie, { ...profile, ...body })

  await t.test(
    'calendar colors default for existing users and persist on creation',
    async () => {
      assert.equal(target.calendar_color, '#A51545')
      const suffix = randomBytes(5).toString('hex')
      for (const [index, color] of [undefined, '#12abcd'].entries()) {
        const user = requireStatus(
          await request('POST', '/users', master.cookie, {
            login: `color-${suffix}-${index}`,
            email: `color-${suffix}-${index}@example.test`,
            password: randomBytes(12).toString('hex'),
            ...(color ? { calendarColor: color } : {}),
          }),
          200,
        ).body.data
        assert.equal(user.calendarColor, color ? '#12ABCD' : '#A51545')
        assert.equal(
          (
            await db.query('SELECT calendar_color FROM app_users WHERE id=$1', [
              user.id,
            ])
          ).rows[0].calendar_color,
          user.calendarColor,
        )
      }
    },
  )

  await t.test(
    'calendar colors reject malformed input and unauthorized changes',
    async () => {
      for (const calendarColor of ['red', '#fff', '#12345678', '', null])
        requireStatus(await update({ calendarColor }), 400)
      for (const actor of [manager, professional])
        requireStatus(
          await update({ calendarColor: '#FFFFFF' }, actor.cookie),
          403,
        )
      await assert.rejects(
        db.query('UPDATE app_users SET calendar_color=$1 WHERE id=$2', [
          'invalid',
          target.id,
        ]),
        { code: '23514' },
      )
    },
  )

  await t.test(
    'color updates affect existing schedules and catalog without changing appointments or sessions',
    async () => {
      const before = (
        await db.query('SELECT * FROM salon_schedules ORDER BY id')
      ).rows
      const route =
        '/schedules?start=2020-01-01T00:00:00Z&end=2099-01-01T00:00:00Z'
      const previous = (await get(route)).filter(
        (item) => item.employeeId === employeeId,
      )
      assert.ok(previous.length)
      const changed = requireStatus(
        await update({ calendarColor: '#abcdef' }),
        200,
      ).body.data
      assert.equal(changed.calendarColor, '#ABCDEF')
      const current = (await get(route)).filter(
        (item) => item.employeeId === employeeId,
      )
      assert.ok(current.every((item) => item.calendarColor === '#ABCDEF'))
      assert.deepEqual(
        current.map(({ calendarColor, ...item }) => item),
        previous.map(({ calendarColor, ...item }) => item),
      )
      const catalog = await get('/booking/catalog', '')
      assert.equal(
        catalog.employees.find((item) => item.id === employeeId).calendarColor,
        '#ABCDEF',
      )
      requireStatus(await update({}), 200)
      assert.equal(
        (
          await db.query('SELECT calendar_color FROM app_users WHERE id=$1', [
            target.id,
          ])
        ).rows[0].calendar_color,
        '#ABCDEF',
      )
      assert.deepEqual(
        (await db.query('SELECT * FROM salon_schedules ORDER BY id')).rows,
        before,
      )
      requireStatus(await request('GET', route, professional.cookie), 200)
      requireStatus(await update({ calendarColor: target.calendar_color }), 200)
    },
  )
}
