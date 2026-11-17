export const DEFAULT_CALENDAR_COLOR = '#A51545'
export const CALENDAR_PALETTE = [
  '#A51545',
  '#8B5CF6',
  '#2563EB',
  '#087F8C',
  '#15803D',
  '#A16207',
  '#C2410C',
  '#475569',
]

export function normalizeCalendarColor(value?: string): string {
  return value && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toUpperCase()
    : DEFAULT_CALENDAR_COLOR
}

export function calendarForeground(value?: string): '#000000' | '#FFFFFF' {
  const color = normalizeCalendarColor(value)
  const channels = [1, 3, 5].map((offset) => {
    const channel = parseInt(color.slice(offset, offset + 2), 16) / 255
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  })
  const luminance =
    channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05)
    ? '#000000'
    : '#FFFFFF'
}

export function calendarStyle(value?: string) {
  return {
    '--employee-color': normalizeCalendarColor(value),
    '--employee-foreground': calendarForeground(value),
  }
}
