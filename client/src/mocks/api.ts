import {
  createFixtures,
  catalog,
  masterKeys,
  demoPassword,
  today,
  day,
} from './fixtures.ts'
import type { Row } from './fixtures.ts'
let state = createFixtures()
const retries = new Map<string, unknown>()
const sessionKey = 'vick.demo.salon',
  customerKey = 'vick.demo.customer'
const current = () =>
  state.users.find((u) => u.id === Number(sessionStorage.getItem(sessionKey)))
const customer = () =>
  state.customers.find(
    (c) => c.id === Number(sessionStorage.getItem(customerKey)),
  )
function fail(message: string): never {
  throw Error(message)
}
const idOf = (rows: Row[]) => Math.max(0, ...rows.map((r) => Number(r.id))) + 1
const wide = () => ['MASTER', 'ADMIN'].includes(current()?.role)
const ownEmployee = () =>
  state.employees.find((e) => e.userId === current()?.id)?.id
const page = (rows: Row[], p: number, size = 20) => ({
  items: rows.slice(p * size, (p + 1) * size),
  page: p,
  total: rows.length,
  hasNext: (p + 1) * size < rows.length,
})
const permissions = (u: Row): string[] => {
  if (!u.isActive) return []
  if (u.role === 'MASTER') return [...catalog.map((c) => c.key), ...masterKeys]
  const p = state.profiles.find((p) => p.role === u.role)!,
    overrides = state.overrides[u.id] ?? []
  return p.permissions
    .filter(
      (g: Row) =>
        (g.allowed || g.delegatable) &&
        (overrides.find((o) => o.key === g.key)?.allowed ?? g.allowed),
    )
    .map((g: Row) => g.key)
}
function userView(u: Row) {
  u.isMaster = u.role === 'MASTER'
  u.isAdmin = u.role === 'MASTER' || u.role === 'ADMIN'
  return {
    ...u,
    role: u.isActive ? u.role : 'DISABLED',
    permissions: permissions(u),
    canManagePasswords: permissions(u).includes('users.passwords'),
    canResetPassword:
      current()?.id !== u.id &&
      (current()?.isMaster || u.role === 'OPERATIONAL'),
    canConfigurePermissions:
      current()?.id !== u.id &&
      (current()?.isMaster || u.role === 'OPERATIONAL'),
  }
}
function scopedOrders() {
  return state.orders.filter((o) => wide() || o.employeeId === ownEmployee())
}
function orderView(o: Row) {
  return {
    ...o,
    customerName:
      state.customers.find((c) => c.id === o.customerId)?.name ??
      'Cliente · demonstração',
    employeeName:
      state.employees.find((e) => e.id === o.employeeId)?.name ??
      'Profissional · demonstração',
    canConfirmDeposit: true,
    readOnlyShared: false,
  }
}
function getOrder(id: number) {
  const o = scopedOrders().find((o) => o.id === id)
  if (!o) fail('Mock: atendimento não disponível para este perfil.')
  return o
}
function plan(rootIds: number[], promotionId?: number, separate: Row[] = []) {
  const promotion = state.promotions.find((p) => p.id === promotionId),
    roots = promotion
      ? promotion.items.flatMap((i: Row) =>
          Array(i.quantity).fill(i.treatmentId),
        )
      : rootIds,
    nodes: Row[] = [],
    rules: Row[] = []
  const add = (id: number, key: string, included: boolean) => {
    const t = state.treatments.find((t) => t.id === id)
    if (!t) fail('Mock: serviço não encontrado.')
    const n = {
      key,
      treatmentId: id,
      name: t.name,
      price: t.price,
      chargedPrice: t.price,
      durationMinutes: t.durationMinutes,
      included,
      blocked: !t.isActive
        ? 'Required service is inactive.'
        : !state.employees.some((e) => e.active && e.treatmentIds.includes(id))
          ? 'No qualified professional has working hours for this service.'
          : null,
    }
    nodes.push(n)
    return n
  }
  roots.forEach((id: number, i: number) => add(id, `root:${i}`, !!promotion))
  for (let i = 0; i < nodes.length; i++) {
    if (nodes.length > 40) fail('Mock: conjunto limitado a 40 atendimentos.')
    const main = nodes[i],
      t = state.treatments.find((t) => t.id === main.treatmentId)!
    for (const d of t.dependencies ?? []) {
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
              !n.key.startsWith('separate:'),
          )
      required ??= add(
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
  if (promotion) {
    const included = nodes.filter((n) => n.included),
      weights = included.reduce((s, n) => s + n.price, 0)
    let rest = Math.round(promotion.price * 100)
    included.forEach((n, i) => {
      const cents =
        i === included.length - 1
          ? rest
          : Math.floor((promotion.price * 100 * n.price) / weights)
      n.chargedPrice = cents / 100
      rest -= cents
    })
  }
  return {
    nodes,
    rules,
    rootIds: roots,
    promotionId: promotionId ?? null,
    separate,
    signature: '0'.repeat(64),
  }
}
function slots(q: URLSearchParams, ignore = 0) {
  const employeeId = Number(q.get('employeeId')),
    ids = (q.get('treatmentIds') ?? '').split(',').map(Number),
    date = q.get('date') ?? today(),
    e = state.employees.find((e) => e.id === employeeId)
  if (!e || !e.active || ids.some((id) => !e.treatmentIds.includes(id)))
    return []
  const ts = state.treatments.filter((t) => ids.includes(t.id) && t.isActive)
  if (ts.length !== ids.length) return []
  const duration = ts.reduce((s, t) => s + t.durationMinutes, 0),
    total = ts.reduce((s, t) => s + Math.round(t.price * 100), 0) / 100,
    result: Row[] = []
  for (let minutes = 9 * 60; minutes + duration <= 18 * 60; minutes += 15) {
    const start = `${date}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00-03:00`,
      end = new Date(Date.parse(start) + duration * 60000).toISOString()
    if (
      state.orders.some(
        (o) =>
          o.id !== ignore &&
          o.employeeId === employeeId &&
          o.status !== 'cancelled' &&
          Date.parse(o.startsAt) < Date.parse(end) &&
          Date.parse(o.endsAt) > Date.parse(start),
      )
    )
      continue
    const normal = new Date(
        Date.parse(date + 'T00:00:00-03:00') - 1,
      ).toISOString(),
      deadline =
        q.get('depositDeadline') ??
        (Date.parse(normal) > Date.now()
          ? normal
          : new Date(
              Math.min(Date.now() + 7200000, Date.parse(start)),
            ).toISOString())
    result.push({
      startsAt: start,
      endsAt: end,
      total,
      deposit: Math.round(total * 30) / 100,
      duration,
      deadline,
      instructions: state.settings.paymentInstructions,
      shortNotice: false,
      shortNoticeHours: 2,
    })
  }
  return result
}
function scopedCustomer(id: number) {
  if (!wide() && !scopedOrders().some((o) => o.customerId === id))
    fail('Mock: cliente não disponível para este perfil.')
  const c = state.customers.find((c) => c.id === id)
  if (!c) fail('Mock: cliente não encontrado.')
  return c
}
function ledger(o: Row) {
  const payments = state.payments.filter((p) => p.orderId === o.id),
    extras = state.extras.filter((x) => x.orderId === o.id),
    extrasTotal =
      extras
        .filter((x) => !x.voidedAt)
        .reduce((s, x) => s + Math.round(x.total * 100), 0) / 100,
    totalPaid =
      payments.reduce(
        (s, p) =>
          s + (p.kind === 'refund' ? -1 : 1) * Math.round(p.amount * 100),
        0,
      ) / 100,
    grandTotal = o.totalPrice + extrasTotal
  return {
    status: o.status,
    extras,
    notes: state.notes.filter((n) => n.orderId === o.id),
    payments,
    methods: [
      { id: 1, name: 'Pix · demonstração' },
      { id: 2, name: 'Dinheiro · demonstração' },
    ],
    isPackage: !!o.packageUseId,
    extrasBalance: extrasTotal,
    treatmentTotal: o.totalPrice,
    extrasTotal,
    grandTotal,
    totalPaid,
    balance: grandTotal - totalPaid,
    completedAt: o.completedAt,
    canViewFinancial: true,
    canAddNote: true,
    canManage: o.status !== 'cancelled',
    canAddConsumption: !['completed', 'cancelled'].includes(o.status),
    canComplete: ['confirmed', 'in_progress'].includes(o.status),
    canRefund: wide(),
  }
}
function makeOrder(
  customerId: number,
  n: Row,
  a: Row,
  groupId: number,
  included = false,
) {
  const t = state.treatments.find((t) => t.id === n.treatmentId)!,
    id = idOf(state.orders),
    o: Row = {
      id,
      customerId,
      employeeId: a.employeeId,
      treatmentIds: [n.treatmentId],
      treatments: [{ id: t.id, name: t.name, price: n.chargedPrice }],
      startsAt: a.startsAt,
      endsAt: new Date(
        Date.parse(a.startsAt) + t.durationMinutes * 60000,
      ).toISOString(),
      totalPrice: n.chargedPrice,
      depositRequired: included ? 0 : a.expectedDeposit,
      depositReceived: null,
      depositDueAt: included ? null : a.expectedDeadline,
      paymentInstructions: included
        ? 'Pacote demonstrativo, sem sinal.'
        : state.settings.paymentInstructions,
      depositConfirmedAt: null,
      depositConfirmedBy: null,
      status: included ? 'confirmed' : 'awaiting_deposit',
      cancelledAt: null,
      cancellationReason: null,
      completedAt: null,
      groupId,
      packageUseId: included ? id : null,
      packagePurchaseId: null,
    }
  state.orders.push(o)
  return o
}
function dispatch(
  path: string,
  method: string,
  b: Row,
  q: URLSearchParams,
): unknown {
  const id = Number(path.split('/')[2]),
    p = Number(q.get('page') ?? 0),
    now = new Date().toISOString()
  if (path === '/auth/signin') {
    const u = state.users.find(
      (u) => u.login === b.login || u.email === b.login,
    )
    if (!u?.isActive || b.password !== demoPassword)
      fail(
        'Demonstração: use master.demo, admin.demo ou carla.demo e a senha demo12345.',
      )
    sessionStorage.setItem(sessionKey, String(u.id))
    return userView(u)
  }
  if (path === '/auth/session') {
    const u = current()
    if (!u?.isActive) fail('Mock: sessão não iniciada.')
    return userView(u)
  }
  if (path === '/auth/signout') {
    sessionStorage.removeItem(sessionKey)
    return null
  }
  if (path === '/auth/change-password') {
    if (!current()) fail('Mock: entre na demonstração.')
    current()!.mustChangePassword = false
    return userView(current()!)
  }
  if (path === '/customer/session') {
    if (!customer()) fail('Mock: cliente não conectado.')
    return customer()
  }
  if (path === '/customer/logout') {
    sessionStorage.removeItem(customerKey)
    return null
  }
  if (path === '/customer/login') {
    const c = state.customers.find((c) => c.email === b.email)
    if (!c || b.password !== demoPassword)
      fail('Demonstração: use cliente@demo.test e a senha demo12345.')
    sessionStorage.setItem(customerKey, String(c.id))
    return c
  }
  if (path === '/customer/register') {
    if (state.customers.some((c) => c.email === b.email || c.cpf === b.cpf))
      fail('Mock: cadastro já existente.')
    const c = {
      id: idOf(state.customers),
      name: b.name,
      cpf: b.cpf,
      birthDate: b.birthDate,
      email: b.email,
      phone: b.phone,
      createdAt: now,
    }
    state.customers.push(c)
    sessionStorage.setItem(customerKey, String(c.id))
    return c
  }
  if (path === '/public/treatments')
    return state.treatments.filter((t) => t.isActive).slice(p * 20, p * 20 + 20)
  if (path === '/public/promotions')
    return {
      items: state.promotions.filter((p) => p.active),
      validUntil: day(30) + 'T23:59:59-03:00',
    }
  if (path === '/booking/catalog')
    return {
      settings: state.settings,
      treatments: state.treatments.filter((t) => t.isActive),
      employees: state.employees.filter((e) => e.active),
    }
  if (path === '/booking/dependency-plan')
    return plan(b.rootIds ?? [], b.promotionId, b.separate)
  const customerRoute = path.startsWith('/customer/')
  if (customerRoute && !customer())
    fail('Mock: faça login como cliente de demonstração.')
  if (!customerRoute && !current())
    fail('Mock: faça login na área do salão de demonstração.')
  if (path === '/customer/slots' || path === '/booking/staff-slots')
    return slots(q)
  if (path === '/customer/bookings' && method === 'GET')
    return state.orders
      .filter((o) => o.customerId === customer()!.id)
      .map(orderView)
  if (path === '/customer/packages' && method === 'GET')
    return state.purchases.filter((o) => o.customerId === customer()!.id)
  if (path === '/customer/booking-groups' || path === '/booking/staff-groups') {
    const pl = plan(b.rootIds ?? [], b.promotionId, b.separate),
      cid = customerRoute ? customer()!.id : Number(b.customerId)
    if (
      !customerRoute &&
      !wide() &&
      b.appointments.some((a: Row) => a.employeeId !== ownEmployee())
    )
      fail('Mock: operacional pode simular somente o próprio trabalho.')
    if (
      pl.nodes.some(
        (n) => n.blocked || !b.appointments.some((a: Row) => a.key === n.key),
      )
    )
      fail('Mock: escolha todos os procedimentos disponíveis.')
    const groupId = idOf(state.groups),
      bookings = pl.nodes.map((n) =>
        makeOrder(
          cid,
          n,
          b.appointments.find((a: Row) => a.key === n.key),
          groupId,
          n.included,
        ),
      )
    state.groups.push({ id: groupId, plan: pl, ids: bookings.map((o) => o.id) })
    if (b.promotionId) {
      const promo = state.promotions.find((p) => p.id === b.promotionId)!,
        purchase = {
          id: idOf(state.purchases),
          customerId: cid,
          title: promo.title,
          conditions: promo.conditions,
          price: promo.price,
          acquiredAt: now,
          validUntil: day(30) + 'T23:59:59-03:00',
          expired: false,
          totalPaid: 0,
          canViewFinancial: true,
          receipts: [],
          uses: bookings
            .filter((o) => o.packageUseId)
            .map((o) => ({
              id: o.id,
              scheduleId: o.id,
              name: o.treatments[0].name,
              price: o.totalPrice,
              state: 'reserved',
              status: o.status,
              startsAt: o.startsAt,
              endsAt: o.endsAt,
              employeeId: o.employeeId,
              employeeName: orderView(o).employeeName,
            })),
        }
      state.purchases.push(purchase)
      bookings
        .filter((o) => o.packageUseId)
        .forEach((o) => (o.packagePurchaseId = purchase.id))
    }
    return { id: groupId, bookings: bookings.map(orderView) }
  }
  if (path === '/schedules')
    return scopedOrders()
      .filter(
        (o) =>
          Date.parse(o.startsAt) < Date.parse(q.get('end') ?? '') &&
          Date.parse(o.endsAt) > Date.parse(q.get('start') ?? ''),
      )
      .flatMap((o) =>
        o.treatments.map((t: Row) => ({
          ...orderView(o),
          serviceId: t.id,
          serviceName: t.name,
        })),
      )
  if (path === '/booking/settings') {
    if (!wide()) fail('Mock: perfil administrativo necessário.')
    if (method === 'PUT') Object.assign(state.settings, b)
    return state.settings
  }
  if (path === '/booking/employees' || path.startsWith('/booking/employees/')) {
    if (!wide()) fail('Mock: perfil administrativo necessário.')
    if (method === 'GET')
      return {
        employees: state.employees,
        users: state.users.filter((u) => u.isActive),
      }
    const eid = Number(path.split('/')[3]) || idOf(state.employees),
      e = {
        ...b,
        id: eid,
        email: state.users.find((u) => u.id === b.userId)?.email,
        hours: (b.weekdays ?? []).map((weekday: number) => ({
          weekday,
          opensAt: b.opensAt,
          closesAt: b.closesAt,
        })),
      }
    state.employees = state.employees.filter((x) => x.id !== eid)
    state.employees.push(e)
    return { id: eid }
  }
  if (path === '/treatments' && method === 'GET')
    return state.treatments
      .filter((t) =>
        current()?.isMaster
          ? q.get('isActive') === null ||
            t.isActive === (q.get('isActive') === 'true')
          : t.isActive,
      )
      .slice(p * 20, p * 20 + 20)
  if (path === '/treatments' || path.startsWith('/treatments/')) {
    if (!wide()) fail('Mock: perfil administrativo necessário.')
    const tid = id || idOf(state.treatments),
      old = state.treatments.find((t) => t.id === tid),
      t = {
        ...old,
        ...b,
        id: tid,
        isActive: b.isActive ?? old?.isActive ?? true,
        dependencies: b.dependencies ?? old?.dependencies ?? [],
      }
    state.treatments = state.treatments.filter((t) => t.id !== tid)
    state.treatments.push(t)
    return t
  }
  if (path === '/users' && method === 'GET')
    return page(
      state.users
        .filter(
          (u) =>
            (!q.get('hideDisabled') ||
              q.get('hideDisabled') !== 'true' ||
              u.isActive) &&
            (current()?.isMaster || u.role === 'OPERATIONAL'),
        )
        .map(userView),
      p,
    )
  if (path === '/users' || path.startsWith('/users/')) {
    if (!wide()) fail('Mock: perfil administrativo necessário.')
    if (!current()?.isMaster && !path.endsWith('temporary-password'))
      fail('Mock: somente Master altera usuários.')
    let u = state.users.find((u) => u.id === id)
    if (method === 'POST' && path === '/users') {
      u = {
        id: idOf(state.users),
        login: b.login,
        email: b.email,
        role: b.role === 'DISABLED' ? 'OPERATIONAL' : (b.role ?? 'OPERATIONAL'),
        assignedRole: b.role ?? 'OPERATIONAL',
        isActive: b.role !== 'DISABLED',
        mustChangePassword: true,
      }
      state.users.push(u)
    } else if (!u) fail('Mock: usuário não encontrado.')
    else if (path.endsWith('/temporary-password')) u.mustChangePassword = true
    else if (path.endsWith('/restore')) u.isActive = true
    else if (method === 'DELETE') u.isActive = false
    else {
      Object.assign(u, {
        login: b.login ?? u.login,
        email: b.email ?? u.email,
        role: b.role === 'DISABLED' ? u.role : (b.role ?? u.role),
        isActive: b.role !== 'DISABLED',
      })
      u.assignedRole = u.role
    }
    return userView(u!)
  }
  if (path === '/access/profiles' && method === 'GET') {
    if (!current()?.isMaster) fail('Mock: Master necessário.')
    return { catalog, profiles: state.profiles }
  }
  if (path.startsWith('/access/profiles/')) {
    if (!current()?.isMaster) fail('Mock: Master necessário.')
    const role = path.split('/').pop(),
      profile = state.profiles.find((p) => p.role === role)!
    profile.permissions = b.permissions
    profile.version++
    state.audit.unshift({
      id: idOf(state.audit),
      action: 'profile_permissions',
      targetRole: role,
      author: current()!.login,
      createdAt: now,
    })
    return { version: profile.version }
  }
  if (path === '/access/audit') return state.audit
  if (path.startsWith('/access/users/')) {
    const uid = Number(path.split('/')[3]),
      u = state.users.find((u) => u.id === uid)!
    if (!u || !wide() || (!current()?.isMaster && u.role !== 'OPERATIONAL'))
      fail('Mock: perfil não autorizado.')
    const profile = state.profiles.find((p) => p.role === u.role)!
    if (method === 'PUT') {
      const existing = state.overrides[uid] ?? []
      for (const c of b.changes) {
        const idx = existing.findIndex((x) => x.key === c.key)
        if (idx >= 0) existing.splice(idx, 1)
        if (c.allowed !== null) existing.push(c)
      }
      state.overrides[uid] = existing
      return { id: uid }
    }
    return {
      catalog,
      user: u,
      profileVersion: profile.version,
      permissions: profile.permissions.map((g: Row) => ({
        ...g,
        editable: current()?.isMaster || g.delegatable,
      })),
      overrides: state.overrides[uid] ?? [],
      effective: permissions(u),
    }
  }
  if (path === '/booking/customers')
    return state.customers.filter(
      (c) =>
        (wide() || scopedOrders().some((o) => o.customerId === c.id)) &&
        JSON.stringify(c)
          .toLowerCase()
          .includes((q.get('search') ?? '').toLowerCase()),
    )
  if (path === '/customers') {
    const search = (q.get('search') ?? '').toLowerCase()
    return page(
      state.customers.filter(
        (c) =>
          (wide() || scopedOrders().some((o) => o.customerId === c.id)) &&
          JSON.stringify(c).toLowerCase().includes(search),
      ),
      p,
    )
  }
  if (path.startsWith('/customers/')) {
    const c = scopedCustomer(id),
      orders = scopedOrders().filter((o) => o.customerId === id),
      payments = state.payments.filter((p) =>
        orders.some((o) => o.id === p.orderId),
      )
    if (path.endsWith('/packages'))
      return state.purchases.filter((p) => p.customerId === id)
    if (path.endsWith('/history')) {
      const view = q.get('view')
      return page(
        orders
          .filter((o) =>
            view === 'completed'
              ? o.status === 'completed'
              : view === 'upcoming'
                ? Date.parse(o.startsAt) >= Date.now()
                : view === 'past'
                  ? Date.parse(o.startsAt) < Date.now()
                  : true,
          )
          .map((o) => ({
            ...o,
            treatmentTotal: o.totalPrice,
            extrasTotal: ledger(o).extrasTotal,
            netPaid: ledger(o).totalPaid,
            treatments: o.treatments.map((t: Row) => ({
              ...t,
              employeeId: o.employeeId,
              employeeName: orderView(o).employeeName,
            })),
          })),
        p,
      )
    }
    if (path.endsWith('/payments')) return page(payments, p)
    if (path.endsWith('/notes')) {
      if (!wide()) fail('Mock: observações gerais restritas.')
      if (method === 'POST')
        state.notes.push({
          id: idOf(state.notes),
          customerId: id,
          body: b.body,
          author: current()!.login,
          createdAt: now,
        })
      return state.notes.filter((n) => n.customerId === id)
    }
    if (method === 'PUT') {
      if (!wide()) fail('Mock: edição restrita.')
      Object.assign(c, b)
    }
    return {
      ...c,
      totalPaid: payments.reduce(
        (s, p) => s + (p.kind === 'refund' ? -p.amount : p.amount),
        0,
      ),
      lastCompletedAt:
        orders.find((o) => o.status === 'completed')?.completedAt ?? null,
      completedCount: orders.filter((o) => o.status === 'completed').length,
      upcomingCount: orders.filter(
        (o) => Date.parse(o.startsAt) >= Date.now() && o.status !== 'cancelled',
      ).length,
      canViewFinancial: true,
      canEdit: wide(),
      canReadInternalNotes: wide(),
      historyScope: wide() ? 'all' : 'assigned',
    }
  }
  if (path.startsWith('/booking/orders/') || path.startsWith('/orders/')) {
    const oid = Number(path.split('/')[path.startsWith('/booking/') ? 3 : 2]),
      o = getOrder(oid)
    if (path.endsWith('/dependencies')) {
      const g = state.groups.find((g) => g.id === o.groupId)
      return g
        ? {
            id: g.id,
            rules: g.plan.rules,
            needsAttention: state.orders.some(
              (o) => g.ids.includes(o.id) && o.status === 'cancelled',
            ),
            members: state.orders
              .filter((o) => g.ids.includes(o.id))
              .map((o) => ({
                id: o.id,
                key: g.plan.nodes.find(
                  (n: Row) => n.treatmentId === o.treatments[0].id,
                )?.key,
                name: o.treatments[0].name,
                employeeName: orderView(o).employeeName,
                startsAt: o.startsAt,
                endsAt: o.endsAt,
                status: o.status,
                canOpen: wide() || o.employeeId === ownEmployee(),
              })),
          }
        : null
    }
    if (path.endsWith('/reschedule-slots')) {
      q.set('treatmentIds', o.treatmentIds.join(','))
      return slots(q, o.id)
    }
    if (path.endsWith('/changes'))
      return state.changes.filter((c) => c.orderId === o.id)
    if (path.endsWith('/change')) {
      const previous = { startsAt: o.startsAt, employeeIds: [o.employeeId] }
      if (b.action === 'reschedule') {
        o.startsAt = b.startsAt
        o.endsAt = new Date(
          Date.parse(b.startsAt) +
            o.treatments.reduce(
              (s: number, t: Row) =>
                s +
                (state.treatments.find((x) => x.id === t.id)?.durationMinutes ??
                  30),
              0,
            ) *
              60000,
        ).toISOString()
        o.employeeId = b.employeeId
        o.status = 'confirmed'
      } else {
        o.status = 'cancelled'
        o.cancelledAt = now
        o.cancellationReason = b.reason
      }
      state.changes.push({
        id: idOf(state.changes),
        orderId: o.id,
        action: b.action,
        reason: b.reason,
        author: current()!.login,
        createdAt: now,
        previousData: previous,
        currentData: {
          schedule_started_at: o.startsAt,
          employeeId: o.employeeId,
        },
      })
      return { id: o.id }
    }
    if (path.endsWith('/deposit')) {
      o.depositReceived = b.amount
      o.depositConfirmedAt = now
      o.depositConfirmedBy = current()!.login
      o.status = 'confirmed'
      state.payments.push({
        id: idOf(state.payments),
        orderId: o.id,
        kind: 'deposit',
        amount: b.amount,
        description: 'Sinal fictício',
        createdAt: now,
        method: 'Pix · demonstração',
        isDebit: false,
        refundedAmount: 0,
        author: current()!.login,
      })
      return { id: o.id }
    }
    if (path.endsWith('/consumptions') && method === 'POST') {
      const x: Row = {
        ...b,
        id: idOf(state.extras),
        orderId: o.id,
        total: Math.round(b.quantity * b.unitPrice * 100) / 100,
        createdAt: now,
        author: current()!.login,
        voidedAt: null,
        voidReason: null,
      }
      delete x.requestKey
      state.extras.push(x)
      return { id: x.id }
    }
    if (path.endsWith('/void')) {
      const x = state.extras.find(
        (x) => x.id === Number(path.split('/').at(-2)) && x.orderId === o.id,
      )
      if (x) {
        x.voidedAt = now
        x.voidReason = b.reason
      }
      return { id: x?.id }
    }
    if (path.endsWith('/notes')) {
      state.notes.push({
        id: idOf(state.notes),
        orderId: o.id,
        body: b.body,
        author: current()!.login,
        createdAt: now,
      })
      return { id: o.id }
    }
    if (path.endsWith('/complete')) {
      o.status = 'completed'
      o.completedAt = now
      return { id: o.id }
    }
    if (
      (path.endsWith('/payments') || path.endsWith('/refund')) &&
      method === 'POST'
    ) {
      const refund = path.endsWith('/refund'),
        source = refund
          ? state.payments.find(
              (p) =>
                p.id === Number(path.split('/').at(-2)) && p.orderId === o.id,
            )
          : null
      if (refund && !wide()) fail('Mock: estorno restrito.')
      if (source)
        source.refundedAmount = (source.refundedAmount ?? 0) + b.amount
      state.payments.push({
        id: idOf(state.payments),
        orderId: o.id,
        kind: refund ? 'refund' : 'payment',
        amount: b.amount,
        description: b.description ?? b.reason,
        method: 'Pix · demonstração',
        createdAt: now,
        isDebit: refund,
        refundOf: source?.id ?? null,
        refundedAmount: 0,
        author: current()!.login,
      })
      return { id: o.id }
    }
    return path.startsWith('/booking/') ? orderView(o) : ledger(o)
  }
  if (path === '/social/birthdays/today')
    return {
      count: state.customers.filter(
        (c) =>
          c.birthDate?.slice(5) === today().slice(5) &&
          (wide() || scopedOrders().some((o) => o.customerId === c.id)),
      ).length,
    }
  if (path === '/social/birthdays')
    return page(
      state.customers
        .filter(
          (c) =>
            Number(c.birthDate?.slice(5, 7)) === Number(q.get('month')) &&
            (wide() || scopedOrders().some((o) => o.customerId === c.id)),
        )
        .map((c) => ({
          ...c,
          isToday: c.birthDate?.slice(5) === today().slice(5),
        })),
      p,
      30,
    )
  if (path.startsWith('/social/promotions')) {
    if (!wide()) fail('Mock: promoções restritas.')
    if (method === 'GET') return state.promotions
    const pid = Number(path.split('/')[3]) || idOf(state.promotions),
      promo = {
        ...b,
        id: pid,
        items: b.items.map((i: Row) => ({
          ...state.treatments.find((t) => t.id === i.treatmentId),
          ...i,
        })),
      }
    state.promotions = state.promotions.filter((p) => p.id !== pid)
    state.promotions.push(promo)
    return { id: pid }
  }
  if (path === '/social/art') {
    const aid = Object.keys(state.art).length + 10
    state.art[aid] = `data:${b.mime};base64,${b.base64}`
    return { id: aid }
  }
  if (path === '/social/payment-methods')
    return [
      { id: 1, name: 'Pix · demonstração' },
      { id: 2, name: 'Dinheiro · demonstração' },
    ]
  if (path.startsWith('/social/packages/')) {
    if (!wide()) fail('Mock: recebimentos de pacotes restritos.')
    const purchaseId = Number(path.split('/')[3]),
      purchase = state.purchases.find((p) => p.id === purchaseId)
    if (!purchase) fail('Mock: pacote não encontrado.')
    if (method === 'POST') {
      const refund = path.includes('/refunds/')
      purchase.receipts.push({
        id: purchase.receipts.length + 1,
        kind: refund ? 'refund' : 'payment',
        amount: b.amount,
        description: b.description ?? b.reason,
        createdAt: now,
        method: 'Pix · demonstração',
        refundOf: refund ? Number(path.split('/').pop()) : null,
      })
      purchase.totalPaid += refund ? -b.amount : b.amount
    }
    return purchase
  }
  if (path === '/finance/options') {
    if (!wide()) fail('Mock: lançamentos gerais restritos.')
    return {
      methods: [
        { id: 1, name: 'Pix · demonstração' },
        { id: 2, name: 'Dinheiro · demonstração' },
      ],
      types: [{ id: 1, name: 'Entrada / saída fictícia' }],
    }
  }
  if (path === '/finance/manual') {
    if (!wide()) fail('Mock: lançamentos gerais restritos.')
    const tx: Row = {
      ...b,
      id: idOf(state.payments),
      kind: b.isDebit ? 'expense' : 'manual',
      orderId: null,
      createdAt: now,
      method: 'Pix · demonstração',
    }
    delete tx.requestKey
    state.payments.push(tx)
    return { id: tx.id }
  }
  if (path === '/finance') {
    const orders = scopedOrders(),
      items = state.payments
        .filter(
          (tx) =>
            (wide() || orders.some((o) => o.id === tx.orderId)) &&
            tx.createdAt.slice(0, 10) >= (q.get('from') ?? '') &&
            tx.createdAt.slice(0, 10) <= (q.get('to') ?? '9999'),
        )
        .map(
          (tx): Row => ({ ...tx, isDebit: tx.isDebit ?? tx.kind === 'refund' }),
        ),
      income =
        items
          .filter((t) => !t.isDebit)
          .reduce((s, t) => s + Math.round(t.amount * 100), 0) / 100,
      expenses =
        items
          .filter((t) => t.isDebit)
          .reduce((s, t) => s + Math.round(t.amount * 100), 0) / 100
    return {
      ...page(items, p),
      income,
      expenses,
      net: Math.round((income - expenses) * 100) / 100,
      scope: wide() ? 'all' : 'own',
      note: 'Valores fictícios. Nenhum lançamento movimenta dinheiro.',
    }
  }
  fail(
    `Mock sem contrato para ${method} ${path}. Não foi feita chamada ao backend.`,
  )
}
export async function mockRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const url = new URL(path, 'https://demo.invalid'),
    method = (options.method ?? 'GET').toUpperCase(),
    body = typeof options.body === 'string' ? JSON.parse(options.body) : {},
    key = body.requestKey
      ? `${current()?.id ?? customer()?.id}:${method}:${url.pathname}:${body.requestKey}`
      : null
  await Promise.resolve()
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  if (key && retries.has(key)) {
    const old = retries.get(key) as { body: string; value: T }
    if (old.body !== JSON.stringify(body))
      fail('Mock: chave já usada para outros dados.')
    return structuredClone(old.value)
  }
  const value = dispatch(url.pathname, method, body, url.searchParams)
  if (key)
    retries.set(key, {
      body: JSON.stringify(body),
      value: structuredClone(value),
    })
  return structuredClone(value) as T
}
export function mockPromotionArt(id: number | string) {
  return state.art[Number(id)] ?? '/demo-promotion.svg'
}
export function resetDemo() {
  state = createFixtures()
  retries.clear()
  sessionStorage.removeItem(sessionKey)
  sessionStorage.removeItem(customerKey)
}
