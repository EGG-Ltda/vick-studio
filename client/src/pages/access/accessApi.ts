import { apiRequest } from '../../core/api/http'
export type Capability = {
  key: string
  group: string
  label: string
  operational: boolean
  requires: string[]
}
export type Grant = {
  key: string
  allowed: boolean
  delegatable: boolean
  editable?: boolean
}
export type Policy = {
  role: 'ADMIN' | 'OPERATIONAL'
  version: number
  permissions: Grant[]
}
export type IndividualAccess = {
  catalog: Capability[]
  user: { id: number; login: string; role: string }
  profileVersion: number
  permissions: Grant[]
  overrides: { key: string; allowed: boolean }[]
  effective: string[]
}
export { apiRequest as accessRequest }
