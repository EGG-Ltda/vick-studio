import { IGenericDatabaseClient } from '@/core/db'
import { ServiceIdentifier } from 'inversify'
import z from 'zod'

export const TreatmentSchema = z.object({
  id: z.int(),
  name: z.string().min(1).max(255),
  description: z.string().min(1).max(1023),
  price: z.number().positive(),
  durationMinutes: z.uint32(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date().nullable(),
})

export const TreatmentCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().min(1).max(1023),
  price: z.number().positive(),
  durationMinutes: z.uint32(),
})

export const TreatmentUpdateSchema = z.object({
  id: z.int(),
  name: z.string().min(1).max(255),
  description: z.string().min(1).max(1023),
  price: z.number().positive(),
  durationMinutes: z.uint32(),
  isActive: z.boolean(),
})

export type Treatment = z.infer<typeof TreatmentSchema>
export type TreatmentCreate = z.infer<typeof TreatmentCreateSchema>
export type TreatmentUpdate = z.infer<typeof TreatmentUpdateSchema>

export interface ITreatmentRepository {
  getAll(page: number): Promise<any>
  create(data: TreatmentCreate, client: IGenericDatabaseClient): Promise<any>
  update(data: TreatmentUpdate, client: IGenericDatabaseClient): Promise<any>
}

export interface ITreatmentService {
  getAll(page: number): Promise<any>
  create(data: TreatmentCreate): Promise<any>
  update(data: TreatmentUpdate): Promise<any>
}

export const TreatmentRepositoryId: ServiceIdentifier<ITreatmentRepository> =
  Symbol.for('TreatmentRepositoryId')
export const TreatmentServiceId: ServiceIdentifier<ITreatmentService> =
  Symbol.for('TreatmentServiceId')
