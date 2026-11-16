import { IGenericDatabaseClient } from '@/core/db'
import { ServiceIdentifier } from 'inversify'
import z from 'zod'

export const ScheduleStatusSchema = z.enum([
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
])

export const ScheduleCreateSchema = z.object({
  customerId: z.number().int().positive(),
  employeeId: z.number().int().positive(),
  serviceId: z.number().int().positive(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
})

export const ScheduleSchema = z.object({
  id: z.number(),
  scheduleId: z.number(),
  customerId: z.number(),
  customerName: z.string(),
  employeeId: z.number(),
  employeeName: z.string(),
  serviceId: z.number(),
  serviceName: z.string(),
  startsAt: z.date(),
  endsAt: z.date(),
  status: ScheduleStatusSchema,
})

export type ScheduleCreate = z.infer<typeof ScheduleCreateSchema>
export type Schedule = z.infer<typeof ScheduleSchema>

export interface IScheduleRepository {
  options(): Promise<ScheduleOptions>
  list(
    start: Date,
    end: Date,
    client?: IGenericDatabaseClient,
  ): Promise<Schedule[]>
  create(
    data: ScheduleCreate,
    client: IGenericDatabaseClient,
  ): Promise<Schedule>
}

export interface IScheduleService {
  options(): Promise<ScheduleOptions>
  list(start: Date, end: Date): Promise<Schedule[]>
  create(data: ScheduleCreate): Promise<Schedule>
}

export type ScheduleOptions = {
  employees: {id:number;name:string}[]
  customers: {id:number;name:string}[]
  treatments: {id:number;name:string;duration:number}[]
}

export const scheduleRepositoryId: ServiceIdentifier<IScheduleRepository> =
  Symbol.for('ScheduleRepositoryId')
export const scheduleServiceId: ServiceIdentifier<IScheduleService> =
  Symbol.for('ScheduleServiceId')
