import { databaseServiceId, IDatabaseService, IGenericDatabaseClient } from '@/core/db'
import { MASTER_USER_ID } from '@/core/config'
import { FinanceFilter, FinanceRecord, ProductRecord, financeError, safeMoney, completeTreatmentSchema, productSchema, productSaleSchema } from '@/core/finance'
import { inject, injectable } from 'inversify'
import z from 'zod'

@injectable()
export class FinanceRepository {
  constructor(@inject(databaseServiceId) private readonly database: IDatabaseService) {}

  async connection<T>(work: (client: IGenericDatabaseClient) => Promise<T>): Promise<T> {
    const client = await this.database.getClient()
    try { return await work(client) } finally { client.release() }
  }

  async transaction<T>(work: (client: IGenericDatabaseClient) => Promise<T>): Promise<T> {
    return this.connection(async (client) => {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ', [])
      try {
        const result = await work(client)
        await client.query('COMMIT', [])
        return result
      } catch (error) { await client.query('ROLLBACK', []); throw error }
    })
  }

  async access(userId: number) {
    if (userId === MASTER_USER_ID) return { read: true, write: true, export: true }
    return this.connection(async (client) => {
      const { rows } = await client.query(`SELECT DISTINCT p.name FROM app_permissions p
        JOIN app_user_permissions up ON up.permission_id = p.id WHERE up.user_id = $1`, [userId])
      const names = new Set(rows.map((row: { name: string }) => row.name))
      return { read: names.has('finance.read'), write: names.has('finance.write'), export: names.has('finance.export') }
    })
  }

  async options() {
    return this.connection(async (client) => {
      const employees = await client.query('SELECT e.id, p.name FROM employees e JOIN persons p ON p.id=e.person_id ORDER BY p.name', [])
      const treatments = await client.query('SELECT id, name FROM salon_treatments ORDER BY name', [])
      const customers = await client.query('SELECT c.id, p.name FROM customers c JOIN persons p ON p.id=c.person_id ORDER BY p.name', [])
      const products = await client.query('SELECT id, name, price_cents AS "priceCents" FROM salon_products WHERE is_active ORDER BY name', [])
      return { employees: employees.rows, treatments: treatments.rows, customers: customers.rows,
        products: products.rows.map((row: {id:number;name:string;priceCents:string}) => ({ ...row, priceCents: safeMoney(row.priceCents) })) }
    })
  }

  async pending(start: string, end: string) {
    return this.connection(async (client) => (await client.query(`
      SELECT st.id, s.id AS "scheduleId", to_char(s.schedule_started_at,'YYYY-MM-DD HH24:MI') AS date,
        ep.name AS employee, cp.name AS customer, t.name AS treatment, st.price::text AS price
      FROM salon_schedule_treatments st JOIN salon_schedules s ON s.id=st.schedule_id
      JOIN employees e ON e.id=st.employee_id JOIN persons ep ON ep.id=e.person_id
      JOIN customers c ON c.id=s.customer_id JOIN persons cp ON cp.id=c.person_id
      JOIN salon_treatments t ON t.id=st.treatment_id
      WHERE s.schedule_started_at >= $1::date AND s.schedule_started_at < $2::date + INTERVAL '1 day'
        AND NOT EXISTS (SELECT 1 FROM finance_treatment_records f WHERE f.schedule_item_id=st.id)
      ORDER BY s.schedule_started_at, st.id`, [start, end])).rows)
  }

  async records(client: IGenericDatabaseClient, filter: FinanceFilter, start: string): Promise<FinanceRecord[]> {
    const { rows } = await client.query(`
      SELECT id, schedule_id AS "scheduleId", employee_id AS "employeeId", treatment_id AS "treatmentId",
        to_char(performed_on, 'YYYY-MM-DD') AS date, employee_name AS employee, customer_name AS customer,
        treatment_name AS treatment, quantity, gross_cents AS "grossCents", discount_cents AS "discountCents",
        final_cents AS "finalCents", actual_started_at AS "actualStartedAt", actual_ended_at AS "actualEndedAt"
      FROM finance_treatment_records WHERE status='completed' AND performed_on BETWEEN $1::date AND $2::date
        AND ($3::int IS NULL OR employee_id=$3) AND ($4::int IS NULL OR treatment_id=$4)
        AND ($5='' OR strpos(lower(employee_name || ' ' || customer_name || ' ' || treatment_name), lower($5))>0)
      ORDER BY performed_on DESC, id DESC`, [start, filter.end, filter.employeeId ?? null, filter.treatmentId ?? null, filter.search])
    return rows.map((row: FinanceRecord) => ({ ...row, grossCents: safeMoney(row.grossCents), discountCents: safeMoney(row.discountCents),
      finalCents: safeMoney(row.finalCents), actualStartedAt: row.actualStartedAt ? new Date(row.actualStartedAt).toISOString() : null,
      actualEndedAt: row.actualEndedAt ? new Date(row.actualEndedAt).toISOString() : null }))
  }

