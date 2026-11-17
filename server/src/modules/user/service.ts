import { AccessService } from '../access/service'
import { databaseServiceId, IDatabaseService } from '@/core/db'
import { isMaster, requireFreshMaster } from '@/core/access'
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
    @inject(databaseServiceId) private readonly db: IDatabaseService,
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
    operationalOnly = false,
  ): Promise<AppUserPage> {
    return this.userRepo
      .getAll(page, hideDisabled, operationalOnly)
      .then((rows) => ({
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
      .then((row) =>
        row
          ? new AccessService(this.db).hydrate(AppUserSchema.parse(row))
          : null,
      )
  }

  public async getByLoginWithPassword(login: string): Promise<AppUser> {
    return this.userRepo
      .getByLoginWithPassword(login)
      .then((row) =>
        row
          ? new AccessService(this.db).hydrate(AppUserSchema.parse(row))
          : null,
      )
  }

  private requireMaster(actor: AppUser) {
    if (!isMaster(actor))
      throw Object.assign(
        new Error('Only MASTER can create users or change assigned profiles.'),
        { statusCode: 403 },
      )
  }
  private async protectMaster(
    client: import('@/core/db').IGenericDatabaseClient,
    id: number,
    role: string,
    active: boolean,
  ) {
    if (id === MASTER_USER_ID && (!active || role !== 'MASTER'))
      throw Object.assign(
        new Error('The bootstrap MASTER cannot be disabled or demoted.'),
        { statusCode: 403 },
      )
    const current = (
      await client.query('SELECT role FROM app_users WHERE id=$1 FOR UPDATE', [
        id,
      ])
    ).rows[0]
    if (!current)
      throw Object.assign(new Error('User not found.'), { statusCode: 404 })
    if (current.role === 'MASTER' && (!active || role !== 'MASTER')) {
      const count = (
        await client.query(
          `SELECT count(*)::int AS count FROM app_users WHERE id<>$1 AND is_active AND removed_at IS NULL AND (role='MASTER' OR id=$2)`,
          [id, MASTER_USER_ID],
        )
      ).rows[0].count
      if (!count)
        throw Object.assign(
          new Error('The last active MASTER must be preserved.'),
          { statusCode: 409 },
        )
    }
  }
  public async create(data: AppUserCreate, actor: AppUser): Promise<AppUser> {
    this.requireMaster(actor)
    const password = await this.hashService.hash(data.password)
    const result = await this.work.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(70430,1)', [])
      await requireFreshMaster(client, actor)
      const row = await this.userRepo.create({ ...data, password }, client)
      await client.query(
        `INSERT INTO access_audit(actor_id,target_user_id,action,previous_data,current_data) VALUES($1,$2,'create_user','{}',$3)`,
        [
          actor.id,
          row.id,
          JSON.stringify({ role: data.role, login: data.login }),
        ],
      )
      return AppUserSchema.parse(row)
    })
    return new AccessService(this.db).hydrate(result)
  }
  public async update(data: AppUserUpdate, actor: AppUser): Promise<AppUser> {
    this.requireMaster(actor)
    const row = await this.work.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(70430,1)', [])
      await requireFreshMaster(client, actor)
      const old = (
        await client.query(
          'SELECT id,role,is_active,login,email FROM app_users WHERE id=$1 FOR UPDATE',
          [data.id],
        )
      ).rows[0]
      if (!old)
        throw Object.assign(new Error('User not found.'), { statusCode: 404 })
      const role =
        data.id === MASTER_USER_ID
          ? 'MASTER'
          : data.role && data.role !== 'DISABLED'
            ? data.role
            : old.role
      const active = data.role ? data.role !== 'DISABLED' : old.is_active
      if (data.id === MASTER_USER_ID && data.role && data.role !== 'MASTER')
        throw Object.assign(
          new Error('The bootstrap MASTER profile cannot be changed.'),
          { statusCode: 403 },
        )
      await this.protectMaster(client, data.id, role, active)
      await client.query(
        `UPDATE app_users SET role=$2,is_active=$3,removed_at=CASE WHEN $3 THEN NULL ELSE COALESCE(removed_at,now()) END,password_version=password_version+CASE WHEN role<>$2 OR is_active<>$3 THEN 1 ELSE 0 END WHERE id=$1`,
        [data.id, role, active],
      )
      if (role !== old.role)
        await client.query(
          'DELETE FROM user_permission_overrides WHERE user_id=$1',
          [data.id],
        )
      const updated = await this.userRepo.update(data, client)
      await client.query(
        `INSERT INTO access_audit(actor_id,target_user_id,action,previous_data,current_data) VALUES($1,$2,'update_user_profile',$3,$4)`,
        [
          actor.id,
          data.id,
          JSON.stringify(old),
          JSON.stringify({
            login: data.login,
            email: data.email,
            role,
            active,
          }),
        ],
      )
      return AppUserSchema.parse(updated)
    })
    return new AccessService(this.db).hydrate(row)
  }
  private async status(userId: number, actor: AppUser, active: boolean) {
    this.requireMaster(actor)
    await this.work.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(70430,1)', [])
      await requireFreshMaster(client, actor)
      const old = (
        await client.query(
          'SELECT role,is_active FROM app_users WHERE id=$1 FOR UPDATE',
          [userId],
        )
      ).rows[0]
      if (!old)
        throw Object.assign(new Error('User not found.'), { statusCode: 404 })
      await this.protectMaster(
        client,
        userId,
        userId === MASTER_USER_ID ? 'MASTER' : old.role,
        active,
      )
      await client.query(
        'UPDATE app_users SET password_version=password_version+1 WHERE id=$1',
        [userId],
      )
      if (active) await this.userRepo.enable(userId, client)
      else await this.userRepo.disable(userId, client)
      await client.query(
        `INSERT INTO access_audit(actor_id,target_user_id,action,previous_data,current_data) VALUES($1,$2,'user_status',$3,$4)`,
        [actor.id, userId, JSON.stringify(old), JSON.stringify({ active })],
      )
    })
  }
  public disable(userId: number, actor: AppUser) {
    return this.status(userId, actor, false)
  }
  public enable(userId: number, actor: AppUser) {
    return this.status(userId, actor, true)
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
    if (!isMaster(actor) && (isMaster(target) || target.role === 'ADMIN')) {
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
    return new AccessService(this.db).hydrate(updated)
  }
}
