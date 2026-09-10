import { IGenericDatabaseClient } from '@/core/db'
import { ServiceIdentifier } from 'inversify'
import z from 'zod'

export const AppUserSchema = z.object({
  id: z.number(),
  login: z.string().min(1).max(255),
  hashPassword: z.string().optional(),
  email: z.email(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date().nullable(),
  removedAt: z.date().nullable(),
})

export const AppUserCreateSchema = z.object({
  email: z.email(),
  password: z.string(),
})

export type AppUserCreate = z.infer<typeof AppUserCreateSchema>
export type AppUser = z.infer<typeof AppUserSchema>

export interface IUserRepository {
  getById(id: number): Promise<any>
  getByLoginWithPassword(login: string): Promise<any>
  create(data: AppUserCreate, client: IGenericDatabaseClient): Promise<any>
  update(
    id: number,
    email: string,
    client: IGenericDatabaseClient,
  ): Promise<any>
  delete(id: number, client: IGenericDatabaseClient): Promise<void>
}

export interface IUserService {
  getById(id: number): Promise<AppUser>
  getByLoginWithPassword(login: string): Promise<AppUser>
  create(data: AppUserCreate): Promise<AppUser>
  update(id: number, email: string): Promise<AppUser>
  delete(id: number): Promise<void>
}

export const userServiceId: ServiceIdentifier<IUserService> =
  Symbol.for('UserServiceId')
export const userRepositoryId: ServiceIdentifier<IUserRepository> =
  Symbol.for('UserRepositoryId')
