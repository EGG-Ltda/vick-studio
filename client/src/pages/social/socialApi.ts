export type Promotion = {
  id: number
  title: string
  description: string
  conditions: string
  artId: number
  altText: string
  startsOn: string
  endsOn: string
  active: boolean
  price: number
  items: {
    treatmentId: number
    quantity: number
    name: string
    durationMinutes: number
    price: number
  }[]
}
export type PackageUse = {
  id: number
  scheduleId: number
  name: string
  price: number
  state: string
  status: string
  startsAt: string
  endsAt: string
  employeeId: number
  employeeName: string
}
export type PackagePurchase = {
  id: number
  title: string
  conditions: string | null
  price: number | null
  acquiredAt: string
  validUntil: string
  expired: boolean
  totalPaid: number | null
  uses: PackageUse[]
  receipts:
    | {
        id: number
        kind: string
        amount: number
        description: string
        createdAt: string
        refundOf: number | null
        method: string
      }[]
    | null
}
export const packageUseLabel = (state: string) =>
  ({
    reserved: 'Agendado',
    completed: 'Realizado',
    available: 'Disponível para remarcar',
    cancelled: 'Cancelado · utilização retida',
    no_show: 'Falta · utilização retida',
    expired: 'Vencido e não realizado',
  })[state] ?? state
export const dateOnly = (date: string) => date.split('-').reverse().join('/')
