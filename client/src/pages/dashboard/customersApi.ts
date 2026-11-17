import { bookingRequest } from '../booking/bookingApi'
export { bookingRequest as customerRequest }
export type Customer = {
  id: number
  name: string
  birthDate: string | null
  cpf: string
  email: string | null
  phone: string | null
  createdAt: string
}
export type CustomerDetail = Customer & {
  canViewFinancial: boolean
  totalPaid: number | null
  lastCompletedAt: string | null
  completedCount: number
  upcomingCount: number
  canEdit: boolean
  canReadInternalNotes: boolean
  historyScope: 'all' | 'assigned'
}
export type Page<T> = {
  items: T[]
  page: number
  total: number
  hasNext: boolean
}
export type CustomerAppointment = {
  groupId?: number | null
  id: number
  status: string
  startsAt: string
  endsAt: string
  completedAt: string | null
  cancelledAt: string | null
  cancellationReason: string | null
  treatmentTotal: number
  extrasTotal: number
  netPaid: number | null
  treatments: {
    name: string
    price: number
    employeeName: string
    employeeId: number
  }[]
}
export type CustomerPayment = {
  id: number
  orderId: number
  kind: 'deposit' | 'payment' | 'refund'
  amount: number
  description: string
  createdAt: string
  method: string
  refundOf: number | null
}
export type InternalNote = {
  id: number
  body: string
  createdAt: string
  author: string | null
}