  async productRecords(client: IGenericDatabaseClient, filter: FinanceFilter): Promise<ProductRecord[]> {
    const { rows } = await client.query(`
      SELECT i.id, i.sale_id AS "saleId", i.product_id AS "productId", i.product_name AS product,
        to_char(s.sold_on,'YYYY-MM-DD') AS date, i.quantity, i.final_cents AS "finalCents"
      FROM salon_product_sale_items i JOIN salon_product_sales s ON s.id=i.sale_id
      JOIN employees e ON e.id=s.employee_id JOIN persons ep ON ep.id=e.person_id
      LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN persons cp ON cp.id=c.person_id
      WHERE s.status='completed' AND s.sold_on BETWEEN $1::date AND $2::date
        AND ($3::int IS NULL OR s.employee_id=$3)
        AND ($4='' OR strpos(lower(i.product_name || ' ' || ep.name || ' ' || coalesce(cp.name,'')),lower($4))>0)
      ORDER BY s.sold_on DESC, i.id DESC`, [filter.start, filter.end, filter.employeeId ?? null, filter.search])
    return rows.map((row: ProductRecord) => ({ ...row, finalCents: safeMoney(row.finalCents) }))
  }

  async complete(input: z.infer<typeof completeTreatmentSchema>, userId: number) {
    return this.transaction(async (client) => {
      const { rows } = await client.query(`SELECT st.*, s.customer_id, s.schedule_started_at,
        ep.name AS employee_name, cp.name AS customer_name, t.name AS treatment_name,
        (st.price * 100)::bigint AS cents,
        ($2::date <= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date
          AND $2::date >= s.schedule_started_at::date) AS valid_date
        FROM salon_schedule_treatments st JOIN salon_schedules s ON s.id=st.schedule_id
        JOIN employees e ON e.id=st.employee_id JOIN persons ep ON ep.id=e.person_id
        JOIN customers c ON c.id=s.customer_id JOIN persons cp ON cp.id=c.person_id
        JOIN salon_treatments t ON t.id=st.treatment_id WHERE st.id=$1 FOR UPDATE OF st`, [input.scheduleItemId, input.performedOn])
      const item = rows[0]
      if (!item) throw financeError('Schedule item not found', 404)
      if (!item.valid_date) throw financeError('Invalid completion date')
      if (input.actualStartedAt && new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo'}).format(new Date(input.actualStartedAt)) !== input.performedOn)
        throw financeError('Actual attendance date must match completion date')
      const gross = safeMoney(item.cents) * input.quantity
      if (input.discountCents > gross) throw financeError('Discount exceeds gross amount')
      const result = await client.query(`INSERT INTO finance_treatment_records
        (schedule_item_id,schedule_id,employee_id,customer_id,treatment_id,employee_name,customer_name,treatment_name,
          performed_on,quantity,unit_price_cents,discount_cents,actual_started_at,actual_ended_at,created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
      [item.id,item.schedule_id,item.employee_id,item.customer_id,item.treatment_id,item.employee_name,item.customer_name,item.treatment_name,
        input.performedOn,input.quantity,item.cents,input.discountCents,input.actualStartedAt ?? null,input.actualEndedAt ?? null,userId])
      return result.rows[0]
    })
  }

  async createProduct(input: z.infer<typeof productSchema>) {
    return this.connection(async (client) => (await client.query(
      'INSERT INTO salon_products(name,price_cents) VALUES ($1,$2) RETURNING id', [input.name,input.priceCents])).rows[0])
  }

  async sell(input: z.infer<typeof productSaleSchema>, userId: number) {
    return this.transaction(async (client) => {
      const { rows } = await client.query(`INSERT INTO salon_product_sales(employee_id,customer_id,sold_on,created_by)
        SELECT $1,$2,$3,$4 WHERE $3::date <= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date RETURNING id`,
      [input.employeeId,input.customerId ?? null,input.soldOn,userId])
      if (!rows[0]) throw financeError('Future sales are not allowed')
      for (const item of input.items) {
        const product = (await client.query('SELECT * FROM salon_products WHERE id=$1 AND is_active FOR SHARE', [item.productId])).rows[0]
        if (!product) throw financeError('Product not found',404)
        if (item.discountCents > safeMoney(product.price_cents) * item.quantity) throw financeError('Discount exceeds gross amount')
        await client.query(`INSERT INTO salon_product_sale_items(sale_id,product_id,product_name,quantity,unit_price_cents,discount_cents)
          VALUES($1,$2,$3,$4,$5,$6)`, [rows[0].id,item.productId,product.name,item.quantity,product.price_cents,item.discountCents])
      }
      return rows[0]
    })
  }

  async reverse(category: 'treatments' | 'sales', id: number, reason: string, userId: number) {
    const table = category === 'treatments' ? 'finance_treatment_records' : 'salon_product_sales'
    return this.connection(async (client) => {
      const result = await client.query(`UPDATE ${table} SET status='reversed',reversal_reason=$2,reversed_by=$3,reversed_at=NOW()
        WHERE id=$1 AND status='completed' RETURNING id`, [id,reason,userId])
      if (!result.rowCount) throw financeError('Completed record not found',404)
    })
  }
}
