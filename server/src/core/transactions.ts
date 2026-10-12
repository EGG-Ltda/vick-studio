import { IGenericDatabaseClient } from '@/core/db'
import { ServiceIdentifier } from 'inversify'
import z from 'zod'

export const PaymentMethodSchema = z.object({
  id: z.int(),
  name: z.string().min(1).max(255),
  description: z.string().min(1).max(1023),
  createdAt: z.date(),
  updatedAt: z.date().nullable(),
  removedAt: z.date().nullable(),
})

export const SalonTxTypeSchema = z.object({
  id: z.int(),
  name: z.string().min(1).max(255),
  description: z.string().min(1).max(1023),
  createdAt: z.date(),
  updatedAt: z.date().nullable(),
})

export const SalonTxSchema = z.object({
  id: z.int(),
  methodId: z.int(),
  method: PaymentMethodSchema.optional(),
  typeId: z.int(),
  type: SalonTxTypeSchema.optional(),
  isDebit: z.boolean(),
  description: z.string().min(1).max(1023),
  value: z.number(),
  createdAt: z.date(),
  updatedAt: z.date().nullable(),
})

export const SalonTxCreateSchema = z.object({
  methodId: z.int(),
  typeId: z.int(),
  isDebit: z.int(),
  description: z.string().min(1).max(1023),
  value: z.number(),
})

export type SalonTx = z.infer<typeof SalonTxSchema>
export type SalonTxCreate = z.infer<typeof SalonTxCreateSchema>

export interface ISalonTxRepository {
  getAll(page: number): Promise<any>
  create(data: SalonTxCreate, client: IGenericDatabaseClient): Promise<any>
}

export interface ISalonTxService {
  getAll(page: number): Promise<SalonTx[]>
  create(data: SalonTxCreate): Promise<SalonTx>
}

export const salonTxServiceId: ServiceIdentifier<ISalonTxService> =
  Symbol.for('SalonTxServiceId')
export const salonTxRepositoryId: ServiceIdentifier<ISalonTxRepository> =
  Symbol.for('SalonTxRepositoryId')
