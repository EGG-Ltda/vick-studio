import z from 'zod'
import { createHash } from 'crypto'
import { allocate } from '../social/schemas'
import type { IGenericDatabaseClient } from '@/core/db'
export function invalid(message: string, statusCode = 400): never {
  throw Object.assign(new Error(message), { statusCode })
}
export const DependencySchema = z
  .object({
    requiredTreatmentId: z.number().int().positive(),
    position: z.enum(['before', 'after']),
    sameDay: z.boolean(),
    consecutive: z.boolean().default(false),
    minMinutes: z.number().int().min(0).max(525600).default(0),
    maxMinutes: z.number().int().min(0).max(525600).nullable().default(null),
  })
  .refine(
    (d) => d.maxMinutes === null || d.maxMinutes >= d.minMinutes,
    'Maximum interval must be at least the minimum',
  )
  .refine(
    (d) =>
      !d.consecutive ||
      (d.minMinutes === 0 && (d.maxMinutes === null || d.maxMinutes === 0)),
    'Consecutive procedures require a zero interval',
  )
export type Dependency = z.infer<typeof DependencySchema>
export const SeparateSchema = z
  .array(
    z.object({
      main: z.string().min(1).max(60),
      requiredTreatmentId: z.number().int().positive(),
    }),
  )
  .max(40)
  .default([])
  .refine(
    (v) =>
      new Set(v.map((x) => `${x.main}:${x.requiredTreatmentId}`)).size ===
      v.length,
    'Duplicate separate procedures',
  )
export const DependenciesSchema = z
  .array(DependencySchema)
  .max(20)
  .refine(
    (d) => new Set(d.map((x) => x.requiredTreatmentId)).size === d.length,
    'Duplicate dependencies',
  )
