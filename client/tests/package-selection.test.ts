import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  packageSet,
  packageSlotAllowed,
} from '../src/pages/social/packageSelection'
import { ruleText } from '../src/pages/dependencies/ruleText'
import { minimumPackagePayment } from '../src/pages/social/socialApi'
import type { Plan, Choice } from '../src/pages/dependencies/GroupBooking'
import type { BookingSlot } from '../src/pages/booking/bookingApi'
const node = (key: string, treatmentId: number) => ({
  key,
  treatmentId,
  name: key,
  price: 0,
  chargedPrice: 0,
  durationMinutes: 60,
  included: true,
  blocked: null,
})
const rule = (main: string, required: string) => ({
  main,
  required,
  mainName: main,
  requiredName: required,
  requiredTreatmentId: 2,
  position: 'after' as const,
  sameDay: true,
  consecutive: false,
  minMinutes: 0,
  maxMinutes: null,
})
const plan: Plan = {
  nodes: [
    node('hair1', 1),
    node('hair2', 1),
    node('brow1', 2),
    node('brow2', 2),
  ],
  rules: [rule('hair1', 'brow1'), rule('hair2', 'brow2')],
  signature: 'x',
  promotionId: 1,
  rootIds: [1, 1, 2, 2],
}
const slot = (start: string, end: string) =>
  ({
    startsAt: '2026-12-01T' + start + ':00-03:00',
    endsAt: '2026-12-01T' + end + ':00-03:00',
  }) as BookingSlot
const choice: Choice = {
  key: 'hair1',
  employeeId: 1,
  slot: slot('09:00', '10:00'),
}
test('each package combination retains separate occurrences and can be selected from either member', () => {
  assert.deepEqual(packageSet(plan, 'hair1'), ['hair1', 'brow1'])
  assert.deepEqual(packageSet(plan, 'brow1'), ['hair1', 'brow1'])
  assert.deepEqual(packageSet(plan, 'hair2'), ['hair2', 'brow2'])
})
test('indirect requirements are included without swallowing another purchased pair', () => {
  const p = {
    ...plan,
    nodes: [...plan.nodes, node('extra1', 3)],
    rules: [...plan.rules, rule('brow1', 'extra1')],
  }
  assert.deepEqual(packageSet(p, 'hair1'), ['hair1', 'brow1', 'extra1'])
})
test('a later choice cannot overlap or reverse its predecessor and allows a zero-gap start', () => {
  assert.equal(
    packageSlotAllowed(plan, 'brow1', slot('09:30', '10:00'), {
      hair1: choice,
    }),
    false,
  )
  assert.equal(
    packageSlotAllowed(plan, 'brow1', slot('08:00', '09:00'), {
      hair1: choice,
    }),
    false,
  )
  assert.equal(
    packageSlotAllowed(plan, 'brow1', slot('10:00', '10:30'), {
      hair1: choice,
    }),
    true,
  )
})
test('same-day and configured intervals constrain the choices', () => {
  const p = {
    ...plan,
    rules: [{ ...plan.rules[0], minMinutes: 15, maxMinutes: 60 }],
  }
  assert.equal(
    packageSlotAllowed(p, 'brow1', slot('10:00', '10:30'), { hair1: choice }),
    false,
  )
  assert.equal(
    packageSlotAllowed(p, 'brow1', slot('10:15', '10:45'), { hair1: choice }),
    true,
  )
  assert.equal(
    packageSlotAllowed(p, 'brow1', slot('11:15', '11:45'), { hair1: choice }),
    false,
  )
  assert.equal(
    packageSlotAllowed(
      plan,
      'brow1',
      {
        ...slot('10:15', '10:45'),
        startsAt: '2026-12-02T10:15:00-03:00',
        endsAt: '2026-12-02T10:45:00-03:00',
      },
      { hair1: choice },
    ),
    false,
  )
})
test('public guidance omits a zero minimum but preserves nonzero configured limits', () => {
  assert.doesNotMatch(ruleText(plan.rules[0]), /0 min/)
  assert.match(ruleText({ ...plan.rules[0], minMinutes: 30 }), /30 min/)
  assert.match(ruleText({ ...plan.rules[0], maxMinutes: 60 }), /60 min/)
})
test('minimum payments use integer cents and round upward to the first payable cent', () => {
  assert.equal(minimumPackagePayment(250, 50), 125)
  assert.equal(minimumPackagePayment(150.01, 30), 45.01)
  assert.equal(minimumPackagePayment(99.99, 100), 99.99)
  assert.equal(minimumPackagePayment(0.01, 0.01), 0.01)
})
