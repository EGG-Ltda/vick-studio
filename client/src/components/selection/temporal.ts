export type TemporalType = 'date' | 'month' | 'time' | 'datetime-local'
export const pad = (value: number) => String(value).padStart(2, '0')
export function localDay(date = new Date()) {
  return `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
export function dateParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [, year, month, day] = match.map(Number)
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(0, 0, 0, 0)
  return year > 0 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null
}
export function shiftDay(value: string, days: number) {
  const date = dateParts(value)!
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
export function shiftMonth(value: string, months: number) {
  const date = dateParts(value)!
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + months)
  const next = new Date(date)
  next.setUTCMonth(next.getUTCMonth() + 1)
  next.setUTCDate(0)
  date.setUTCDate(Math.min(day, next.getUTCDate()))
  return date.toISOString().slice(0, 10)
}
export function calendarDays(month: string): string[] {
  const first = dateParts(month + '-01')!
  const start = shiftDay(month + '-01', -first.getUTCDay())
  return Array.from({ length: 42 }, (_, index) => shiftDay(start, index))
}
export function temporalDisplay(type: TemporalType, value: string): string {
  if (!value) return ''
  if (type === 'time') return value
  if (type === 'month') return value.slice(5, 7) + '/' + value.slice(0, 4)
  const day = value.slice(0, 10).split('-').reverse().join('/')
  return type === 'datetime-local' ? `${day} ${value.slice(11)}` : day
}
export function parseTemporal(type: TemporalType, text: string): string | null {
  if (!text.trim()) return ''
  const value = text.trim()
  if (type === 'time') return /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value) ? value : null
  if (type === 'month') {
    const match = /^(0[1-9]|1[0-2])\/(\d{4})$/.exec(value)
    return match && Number(match[2]) > 0 ? `${match[2]}-${match[1]}` : null
  }
  const match = /^(\d{2})\/(\d{2})\/(\d{4})(?: ([0-2]\d:[0-5]\d(?::[0-5]\d)?))?$/.exec(value)
  if (!match) return null
  const iso = `${match[3]}-${match[2]}-${match[1]}`
  if (!dateParts(iso)) return null
  if (type === 'date') return match[4] ? null : iso
  return match[4] && parseTemporal('time', match[4]) ? `${iso}T${match[4]}` : null
}
export function withinBounds(value: string, min?: string, max?: string) {
  return (!min || value >= min) && (!max || value <= max)
}
export function temporalStepValid(type: TemporalType, value: string, min?: string, step?: string | number) {
  if (!value || step === 'any') return true
  const unit = Number(step ?? (type === 'time' || type === 'datetime-local' ? 60 : 1))
  if (!Number.isFinite(unit) || unit <= 0) return true
  const number = (text: string) => {
    if (type === 'month') return Number(text.slice(0, 4)) * 12 + Number(text.slice(5, 7)) - 1
    if (type === 'time') { const [h, m, s = 0] = text.split(':').map(Number); return h * 3600 + m * 60 + s }
    return Date.parse(text + (type === 'date' ? 'T00:00:00Z' : 'Z')) / (type === 'date' ? 86400000 : 1000)
  }
  const base = min ? number(min) : type === 'month' ? 1970 * 12 : 0
  const remainder = (number(value) - base) / unit
  return Math.abs(remainder - Math.round(remainder)) < 0.000001
}
