import { FastifyInstance, FastifyReply } from 'fastify'
import { container } from '@/di/bindings'
import { authHook } from '@/shared/middlewares/auth'
import { ok, fail } from '@/shared/utils/response'
import { FinanceService } from './service'
import { financeFilterSchema, completeTreatmentSchema, productSchema, productSaleSchema, financeError } from '@/core/finance'
import z from 'zod'
import { financeAccessHook } from '@/shared/middlewares/finance'

export default async function financeRoutes(app: FastifyInstance) {
  const service = container.get(FinanceService)
  const guard = financeAccessHook
  const read = {preHandler:[authHook,guard('read')]}
  const write = {preHandler:[authHook,guard('write')]}
  const parseFilter = (query: unknown) => {
    const parsed=financeFilterSchema.safeParse(query)
    if(!parsed.success) throw financeError('Invalid finance filters')
    return parsed.data
  }
  const parse = <T>(schema:z.ZodType<T>,input:unknown):T => {
    const parsed=schema.safeParse(input)
    if(!parsed.success) throw financeError('Invalid finance input')
    return parsed.data
  }
  app.get('/finance/access',{preHandler:authHook},async(req,res)=>ok(res,await service.repository.access(Number(req.tokenPayload.sub))))
  app.get('/finance/options',read,async(_req,res)=>ok(res,await service.repository.options()))
  app.get('/finance/pending',write,async(req,res)=>{const filter=parseFilter(req.query);return ok(res,await service.repository.pending(filter.start,filter.end))})
  app.get('/finance/report',read,async(req,res)=>ok(res,await service.report(parseFilter(req.query))))
  app.get('/finance/export',{preHandler:[authHook,guard('export')]},async(req,res)=>{
    const filter=parseFilter(req.query)
    const buffer=await service.workbook(filter)
    return res.header('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition',`attachment; filename="financeiro_${filter.start}_${filter.end}.xlsx"`).send(Buffer.from(buffer))
  })
  async function writeResult(work:()=>Promise<unknown>,res:FastifyReply) {
    try{return ok(res,await work())}catch(error){
      if((error as {code?:string}).code==='23505') return fail(res,'Financial record already exists',409)
      if((error as {code?:string}).code==='23503') return fail(res,'Referenced financial entity not found',400)
      throw error
    }
  }
  app.post('/finance/treatments',write,async(req,res)=>writeResult(()=>service.repository.complete(parse(completeTreatmentSchema,req.body),Number(req.tokenPayload.sub)),res))
  app.post('/finance/products',write,async(req,res)=>writeResult(()=>service.repository.createProduct(parse(productSchema,req.body)),res))
  app.post('/finance/sales',write,async(req,res)=>writeResult(()=>service.repository.sell(parse(productSaleSchema,req.body),Number(req.tokenPayload.sub)),res))
  app.post<{Params:{category:string;id:string}}>('/finance/:category/:id/reverse',write,async(req,res)=>{
    const category=parse(z.enum(['treatments','sales']),req.params.category)
    const id=parse(z.coerce.number().int().positive(),req.params.id)
    const {reason}=parse(z.object({reason:z.string().trim().min(5).max(500)}),req.body)
    await service.repository.reverse(category,id,reason,Number(req.tokenPayload.sub))
    return ok(res)
  })
}
