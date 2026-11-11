import { FastifyRequest, FastifyReply } from 'fastify'
import { container } from '@/di/bindings'
import { FinanceRepository } from '@/modules/finance/repository'
import { fail } from '@/shared/utils/response'

export function financeAccessHook(permission: 'read' | 'write' | 'export') {
  return async (req: FastifyRequest, res: FastifyReply) => {
    const access = await container.get(FinanceRepository).access(Number(req.tokenPayload.sub))
    if (!access.read || !access[permission]) return fail(res, 'Financial access denied', 403)
  }
}
