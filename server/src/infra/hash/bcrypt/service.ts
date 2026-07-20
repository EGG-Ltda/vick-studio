import { IHashService } from '@/core/hash'
import bcrypt from 'bcryptjs'
import { injectable } from 'inversify'

const SALT_ROUNDS: number = 10

@injectable()
export class BcryptService implements IHashService {
  public async hash(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS)
  }

  public async compare(password: string, hashed: string): Promise<boolean> {
    return bcrypt.compare(password, hashed)
  }
}
