import { MASTER_USER_ID } from '@/core/config'
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
import { canManagePasswords, publicUser } from '@/shared/utils/user'

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

  public async getAll(
    page: number,
    hideDisabled = false,
  ): Promise<AppUserPage> {
    return this.userRepo.getAll(page, hideDisabled).then((rows) => ({
      items: z
        .array(AppUserSchema)
        .parse(rows.slice(0, USER_PAGE_SIZE))
        .map(publicUser),
      hasNext: rows.length > USER_PAGE_SIZE,
    }))
  }

  public async getById(id: number): Promise<AppUser> {
    return this.userRepo
      .getById(id)
      .then((row) => (row ? AppUserSchema.parse(row) : null))
  }

  public async getByLoginWithPassword(login: string): Promise<AppUser> {
    return this.userRepo
      .getByLoginWithPassword(login)
      .then((row) => (row ? AppUserSchema.parse(row) : null))
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
      .then((row) => (row ? AppUserSchema.parse(row) : null))
  }

  public async disable(userId: number): Promise<void> {
    if (userId === MASTER_USER_ID) {
      throw Object.assign(
        new Error('The master administrator cannot be disabled.'),
        { statusCode: 403 },
      )
    }
    const found = await this.work.transaction((client) =>
      this.userRepo.disable(userId, client),
    )
    if (!found)
      throw Object.assign(new Error('User not found'), { statusCode: 404 })
  }
  public async enable(userId: number): Promise<void> {
    const found = await this.work.transaction((client) =>
      this.userRepo.enable(userId, client),
    )
    if (!found)
      throw Object.assign(new Error('User not found'), { statusCode: 404 })
  }

  public async setTemporaryPassword(
    actor: AppUser,
    userId: number,
    password: string,
  ): Promise<void> {
    if (!canManagePasswords(actor) || actor.mustChangePassword) {
      throw Object.assign(
        new Error('Apenas ADMIN ou MASTER pode redefinir senhas.'),
        { statusCode: 403 },
      )
    }
    const target = await this.getById(userId)
    if (!target)
      throw Object.assign(new Error('Usuário não encontrado.'), {
        statusCode: 404,
      })
    if (actor.id === target.id) {
      throw Object.assign(
        new Error(
          'Você não pode definir uma senha temporária para sua própria conta.',
        ),
        { statusCode: 409 },
      )
    }
    if (
      actor.id !== MASTER_USER_ID &&
      (target.id === MASTER_USER_ID || target.isAdmin)
    ) {
      throw Object.assign(
        new Error('Somente o MASTER pode redefinir senhas de administradores.'),
        { statusCode: 403 },
      )
    }
    if (!target.isActive || target.removedAt) {
      throw Object.assign(
        new Error('Reabilite o usuário antes de redefinir sua senha.'),
        { statusCode: 409 },
      )
    }
    if (await this.hashService.compare(password, target.hashPassword)) {
      throw Object.assign(
        new Error('A senha temporária deve ser diferente da senha atual.'),
        { statusCode: 400 },
      )
    }
    const hash = await this.hashService.hash(password)
    const updated = await this.work.transaction((client) =>
      this.userRepo.replacePassword(
        userId,
        target.passwordVersion,
        hash,
        true,
        client,
      ),
    )
    if (!updated)
      throw Object.assign(
        new Error(
          'O cadastro foi alterado. Atualize a página e tente novamente.',
        ),
        { statusCode: 409 },
      )
  }

  public async changeTemporaryPassword(
    user: AppUser,
    newPassword: string,
  ): Promise<AppUser> {
    if (!user.mustChangePassword) {
      throw Object.assign(
        new Error('Sua conta não possui troca de senha pendente.'),
        { statusCode: 409 },
      )
    }
    if (await this.hashService.compare(newPassword, user.hashPassword)) {
      throw Object.assign(
        new Error('Escolha uma senha diferente da senha temporária.'),
        { statusCode: 400 },
      )
    }
    const hash = await this.hashService.hash(newPassword)
    const updated = await this.work.transaction((client) =>
      this.userRepo.replacePassword(
        user.id,
        user.passwordVersion,
        hash,
        false,
        client,
      ),
    )
    if (!updated)
      throw Object.assign(
        new Error('A senha foi alterada em outra sessão. Entre novamente.'),
        { statusCode: 409 },
      )
    return updated
  }
}
