import { IDatabaseUnitOfWork, unitOfWorkServiceId } from '@/core/db'
import { hashServiceId, IHashService } from '@/core/hash'
import {
  AppUser,
  AppUserCreate,
  AppUserSchema,
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

  public async getAll(page: number): Promise<AppUser[]> {
    return this.userRepo
      .getAll(page)
      .then((rows) => z.array(AppUserSchema).parse(rows))
  }

  public async getById(id: number): Promise<AppUser> {
    return this.userRepo.getById(id).then((row) => AppUserSchema.parse(row))
  }

  public async getByLoginWithPassword(login: string): Promise<AppUser> {
    return this.userRepo
      .getByLoginWithPassword(login)
      .then((row) => AppUserSchema.parse(row))
  }

  public async create(data: AppUserCreate): Promise<AppUser> {
    return this.work.transaction<AppUser>(async (client) => {
      data.password = await this.hashService.hash(data.password)
      const userObj: any = await this.userRepo.create(data, client)

      return AppUserSchema.parse(userObj)
    })
  }

  public async update(id: number, email: string): Promise<AppUser> {
    return this.work.transaction<AppUser>((client) =>
      this.userRepo
        .update(id, email, client)
        .then((row) => AppUserSchema.parse(row)),
    )
  }

  public async delete(id: number): Promise<void> {
    return this.work.transaction((client) => this.userRepo.delete(id, client))
  }
}
