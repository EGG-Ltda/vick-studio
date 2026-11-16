import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import type { WorkingDay } from '../src/pages/availability/availabilityApi'

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost',
})
for (const key of [
  'window',
  'document',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLSelectElement',
  'Node',
  'Event',
  'MouseEvent',
  'MutationObserver',
]) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: (dom.window as any)[key],
  })
}
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: dom.window.navigator,
})
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const { createElement: h, act, useState } = await import('react')
const { createRoot } = await import('react-dom/client')
const { WeeklyHoursEditor } = await import(
  '../src/pages/availability/WeeklyHoursEditor'
)
let root: ReturnType<typeof createRoot>
afterEach(() => {
  if (root) act(() => root.unmount())
  document.body.innerHTML = ''
})
function setup(initial: WorkingDay[]) {
  function Fixture() {
    const [hours, setHours] = useState(initial)
    return h(
      'div',
      {},
      h(WeeklyHoursEditor, { value: hours, onChange: setHours }),
      h('output', { 'data-hours': true }, JSON.stringify(hours)),
    )
  }
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root.render(h(Fixture)))
  return (): WorkingDay[] =>
    JSON.parse(document.querySelector('[data-hours]')!.textContent!)
}
test('working-day toggles keep other days and their individual hours intact', () => {
  const initial = [
    { weekday: 1, opensAt: '09:00', closesAt: '18:00', lunchStart: '12:00' },
    { weekday: 2, opensAt: '10:00', closesAt: '17:00', lunchStart: '13:00' },
  ]
  const current = setup(initial)
  const checks = document.querySelectorAll<HTMLInputElement>('[type=checkbox]')
  act(() => checks[1].click())
  assert.deepEqual(current(), [initial[1]])
  act(() => checks[3].click())
  assert.deepEqual(current(), [
    initial[1],
    { weekday: 3, opensAt: '09:00', closesAt: '18:00', lunchStart: '12:00' },
  ])
  assert.equal(document.querySelectorAll('.availability-time-grid').length, 2)
})
test('editing lunch updates its one-hour end without changing another weekday', () => {
  const initial = [
    { weekday: 1, opensAt: '09:00', closesAt: '18:00', lunchStart: '12:00' },
    { weekday: 2, opensAt: '10:00', closesAt: '17:00', lunchStart: null },
  ]
  const current = setup(initial)
  const lunch = document.querySelectorAll<HTMLInputElement>(
    '.availability-day.is-enabled input.salon-temporal-text',
  )[2]
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(lunch, '11:30')
    lunch.dispatchEvent(new Event('input', { bubbles: true }))
  })
  assert.equal(current()[0].lunchStart, '11:30')
  assert.deepEqual(current()[1], initial[1])
  assert.match(document.body.textContent!, /Almoço: 11:30 às 12:30/)
})
