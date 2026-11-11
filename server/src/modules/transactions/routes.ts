import {
  ISalonTxService,
  SalonTx,
  SalonTxCreateSchema,
  salonTxServiceId,
} from '@/core/transactions'
import { container } from '@/di/bindings'
import { authHook } from '@/shared/middlewares/auth'
import { financeAccessHook } from '@/shared/middlewares/finance'
import { fail, ok } from '@/shared/utils/response'
import { FastifyInstance } from 'fastify'

export default async function userRoutes(app: FastifyInstance): Promise<void> {
  const salonTxService: ISalonTxService = container.get(salonTxServiceId)

  app.get<{
    Querystring: {
      page: string
    }
  }>('/transactions', { preHandler: [authHook, financeAccessHook('read')] }, async (req, res) => {
    const page: number = parseInt(req.query.page)
    const txs: SalonTx[] = await salonTxService.getAll(page)

    return ok(res, txs)
  })

  app.post<{
    Body: {
      methodId: number
      typeId: number
      isDebit: number
      description: string
      value: number
    }
  }>('/transactions', { preHandler: [authHook, financeAccessHook('write')] }, async (req, res) => {
    const { success, data, error } = SalonTxCreateSchema.safeParse(req.body)

    if (!success) {
      return fail(res, 'Invalid body', 400, error.message)
    }

    const tx: SalonTx = await salonTxService.create(data)
    return ok(res, tx)
  })
}
