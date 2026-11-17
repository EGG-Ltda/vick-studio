const { test } = require('node:test')
const assert = require('node:assert/strict')
const { allocate } = require('../dist/modules/social/schemas')
test('package accounting preserves every cent for uneven, free and high-value procedures', () => {
  for (let length = 1; length <= 20; length++) {
    const weights = Array.from({ length }, (_, i) =>
      i % 3 === 0 ? 0 : (i + 1) * 12347,
    )
    for (const cents of [1, 3, 15001, 9999999]) {
      const result = allocate(cents, weights)
      assert.equal(
        result.reduce((s, n) => s + n, 0),
        cents,
      )
      assert.ok(result.every((n) => Number.isSafeInteger(n) && n >= 0))
      assert.deepEqual(allocate(cents, weights), result)
    }
  }
  assert.deepEqual(allocate(5, [0, 0, 0]), [2, 2, 1])
})
test('partial package refunds never consume more than any original allocated receipt', () => {
  for (const weights of [
    [1, 1, 1],
    [8333, 6667],
    [0, 1, 9999998],
    [123, 456, 789, 0],
  ]) {
    const remaining = [...weights],
      sum = weights.reduce((s, n) => s + n, 0)
    for (const fraction of [0.01, 0.31, 0.5, 1]) {
      const outstanding = remaining.reduce((s, n) => s + n, 0)
      const cents = Math.min(
        outstanding,
        Math.max(1, Math.floor(sum * fraction)),
      )
      const refund = allocate(cents, remaining)
      assert.equal(
        refund.reduce((s, n) => s + n, 0),
        cents,
      )
      refund.forEach((n, i) => {
        assert.ok(n <= remaining[i])
        remaining[i] -= n
      })
    }
    assert.equal(
      remaining.reduce((s, n) => s + n, 0),
      0,
    )
  }
})
test('invalid monetary weights and noninteger cents are rejected', () => {
  for (const args of [
    [-1, [1]],
    [0.5, [1]],
    [1, [-1]],
    [1, [0.5]],
    [1, []],
    [NaN, [1]],
  ])
    assert.throws(() => allocate(...args))
})
