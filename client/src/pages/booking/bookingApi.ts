export type BookingSettings = {
  shortNoticeHours: number
  enabled: boolean
  depositDays: number
  depositType: 'fixed' | 'percent'
  depositValue: number
  paymentInstructions: string
  timezone: string
}
export type BookingTreatment = {
  id: number
  name: string
  description: string
  price: number
  durationMinutes: number
}
export type BookingEmployee = {
  id: number
  name: string
  treatmentIds: number[]
  hours: { weekday: number; opensAt: string; closesAt: string }[]
}
export type BookingCatalog = {
  settings: BookingSettings
  treatments: BookingTreatment[]
  employees: BookingEmployee[]
}
export type CustomerSession = {
  id: number
  customerId: number
  name: string
  email: string
  phone: string
}
export type BookingSlot = {
  shortNotice: boolean
  shortNoticeHours: number
  startsAt: string
  endsAt: string
  total: number
  deposit: number
  duration: number
  deadline: string
  instructions: string
}
export type BookingOrder = {
  id: number
  customerName: string
  employeeName: string
  startsAt: string
  endsAt: string
  status: string
  totalPrice: number
  depositRequired: number
  depositReceived: number | null
  depositDueAt: string
  depositConfirmedAt: string | null
  depositConfirmedBy: string | null
  paymentInstructions: string
  cancelledAt: string | null
  cancellationReason: string | null
  treatments: { id: number; name: string; price: number }[]
  canConfirmDeposit?: boolean
}
// Customer authentication errors must never expire the independent salon session.
export async function bookingRequest<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
      ...options?.headers,
    },
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success)
    throw new Error(
      payload?.message ?? 'Unable to complete the request. Please try again.',
    )
  return payload.data
}
export const money = (amount: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    amount ?? 0,
  )
export const bookingDate = (date: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(date))
export const bookingStatus = (status: string) =>
  ({
    awaiting_deposit: 'Aguardando sinal',
    confirmed: 'Confirmado',
    cancelled: 'Cancelado',
    in_progress: 'Em atendimento',
    completed: 'Concluído',
    scheduled: 'Agendado',
  })[status] ?? status
export const cancellationText = (reason: string | null) =>
  reason === 'Deposit was not confirmed by the deadline.'
    ? 'O sinal não foi confirmado pela equipe até o prazo limite. O horário foi liberado para outro agendamento.'
    : reason
