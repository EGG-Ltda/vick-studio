import { apiRequest } from '../../core/api/http'

export type ScheduleStatus =
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export type Schedule = {
  id: number
  customerId: number
  customerName: string
  employeeId: number
  employeeName: string
  serviceId: number
  serviceName: string
  startsAt: string
  endsAt: string
  status: ScheduleStatus
}

export type CreateScheduleInput = {
  customerId: number
  employeeId: number
  serviceId: number
  startsAt: string
  endsAt: string
}

export function listSchedules(start: Date, end: Date): Promise<Schedule[]> {
  const params = new URLSearchParams({
    start: start.toISOString(),
    end: end.toISOString(),
  })
  return apiRequest<Schedule[]>(`/schedules?${params.toString()}`)
}

export function createSchedule(input: CreateScheduleInput): Promise<Schedule> {
  return apiRequest<Schedule>('/schedules', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
