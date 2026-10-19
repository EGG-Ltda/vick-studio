import { authServiceId } from '@/core/auth'
import { databaseServiceId, unitOfWorkServiceId } from '@/core/db'
import { hashServiceId } from '@/core/hash'
import { jwtServiceId } from '@/core/jwt'
import { scheduleRepositoryId, scheduleServiceId } from '@/core/schedule'
import { salonTxRepositoryId, salonTxServiceId } from '@/core/transactions'
import { treatmentRepositoryId, treatmentServiceId } from '@/core/treatment'
import { userRepositoryId, userServiceId } from '@/core/user'
import {
  PostgresService,
  PostgresUnitOfWork,
} from '@/infra/db/postgres/service'
import { BcryptService } from '@/infra/hash/bcrypt/service'
import { JwtService } from '@/infra/jwt/default/service'
import { AuthService } from '@/modules/auth/service'
import { ScheduleRepository } from '@/modules/schedule/repository'
import { ScheduleService } from '@/modules/schedule/service'
import { SalonTxRepository } from '@/modules/transactions/repository'
import { SalonTxService } from '@/modules/transactions/service'
import { TreatmentRepository } from '@/modules/treatment/repository'
import { TreatmentService } from '@/modules/treatment/service'
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

// Schedule
container.bind(scheduleRepositoryId).to(ScheduleRepository).inSingletonScope()
container.bind(scheduleServiceId).to(ScheduleService).inSingletonScope()

// Salon Transactions
container.bind(salonTxRepositoryId).to(SalonTxRepository).inSingletonScope()
container.bind(salonTxServiceId).to(SalonTxService).inSingletonScope()

// Treatments
container.bind(treatmentRepositoryId).to(TreatmentRepository).inSingletonScope()
container.bind(treatmentServiceId).to(TreatmentService).inSingletonScope()

export default container