export const dependencySelect = `SELECT treatment_id AS "treatmentId",required_treatment_id AS "requiredTreatmentId",position,same_day AS "sameDay",consecutive,min_minutes AS "minMinutes",max_minutes AS "maxMinutes" FROM treatment_dependencies ORDER BY treatment_id,required_treatment_id`
export async function saveDependencies(
  c: IGenericDatabaseClient,
  id: number,
  data: Dependency[],
) {
  await c.query('SELECT pg_advisory_xact_lock(70440,1)', [])
  const edges = (await c.query(dependencySelect, [])).rows.filter(
    (d: any) => d.treatmentId !== id,
  )
  for (const d of data) {
    if (d.requiredTreatmentId === id)
      invalid('A service cannot depend on itself.')
    edges.push({ treatmentId: id, ...d })
  }
  const graph = new Map<number, number[]>()
  for (const e of edges)
    graph.set(e.treatmentId, [
      ...(graph.get(e.treatmentId) ?? []),
      e.requiredTreatmentId,
    ])
  const visiting = new Set<number>(),
    done = new Set<number>()
  function visit(n: number) {
    if (visiting.has(n))
      invalid('Circular service dependencies are not allowed.')
    if (done.has(n)) return
    visiting.add(n)
    for (const x of graph.get(n) ?? []) visit(x)
    visiting.delete(n)
    done.add(n)
  }
  for (const n of graph.keys()) visit(n)
  if (
    data.length &&
    (
      await c.query('SELECT id FROM salon_treatments WHERE id=ANY($1::int[])', [
        data.map((d) => d.requiredTreatmentId),
      ])
    ).rows.length !== data.length
  )
    invalid('Required service not found.')
  await c.query('DELETE FROM treatment_dependencies WHERE treatment_id=$1', [
    id,
  ])
  for (const d of data)
    await c.query(
      'INSERT INTO treatment_dependencies(treatment_id,required_treatment_id,position,same_day,consecutive,min_minutes,max_minutes) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [
        id,
        d.requiredTreatmentId,
        d.position,
        d.sameDay,
        d.consecutive,
        d.minMinutes,
        d.maxMinutes,
      ],
    )
}
export type PlanNode = {
  key: string
  treatmentId: number
  name: string
  price: number
  chargedPrice: number
  durationMinutes: number
  included: boolean
  blocked: string | null
}
export type PlanRule = Dependency & {
  main: string
  required: string
  mainName: string
  requiredName: string
}
export type Plan = {
  nodes: PlanNode[]
  rules: PlanRule[]
  signature: string
  promotionId: number | null
  rootIds: number[]
  separate: z.infer<typeof SeparateSchema>
}
export async function makePlan(
  c: IGenericDatabaseClient,
  rootIds: number[],
  promotionId?: number,
  separate: z.infer<typeof SeparateSchema> = [],
): Promise<Plan> {
  let roots = rootIds
  let packagePrice = 0
  if (promotionId) {
    const p = (
      await c.query(
        "SELECT id,price::float AS price FROM promotions WHERE id=$1 AND active AND (now() AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN starts_on AND ends_on",
        [promotionId],
      )
    ).rows[0]
    if (!p) invalid('Promotion is unavailable.', 409)
    packagePrice = p.price
    const items = (
      await c.query(
        'SELECT treatment_id,quantity FROM promotion_items WHERE promotion_id=$1 ORDER BY treatment_id',
        [promotionId],
      )
    ).rows
    roots = items.flatMap((i: any) => Array(i.quantity).fill(i.treatment_id))
  }
  const catalog = (
    await c.query(
      `SELECT t.id,t.name,t.price::float AS price,t.duration_minutes AS "durationMinutes",t.is_active AS active,EXISTS(SELECT 1 FROM employee_salon_treatments et JOIN employees e ON e.id=et.employee_id JOIN app_users u ON u.id=e.user_id WHERE et.treatment_id=t.id AND e.is_active AND u.is_active AND u.removed_at IS NULL AND EXISTS(SELECT 1 FROM employee_booking_hours h WHERE h.employee_id=e.id)) AS available FROM salon_treatments t ORDER BY t.id`,
      [],
    )
  ).rows
  const byId = new Map<number, any>(catalog.map((t: any) => [t.id, t])),
    edges = (await c.query(dependencySelect, [])).rows
  const nodes: PlanNode[] = [],
    rules: PlanRule[] = []
  function add(id: number, key: string, included: boolean) {
    const t = byId.get(id)
    if (!t) invalid('Service not found.', 404)
    const n = {
      key,
      treatmentId: id,
      name: t.name,
      price: t.price,
      chargedPrice: t.price,
      durationMinutes: t.durationMinutes,
      included,
      blocked: !t.active
        ? 'Required service is inactive.'
        : !t.available
          ? 'No qualified professional has working hours for this service.'
          : null,
    }
    nodes.push(n)
    return n
  }
  roots.forEach((id, i) => add(id, `root:${i}`, !!promotionId))
  for (let i = 0; i < nodes.length; i++) {
    if (nodes.length > 40)
      invalid('The dependency set exceeds 40 appointments.')
    const main = nodes[i]
    for (const d of edges.filter(
      (e: any) => e.treatmentId === main.treatmentId,
    )) {
      const split = separate.some(
        (s) =>
          s.main === main.key &&
          s.requiredTreatmentId === d.requiredTreatmentId,
      )
      let required = split
        ? undefined
        : nodes.find(
            (n) =>
              n.treatmentId === d.requiredTreatmentId &&
              n.key !== main.key &&
              !n.key.startsWith('separate:'),
          )
      if (!required)
        required = add(
          d.requiredTreatmentId,
          split
            ? `separate:${i}:${d.requiredTreatmentId}`
            : `required:${d.requiredTreatmentId}`,
          false,
        )
      rules.push({
        ...d,
        main: main.key,
        required: required.key,
        mainName: main.name,
        requiredName: required.name,
      })
    }
  }
  if (
    separate.some(
      (s) =>
        !rules.some(
          (r) =>
            r.main === s.main &&
            r.requiredTreatmentId === s.requiredTreatmentId,
        ),
    )
  )
    invalid('Invalid separate procedure selection.')
  if (promotionId) {
    const included = nodes.filter((n) => n.included),
      prices = allocate(
        Math.round(packagePrice * 100),
        included.map((n) => Math.round(n.price * 100)),
      )
    included.forEach((n, i) => {
      n.chargedPrice = prices[i] / 100
    })
  }
  const payload = {
    nodes,
    rules,
    promotionId: promotionId ?? null,
    rootIds: roots,
    separate,
  }
  return {
    ...payload,
    signature: createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex'),
  }
}
export type Appointment = {
  key: string
  startsAt: string | Date
  endsAt: string | Date
  status?: string
}
const day = (v: string | Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(v))
export function validatePlan(
  plan: Plan,
  appointments: Appointment[],
  allowCancelled = false,
) {
  const map = new Map(appointments.map((a) => [a.key, a]))
  if (
    plan.nodes.some((n) => !map.has(n.key)) ||
    map.size !== plan.nodes.length ||
    appointments.length !== plan.nodes.length
  )
    invalid('Schedule each required procedure exactly once.')
  for (const r of plan.rules) {
    const m = map.get(r.main)!,
      d = map.get(r.required)!
    if (allowCancelled && m.status === 'cancelled' && d.status === 'cancelled')
      continue
    const [before, after] = r.position === 'before' ? [d, m] : [m, d],
      gap =
        (new Date(after.startsAt).getTime() -
          new Date(before.endsAt).getTime()) /
        60000
    if (
      gap < 0 ||
      gap < r.minMinutes ||
      (r.maxMinutes !== null && gap > r.maxMinutes) ||
      (r.consecutive && gap !== 0)
    )
      invalid(
        `Invalid order or interval: ${r.requiredName} ${r.position} ${r.mainName}.`,
        409,
      )
    if (r.sameDay && day(m.startsAt) !== day(d.startsAt))
      invalid(
        `These procedures must be scheduled on the same salon day: ${r.mainName} / ${r.requiredName}.`,
        409,
      )
  }
  const active = appointments.filter((a) => a.status !== 'cancelled')
  for (let i = 0; i < active.length; i++)
    for (let j = i + 1; j < active.length; j++)
      if (
        new Date(active[i].startsAt) < new Date(active[j].endsAt) &&
        new Date(active[j].startsAt) < new Date(active[i].endsAt)
      )
        invalid('Linked appointments for this customer cannot overlap.', 409)
}
export async function assertIndependent(
  c: IGenericDatabaseClient,
  ids: number[],
) {
  if (
    (
      await c.query(
        'SELECT 1 FROM treatment_dependencies WHERE treatment_id=ANY($1::int[]) LIMIT 1',
        [ids],
      )
    ).rows.length
  )
    invalid(
      'This service requires a linked booking. Schedule every mandatory procedure together.',
      409,
    )
}
export async function linkedPlan(
  c: IGenericDatabaseClient,
  scheduleId: number,
) {
  const group = (
    await c.query(
      'SELECT g.* FROM booking_group_members m JOIN booking_groups g ON g.id=m.group_id WHERE m.schedule_id=$1',
      [scheduleId],
    )
  ).rows[0]
  if (!group) return null
  const members = (
    await c.query(
      'SELECT m.node_key AS key,m.schedule_id AS id,s.schedule_started_at AS "startsAt",s.schedule_ended_at AS "endsAt",s.status,(SELECT p.name FROM salon_schedule_treatments st JOIN employees e ON e.id=st.employee_id JOIN persons p ON p.id=e.person_id WHERE st.schedule_id=s.id ORDER BY st.id LIMIT 1) AS "employeeName" FROM booking_group_members m JOIN salon_schedules s ON s.id=m.schedule_id WHERE m.group_id=$1 ORDER BY m.node_key',
      [group.id],
    )
  ).rows
  return { group, members }
}
export async function validateLinkedChange(
  c: IGenericDatabaseClient,
  id: number,
  startsAt: string,
  endsAt: Date,
) {
  const linked = await linkedPlan(c, id)
  if (!linked) return
  const appointments = linked.members.map((m: any) =>
    m.id === id ? { ...m, startsAt, endsAt, status: 'confirmed' } : m,
  )
  validatePlan(linked.group.plan, appointments, true)
}
