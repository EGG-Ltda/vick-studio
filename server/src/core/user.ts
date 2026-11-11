import { IGenericDatabaseClient } from '@/core/db'
import { ServiceIdentifier } from 'inversify'
import z from 'zod'

export const AppUserSchema = z.object({
  id: z.int().positive(),
  login: z.string().trim().min(1).max(255),
  hashPassword: z.string().optional(),
  email: z.email(),
  role: z.enum(['MASTER', 'ADMIN', 'OPERATIONAL']).default('OPERATIONAL'),
  permissions: z.array(z.string()).default([]),
  isActive: z.boolean(),
  isAdmin: z.boolean().default(false),
  mustChangePassword: z.boolean().default(false),
  passwordVersion: z.int().nonnegative().default(0),
  createdAt: z.date(),
  updatedAt: z.date().nullable(),
  removedAt: z.date().nullable(),
})

export const PasswordSchema = z
  .string()
  .min(8)
  .max(32)
  .refine(
    (password) => Buffer.byteLength(password, 'utf8') <= 72,
    'A senha deve ter no máximo 72 bytes em UTF-8.',
  )

export const TemporaryPasswordSchema = z
  .object({
    password: PasswordSchema,
    confirmPassword: PasswordSchema,
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não conferem.',
    path: ['confirmPassword'],
  })

export const PasswordChangeSchema = z
  .object({
    newPassword: PasswordSchema,
    confirmPassword: PasswordSchema,
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'As senhas não conferem.',
    path: ['confirmPassword'],
  })

export const AssignmentRoleSchema = z.enum([
  'MASTER',
  'ADMIN',
  'OPERATIONAL',
  'DISABLED',
])
export const AppUserCreateSchema = z.object({
  role: AssignmentRoleSchema.default('OPERATIONAL'),
  login: z.string().trim().min(1).max(255),
  email: z.email(),
  password: PasswordSchema,
})

export const AppUserUpdateSchema = z.object({
  role: AssignmentRoleSchema.optional(),
  id: z.int().positive(),
  login: z.string().trim().min(1).max(255),
  email: z.email(),
})

export const USER_PAGE_SIZE = 20
export type PublicAppUser = Omit<
  AppUser,
  'hashPassword' | 'passwordVersion' | 'role'
> & {
  role: 'MASTER' | 'ADMIN' | 'OPERATIONAL' | 'DISABLED'
  assignedRole: 'MASTER' | 'ADMIN' | 'OPERATIONAL'
  isMaster: boolean
  canManagePasswords: boolean
}
export type AppUserPage = { items: PublicAppUser[]; hasNext: boolean }

export type AppUserCreate = z.infer<typeof AppUserCreateSchema>
export type AppUserUpdate = z.infer<typeof AppUserUpdateSchema>
export type AppUser = z.infer<typeof AppUserSchema>

export interface IUserRepository {
  getAll(
    page: number,
    hideDisabled?: boolean,
    operationalOnly?: boolean,
  ): Promise<any>
  getById(id: number): Promise<any>
  getByLoginWithPassword(login: string): Promise<any>
  create(data: AppUserCreate, client: IGenericDatabaseClient): Promise<any>
  update(data: AppUserUpdate, client: IGenericDatabaseClient): Promise<any>
  disable(userId: number, client: IGenericDatabaseClient): Promise<boolean>
  enable(userId: number, client: IGenericDatabaseClient): Promise<boolean>
  replacePassword(
    userId: number,
    expectedVersion: number,
    hash: string,
    mustChangePassword: boolean,
    client: IGenericDatabaseClient,
  ): Promise<AppUser | null>
}

export interface IUserService {
  getAll(
    page: number,
    hideDisabled?: boolean,
    operationalOnly?: boolean,
  ): Promise<AppUserPage>
  getById(id: number): Promise<AppUser>
  getByLoginWithPassword(login: string): Promise<AppUser>
  create(data: AppUserCreate, actor: AppUser): Promise<AppUser>
  update(data: AppUserUpdate, actor: AppUser): Promise<any>
  disable(userId: number, actor: AppUser): Promise<void>
  enable(userId: number, actor: AppUser): Promise<void>
  setTemporaryPassword(
    actor: AppUser,
    userId: number,
    password: string,
  ): Promise<void>
  changeTemporaryPassword(user: AppUser, newPassword: string): Promise<AppUser>
}

export const userRepositoryId: ServiceIdentifier<IUserRepository> =
  Symbol.for('UserRepositoryId')
export const userServiceId: ServiceIdentifier<IUserService> =
  Symbol.for('UserServiceId')
