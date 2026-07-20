import { ENVIRONMENT } from '@/app'
import { FastifyReply } from 'fastify'

export function ok(res: FastifyReply, data?: any): FastifyReply {
  return res.status(200).send({
    data,
    success: true,
  })
}

export function fail(
  res: FastifyReply,
  message: string,
  status: number = 400,
  details?: any,
): FastifyReply {
  return res.status(status).send({
    message,
    success: false,
    details: ENVIRONMENT === 'development' ? details : undefined,
  })
}
