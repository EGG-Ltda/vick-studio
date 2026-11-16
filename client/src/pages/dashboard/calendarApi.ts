import { apiRequest } from '../../core/api/http'

export type ScheduleStatus =
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export type Schedule = {
  id: number
  scheduleId: number
  customerId: number
  customerName: string
  employeeId: number
  employeeName: string
  treatmentId: number
  treatmentName: string
  startsAt: string
  endsAt: string
  status: ScheduleStatus
}

export type ScheduleOptions = {
  customers: {id:number;name:string}[]
  employees: {id:number;name:string}[]
  treatments: {id:number;name:string;duration:number}[]
}
export function listScheduleOptions() { return apiRequest<ScheduleOptions>('/schedules/options') }

export type CreateScheduleInput = {
  customerId: number
  employeeId: number
  treatmentId: number
  startsAt: string
  endsAt: string
}
type ScheduleResponse = Omit<Schedule, 'treatmentId' | 'treatmentName'> & {
  serviceId: number
  serviceName: string
}

function toSchedule({
  serviceId,
  serviceName,
  ...schedule
}: ScheduleResponse): Schedule {
  return { ...schedule, treatmentId: serviceId, treatmentName: serviceName }
}

export function listSchedules(start: Date, end: Date): Promise<Schedule[]> {
  const params = new URLSearchParams({
    start: start.toISOString(),
    end: end.toISOString(),
  })
  return apiRequest<ScheduleResponse[]>(`/schedules?${params.toString()}`).then(
    (schedules) => schedules.map(toSchedule),
  )
}

export function createSchedule(input: CreateScheduleInput): Promise<Schedule> {
  const { treatmentId, ...schedule } = input
  return apiRequest<ScheduleResponse>('/schedules', {
    method: 'POST',
    body: JSON.stringify({ ...schedule, serviceId: treatmentId }),
  }).then(toSchedule)
}
