import { FastifyRequest, FastifyReply } from 'fastify'
import { fail } from '@/shared/utils/response'
import { AppUser } from '@/core/user'
import { can, salonWide } from '@/core/access'

export function financeReportAccess(user: AppUser) {
  const read = !!user && salonWide(user) && can(user, 'finance.view')
  const write = read && can(user, 'finance.manage')
  return { read, write, export: write }
}

export function financeAccessHook(permission: 'read' | 'write' | 'export') {
  return async (req: FastifyRequest, res: FastifyReply) => {
    const access = financeReportAccess(req.authUser)
    if (!access.read || !access[permission]) return fail(res, 'Financial access denied', 403)
  }
}
