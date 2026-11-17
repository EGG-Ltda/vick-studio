import type { Plan, Choice } from '../dependencies/GroupBooking'
import type { BookingSlot } from '../booking/bookingApi'
export function packageSet(plan: Plan, key: string): string[] {
  const keys = new Set([key])
  let changed = true
  while (changed) {
    changed = false
    for (const r of plan.rules)
      if (keys.has(r.main) || keys.has(r.required)) {
        for (const k of [r.main, r.required])
          if (!keys.has(k)) {
            keys.add(k)
            changed = true
          }
      }
  }
  return plan.nodes.filter((n) => keys.has(n.key)).map((n) => n.key)
}
const day = (v: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    new Date(v),
  )
export function packageSlotAllowed(
  plan: Plan,
  key: string,
  slot: BookingSlot,
  choices: Record<string, Choice | null>,
) {
  for (const c of Object.values(choices))
    if (
      c &&
      c.key !== key &&
      Date.parse(c.slot.startsAt) < Date.parse(slot.endsAt) &&
      Date.parse(c.slot.endsAt) > Date.parse(slot.startsAt)
    )
      return false
  for (const r of plan.rules) {
    if (r.main !== key && r.required !== key) continue
    const m = r.main === key ? slot : choices[r.main]?.slot,
      d = r.required === key ? slot : choices[r.required]?.slot
    if (!m || !d) continue
    const [before, after] = r.position === 'before' ? [d, m] : [m, d],
      gap = (Date.parse(after.startsAt) - Date.parse(before.endsAt)) / 60000
    if (
      gap < 0 ||
      gap < r.minMinutes ||
      (r.maxMinutes !== null && gap > r.maxMinutes) ||
      (r.consecutive && gap !== 0) ||
      (r.sameDay && day(m.startsAt) !== day(d.startsAt))
    )
      return false
  }
  return true
}
