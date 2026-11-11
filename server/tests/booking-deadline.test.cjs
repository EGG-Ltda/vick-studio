const { test } = require('node:test')
const assert = require('node:assert/strict')
const { customerDepositDeadline } = require('../dist/modules/booking/deadline')
const now = new Date('2026-11-10T10:00:00-03:00')
test('Friday and tomorrow keep the previous-day 23:59 deadline when it is still future', () => {
  for (const [start, limit] of [
    ['2026-11-13T14:00:00-03:00', '2026-11-12T23:59:59.999-03:00'],
    ['2026-11-11T14:00:00-03:00', '2026-11-10T23:59:59.999-03:00'],
  ]) {
    const result = customerDepositDeadline(
      new Date(start),
      new Date(limit),
      now,
      2,
    )
    assert.equal(result.shortNotice, false)
    assert.equal(result.deadline.getTime(), new Date(limit).getTime())
  }
})
test('same-day or elapsed standard deadline gets the configured short window', () => {
  const past = new Date('2026-11-09T23:59:59.999-03:00')
  const result = customerDepositDeadline(
    new Date('2026-11-10T18:00:00-03:00'),
    past,
    now,
    2,
  )
  assert.equal(result.shortNotice, true)
  assert.equal(
    result.deadline.toISOString(),
    new Date('2026-11-10T12:00:00-03:00').toISOString(),
  )
  assert.equal(
    customerDepositDeadline(
      new Date('2026-11-11T14:00:00-03:00'),
      past,
      now,
      1,
    ).deadline.getTime(),
    now.getTime() + 3600000,
  )
})
test('short deadline never exceeds the appointment start and past appointments are rejected', () => {
  const start = new Date('2026-11-10T11:00:00-03:00'),
    past = new Date('2026-11-09T23:59:59.999-03:00')
  assert.equal(
    customerDepositDeadline(start, past, now, 2).deadline.getTime(),
    start.getTime(),
  )
  assert.throws(
    () => customerDepositDeadline(now, past, now, 2),
    /must start in the future/,
  )
})
