import { FastifyRequest, FastifyReply } from 'fastify'
import { can } from '@/core/access'
// Every administrative route is mapped explicitly. Unknown authenticated routes fail closed.
export function routePermission(method: string, path: string): string | null {
  if (path.startsWith('/api')) path = path.slice(4)
  if (path.startsWith('/access/profiles') || path === '/access/audit')
    return 'profiles.manage'
  if (path === '/access/catalog') return 'users.view'
  if (/^\/access\/users\//.test(path)) return 'staff.permissions'
  if (path === '/finance') return 'finance.view'
  if (path.startsWith('/finance/')) return 'finance.manage'
  if (path === '/users/@me') return method === 'GET' ? null : 'users.manage'
  if (path.startsWith('/users')) {
    if (path.endsWith('/temporary-password')) return 'users.passwords'
    return method === 'GET'
      ? 'users.view'
      : method === 'POST'
        ? 'users.create'
        : 'users.manage'
  }
  if (path === '/schedules')
    return method === 'GET' ? 'agenda.view' : 'agenda.create'
  if (path.startsWith('/transactions')) return 'finance.manage'
  if (path.startsWith('/treatments'))
    return method === 'GET'
      ? 'services.view'
      : path.endsWith('/status')
        ? 'services.status'
        : 'services.manage'
  if (path.startsWith('/booking/settings')) return 'booking.settings'
  if (path.startsWith('/booking/employees'))
    return method === 'GET' ? 'employees.view' : 'employees.manage'
  if (
    path === '/booking/customers' ||
    path === '/booking/staff-slots' ||
    path === '/booking/staff-bookings' ||
    path === '/booking/staff-groups'
  )
    return 'agenda.create'
  if (path.startsWith('/booking/orders'))
    return method === 'GET' ? 'orders.view' : 'agenda.deposit'
  if (path.startsWith('/social/birthdays')) return 'birthdays.view'
  if (path.startsWith('/social/promotions'))
    return method === 'GET' ? 'promotions.view' : 'promotions.manage'
  if (path === '/social/art') return 'promotions.manage'
  if (path.startsWith('/social/packages') || path === '/social/payment-methods')
    return 'packages.payments'
  if (path.startsWith('/customers')) {
    if (path.endsWith('/notes')) return 'clients.notes'
    if (path.endsWith('/payments')) return 'clients.financial'
    return method === 'GET' ? 'clients.view' : 'clients.edit'
  }
  if (path.startsWith('/orders')) {
    if (path.endsWith('/reschedule-slots')) return 'agenda.change'
    if (path.endsWith('/change')) return 'agenda.change'
    if (path.endsWith('/complete')) return 'agenda.complete'
    if (path.includes('/consumptions')) return 'orders.consumptions'
    if (path.endsWith('/refund')) return 'orders.refunds'
    if (path.endsWith('/payments')) return 'orders.payments'
    if (path.endsWith('/notes')) return 'orders.notes'
    return 'orders.view'
  }
  return '__unmapped__'
}
export function enforceRoutePermission(req: FastifyRequest, res: FastifyReply) {
  const key = routePermission(req.method, req.routeOptions.url)
  if (key && !can(req.authUser, key))
    return res.status(403).send({
      success: false,
      code: 'PERMISSION_DENIED',
      message: 'Permission denied for this functionality.',
    })
}
