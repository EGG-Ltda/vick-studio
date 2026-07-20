import { authServiceId } from '@/core/auth'
import { databaseServiceId, unitOfWorkServiceId } from '@/core/db'
import { hashServiceId } from '@/core/hash'
import { jwtServiceId } from '@/core/jwt'
import { userRepositoryId, userServiceId } from '@/core/user'
import {
  PostgresService,
  PostgresUnitOfWork,
} from '@/infra/db/postgres/service'
import { BcryptService } from '@/infra/hash/bcrypt/service'
import { JwtService } from '@/infra/jwt/default/service'
import { AuthService } from '@/modules/auth/service'
import { UserRepository } from '@/modules/user/repository'
import { UserService } from '@/modules/user/service'
import { Container } from 'inversify'

const container = new Container()

// Infra
container.bind(databaseServiceId).to(PostgresService).inSingletonScope()
container.bind(unitOfWorkServiceId).to(PostgresUnitOfWork).inSingletonScope()
container.bind(hashServiceId).to(BcryptService).inSingletonScope()
container.bind(jwtServiceId).to(JwtService).inSingletonScope()

// Auth
container.bind(authServiceId).to(AuthService).inSingletonScope()

// User
container.bind(userRepositoryId).to(UserRepository).inSingletonScope()
container.bind(userServiceId).to(UserService).inSingletonScope()

export default container
