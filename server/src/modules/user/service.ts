import { IDatabaseUnitOfWork, unitOfWorkServiceId } from '@/core/db'
import { hashServiceId, IHashService } from '@/core/hash'
import {
  AppUser,
  AppUserPage,
  USER_PAGE_SIZE,
  AppUserCreate,
  AppUserSchema,
  AppUserUpdate,
  IUserRepository,
  IUserService,
  userRepositoryId,
} from '@/core/user'
import { inject, injectable } from 'inversify'
import z from 'zod'

@injectable()
export class UserService implements IUserService {
  public constructor(
    @inject(unitOfWorkServiceId)
    private readonly work: IDatabaseUnitOfWork,
    @inject(userRepositoryId)
    private readonly userRepo: IUserRepository,
    @inject(hashServiceId)
    private readonly hashService: IHashService,
  ) {}

  public async getAll(page: number, hideDisabled = false): Promise<AppUserPage> {
    return this.userRepo
      .getAll(page, hideDisabled)
      .then((rows) => ({ items: z.array(AppUserSchema).parse(rows.slice(0, USER_PAGE_SIZE)), hasNext: rows.length > USER_PAGE_SIZE }))
  }

  public async getById(id: number): Promise<AppUser> {
    return this.userRepo.getById(id).then((row) => row ? AppUserSchema.parse(row) : null)
  }

  public async getByLoginWithPassword(login: string): Promise<AppUser> {
    return this.userRepo
      .getByLoginWithPassword(login)
      .then((row) => row ? AppUserSchema.parse(row) : null)
  }

  public async create(data: AppUserCreate): Promise<AppUser> {
    data.password = await this.hashService.hash(data.password)

    return this.work
      .transaction(async (client) => this.userRepo.create(data, client))
      .then((result) => AppUserSchema.parse(result))
  }

  public async update(data: AppUserUpdate): Promise<AppUser> {
    return this.work
      .transaction((client) => this.userRepo.update(data, client))
      .then((row) => row ? AppUserSchema.parse(row) : null)
  }

  public async delete(userId: number): Promise<void> {
    const found = await this.work.transaction((client) => this.userRepo.delete(userId, client))
    if (!found) throw Object.assign(new Error('Usuário não encontrado.'), { statusCode: 404 })
  }
  public async restore(userId: number): Promise<void> {
    const found = await this.work.transaction((client) => this.userRepo.restore(userId, client))
    if (!found) throw Object.assign(new Error('Usuário não encontrado.'), { statusCode: 404 })
  }
}
