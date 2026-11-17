const { test } = require('node:test')
const assert = require('node:assert/strict')
const { validatePlan } = require('../dist/modules/dependencies/rules')
const make = (rule = {}) => ({
  nodes: [{ key: 'main' }, { key: 'required' }],
  rules: [
    {
      main: 'main',
      required: 'required',
      mainName: 'Gel',
      requiredName: 'Manutenção',
      position: 'before',
      sameDay: true,
      consecutive: false,
      minMinutes: 0,
      maxMinutes: null,
      ...rule,
    },
  ],
})
const at = (key, start, end) => ({ key, startsAt: start, endsAt: end })
test('dependencies: same day uses Brasilia dates, not the UTC calendar', () => {
  const a = [
    at('required', '2030-05-01T23:00:00-03:00', '2030-05-01T23:30:00-03:00'),
    at('main', '2030-05-02T00:00:00-03:00', '2030-05-02T00:30:00-03:00'),
  ]
  assert.throws(() => validatePlan(make(), a), /same salon day/)
  assert.doesNotThrow(() =>
    validatePlan(make({ sameDay: false, minMinutes: 30, maxMinutes: 30 }), a),
  )
})
test('dependencies: after order, consecutive and interval boundaries use the preceding end', () => {
  const a = [
    at('main', '2030-05-01T10:00:00-03:00', '2030-05-01T11:00:00-03:00'),
    at('required', '2030-05-01T11:00:00-03:00', '2030-05-01T11:30:00-03:00'),
  ]
  assert.doesNotThrow(() =>
    validatePlan(make({ position: 'after', consecutive: true }), a),
  )
  assert.throws(
    () => validatePlan(make({ position: 'before' }), a),
    /Invalid order/,
  )
  assert.throws(
    () => validatePlan(make({ position: 'after', minMinutes: 15 }), a),
    /Invalid order/,
  )
  a[1].startsAt = '2030-05-01T11:15:00-03:00'
  a[1].endsAt = '2030-05-01T11:45:00-03:00'
  assert.doesNotThrow(() =>
    validatePlan(
      make({ position: 'after', minMinutes: 15, maxMinutes: 15 }),
      a,
    ),
  )
  assert.throws(
    () => validatePlan(make({ position: 'after', consecutive: true }), a),
    /Invalid order/,
  )
})
test('dependencies: different professionals never permit customer overlaps or missing procedures', () => {
  const p = { nodes: [{ key: 'main' }, { key: 'required' }], rules: [] },
    a = [
      at('main', '2030-05-01T10:00:00Z', '2030-05-01T11:00:00Z'),
      at('required', '2030-05-01T10:30:00Z', '2030-05-01T11:30:00Z'),
    ]
  assert.throws(() => validatePlan(p, a), /cannot overlap/)
  assert.throws(() => validatePlan(p, a.slice(0, 1)), /exactly once/)
})
