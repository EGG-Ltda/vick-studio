import { IGenericDatabaseClient } from '@/core/db'
import { ServiceIdentifier } from 'inversify'
import z from 'zod'

export const AppUserSchema = z.object({
  id: z.int(),
  login: z.string().min(1).max(255),
  hashPassword: z.string().optional(),
  email: z.email(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date().nullable(),
  removedAt: z.date().nullable(),
})

export const AppUserCreateSchema = z.object({
  login: z.string().min(1).max(255),
  email: z.email(),
  password: z.string(),
})

export const AppUserUpdateSchema = z.object({
  id: z.int(),
  login: z.string().min(1).max(255),
  email: z.email(),
})

export type AppUserCreate = z.infer<typeof AppUserCreateSchema>
export type AppUserUpdate = z.infer<typeof AppUserUpdateSchema>
export type AppUser = z.infer<typeof AppUserSchema>

export interface IUserRepository {
  getAll(page: number): Promise<void>
  getById(id: number): Promise<any>
  getByLoginWithPassword(login: string): Promise<any>
  create(data: AppUserCreate, client: IGenericDatabaseClient): Promise<any>
  update(data: AppUserUpdate, client: IGenericDatabaseClient): Promise<any>
  delete(userId: number, client: IGenericDatabaseClient): Promise<void>
}

export interface IUserService {
  getAll(page: number): Promise<AppUser[]>
  getById(id: number): Promise<AppUser>
  getByLoginWithPassword(login: string): Promise<AppUser>
  create(data: AppUserCreate): Promise<AppUser>
  update(data: AppUserUpdate): Promise<any>
  delete(userId: number): Promise<void>
}

export const userRepositoryId: ServiceIdentifier<IUserRepository> =
  Symbol.for('UserRepositoryId')
export const userServiceId: ServiceIdentifier<IUserService> =
  Symbol.for('UserServiceId')
