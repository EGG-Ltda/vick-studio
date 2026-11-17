import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeCalendarColor,
  calendarForeground,
  DEFAULT_CALENDAR_COLOR,
} from '../src/pages/dashboard/calendarColors.ts'

test('invalid or absent colors fall back safely and valid hex is normalized', () => {
  for (const color of [
    undefined,
    '',
    '#fff',
    'red',
    'url(example)',
    '#11223344',
  ])
    assert.equal(normalizeCalendarColor(color), DEFAULT_CALENDAR_COLOR)
  assert.equal(normalizeCalendarColor('#ab12cd'), '#AB12CD')
})
test('text contrast exceeds 4.5 for a representative RGB grid including extremes', () => {
  for (let r = 0; r <= 255; r += 17)
    for (let g = 0; g <= 255; g += 17)
      for (let b = 0; b <= 255; b += 17) {
        const color =
          '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')
        const linear = [r, g, b]
          .map((n) => n / 255)
          .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4))
        const luminance =
          linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
        const ratio =
          calendarForeground(color) === '#FFFFFF'
            ? 1.05 / (luminance + 0.05)
            : (luminance + 0.05) / 0.05
        assert.ok(ratio >= 4.5, `${color}: ${ratio}`)
      }
})
