import { IGenericDatabaseClient } from '@/core/db'
import { ServiceIdentifier } from 'inversify'
import z from 'zod'

export const ScheduleStatusSchema = z.enum([
  'scheduled',
  'awaiting_deposit',
  'confirmed',
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
  customerId: z.number(),
  customerName: z.string(),
  employeeId: z.number(),
  employeeUserId: z.number(),
  employeeName: z.string(),
  serviceId: z.number(),
  serviceName: z.string(),
  startsAt: z.date(),
  endsAt: z.date(),
  status: ScheduleStatusSchema,
  depositDueAt: z.date().nullable().optional(),
  depositRequired: z.number().nullable().optional(),
  depositConfirmedAt: z.date().nullable().optional(),
  cancellationReason: z.string().nullable().optional(),
})

export type ScheduleCreate = z.infer<typeof ScheduleCreateSchema>
export type Schedule = z.infer<typeof ScheduleSchema>

export interface IScheduleRepository {
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
  list(start: Date, end: Date): Promise<Schedule[]>
  create(data: ScheduleCreate): Promise<Schedule>
}

export const scheduleRepositoryId: ServiceIdentifier<IScheduleRepository> =
  Symbol.for('ScheduleRepositoryId')
export const scheduleServiceId: ServiceIdentifier<IScheduleService> =
  Symbol.for('ScheduleServiceId')
