export { bookingRequest as availabilityRequest } from '../booking/bookingApi'
export type WorkingDay = {
  weekday: number
  opensAt: string
  closesAt: string
  lunchStart: string | null
}
export type AbsenceRequest = {
  id: number
  employeeId: number
  employeeName: string
  kind: 'lunch' | 'absence' | 'vacation'
  startsAt: string
  endsAt: string
  baselineLunch: string | null
  reason: string
  status: 'pending' | 'approved' | 'declined' | 'cancelled'
  createdAt: string
  decidedAt: string | null
  decidedBy: string | null
  decisionReason: string | null
  hasConflict: boolean
}
export type RequestPage = {
  items: AbsenceRequest[]
  hasNext: boolean
  pendingCount: number
  canManage: boolean
}
export type AvailabilityBlock = {
  employeeId: number
  employeeName: string
  startsAt: string
  endsAt: string
  kind: AbsenceRequest['kind']
  requestId: number | null
}
export const absenceKind = {
  lunch: 'Alteração de almoço',
  absence: 'Ausência pontual',
  vacation: 'Férias',
}
export const absenceStatus = {
  pending: 'Aguardando aprovação',
  approved: 'Aprovada',
  declined: 'Recusada',
  cancelled: 'Cancelada',
}
export const endOfLunch = (value: string) => {
  if (!/^\d{2}:\d{2}/.test(value)) return ''
  const [h, m] = value.split(':').map(Number)
  return h >= 23
    ? 'Fora do expediente'
    : `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
