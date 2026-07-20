import { ServiceIdentifier } from 'inversify'

export interface IHashService {
  hash(password: string): Promise<string>
  compare(password: string, hashed: string): Promise<boolean>
}

export const hashServiceId: ServiceIdentifier<IHashService> =
  Symbol.for('HashServiceId')
