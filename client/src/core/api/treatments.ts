import { apiRequest } from './http'

export type PublicTreatment = {
  id: number
  name: string
  description: string
  price: number
  durationMinutes: number
}
export type Dependency = {
  requiredTreatmentId: number
  position: 'before' | 'after'
  sameDay: boolean
  consecutive: boolean
  minMinutes: number
  maxMinutes: number | null
}
export type Treatment = PublicTreatment & {
  isActive: boolean
  dependencies?: Dependency[]
}

export function listTreatments(
  publicCatalog: true,
  signal?: AbortSignal,
): Promise<PublicTreatment[]>
export function listTreatments(
  publicCatalog?: false,
  signal?: AbortSignal,
): Promise<Treatment[]>
export async function listTreatments(
  publicCatalog = false,
  signal?: AbortSignal,
) {
  const treatments: PublicTreatment[] = []
  let page = 0
  let batch: PublicTreatment[]
  do {
    batch = await apiRequest<PublicTreatment[]>(
      `${publicCatalog ? '/public/treatments' : '/treatments'}?page=${page}`,
      { signal, cache: 'no-store' },
    )
    treatments.push(...batch)
    page += 1
  } while (batch.length === 20)
  return treatments
}

export function saveTreatment(data: Omit<Treatment, 'id'>, id?: number) {
  return apiRequest<Treatment>(
    id === undefined ? '/treatments' : `/treatments/${id}`,
    {
      method: id === undefined ? 'POST' : 'PUT',
      body: JSON.stringify(data),
    },
  )
}
