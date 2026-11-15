import { IDatabaseService, IDatabaseUnitOfWork } from '@/core/db'
import { AppUser } from '@/core/user'
import { can, salonWide } from '@/core/access'
import z from 'zod'
import { bookingError } from '../booking/service'
import { CustomerService } from '../customers/service'
import {
  ProductSchema,
  SupplierSchema,
  MovementSchema,
  OrderProductSchema,
  SettlementSchema,
} from './schemas'
import { recognizeProducts } from './ledger'

const productSelect = `SELECT p.id,p.name,p.description,p.kind,p.stock,p.active,p.supplier_id AS "supplierId",s.name AS "supplierName",p.sale_price::float AS "salePrice",p.supplier_percent::float AS "supplierPercent",p.acquisition_cost::float AS "acquisitionCost" FROM inventory_products p JOIN inventory_suppliers s ON s.id=p.supplier_id`
export class InventoryService {
  constructor(
    private db: IDatabaseService,
    private work: IDatabaseUnitOfWork,
  ) {}
  async query(sql: string, args: unknown[] = []) {
    const c = await this.db.getClient()
    try {
      return await c.query(sql, args)
    } finally {
      c.release()
    }
  }
  private async transaction<T>(
    work: (client: import('@/core/db').IGenericDatabaseClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.work.transaction(work)
    } catch (error) {
      const code = (error as { code?: string }).code
      if (code === '23505')
        bookingError(
          'Request key already used by another inventory operation.',
          409,
        )
      if (code === '23503' || code === '23514')
        bookingError('Invalid inventory reference or stock movement.', 400)
      if (code === '40P01')
        bookingError('Inventory changed concurrently. Please retry.', 409)
      throw error
    }
  }
  require(actor: AppUser, key: string) {
    if (!can(actor, key))
      bookingError('Permission denied for inventory functionality.', 403)
  }
  finance(actor: AppUser) {
    this.require(actor, 'products.settlements')
    if (!salonWide(actor))
      bookingError('Supplier finance requires salon administration.', 403)
  }
  async access(actor: AppUser) {
    return {
      canManage: can(actor, 'products.manage'),
      canStock: can(actor, 'products.stock'),
      canSuppliers: can(actor, 'products.suppliers'),
      canSettle: can(actor, 'products.settlements') && salonWide(actor),
    }
  }
  async products(
    actor: AppUser,
    search: string,
    page: number,
    inactive: boolean,
  ) {
    this.require(actor, 'products.view')
    const rows = (
      await this.query(
        `${productSelect} WHERE ($1='' OR p.name ILIKE $2 OR s.name ILIKE $2) AND ($3 OR p.active) ORDER BY lower(p.name),p.id LIMIT 21 OFFSET $4`,
        [
          search,
          '%' + search.replace(/[\\%_]/g, '\\$&') + '%',
          inactive,
          page * 20,
        ],
      )
    ).rows
    const financial = can(actor, 'products.suppliers')
    return {
      items: rows
        .slice(0, 20)
        .map((p: any) =>
          financial
            ? p
            : (({
                supplierPercent,
                acquisitionCost,
                supplierId,
                supplierName,
                ...safe
              }) => safe)(p),
        ),
      hasNext: rows.length > 20,
    }
  }
  async suppliers(actor: AppUser, search: string, page: number) {
    this.require(actor, 'products.suppliers')
    const rows = (
      await this.query(
        "SELECT * FROM inventory_suppliers WHERE ($1='' OR name ILIKE $2) ORDER BY lower(name),id LIMIT 21 OFFSET $3",
        [search, '%' + search.replace(/[\\%_]/g, '\\$&') + '%', page * 20],
      )
    ).rows
    return { items: rows.slice(0, 20), hasNext: rows.length > 20 }
  }
  async supplier(
    actor: AppUser,
    id: number | null,
    d: z.infer<typeof SupplierSchema>,
  ) {
    this.require(actor, 'products.suppliers')
    const result = id
      ? await this.query(
          'UPDATE inventory_suppliers SET name=$2,contact=$3,notes=$4,active=$5 WHERE id=$1 RETURNING id',
          [id, d.name, d.contact, d.notes, d.active],
        )
      : await this.query(
          'INSERT INTO inventory_suppliers(name,contact,notes,active,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id',
          [d.name, d.contact, d.notes, d.active, actor.id],
        )
    if (!result.rows.length) bookingError('Supplier not found.', 404)
    return result.rows[0]
  }
  async product(
    actor: AppUser,
    id: number | null,
    d: z.infer<typeof ProductSchema>,
  ) {
    this.require(actor, 'products.manage')
    return this.transaction(async (c) => {
      const supplier = (
        await c.query(
          'SELECT id,active FROM inventory_suppliers WHERE id=$1 FOR SHARE',
          [d.supplierId],
        )
      ).rows[0]
      if (!supplier) bookingError('Supplier not found.', 404)
      const old = id
        ? (
            await c.query(
              'SELECT * FROM inventory_products WHERE id=$1 FOR UPDATE',
              [id],
            )
          ).rows[0]
        : null
      if (id && !old) bookingError('Product not found.', 404)
      if (!supplier.active && d.active)
        bookingError('Choose an active supplier.', 409)
      if (
        old &&
        (old.kind !== d.kind || old.supplier_id !== d.supplierId) &&
        (
          await c.query(
            'SELECT 1 FROM inventory_movements WHERE product_id=$1 LIMIT 1',
            [id],
          )
        ).rows.length
      )
        bookingError(
          'Supplier and product model cannot change after stock movements. Create another product.',
          409,
        )
      const args = [
        d.name,
        d.description,
        d.supplierId,
        d.kind,
        d.salePrice,
        d.supplierPercent,
        d.acquisitionCost,
        d.active,
      ]
      const result = id
        ? await c.query(
            'UPDATE inventory_products SET name=$1,description=$2,supplier_id=$3,kind=$4,sale_price=$5,supplier_percent=$6,acquisition_cost=$7,active=$8,updated_at=now() WHERE id=$9 RETURNING *',
            [...args, id],
          )
        : await c.query(
            'INSERT INTO inventory_products(name,description,supplier_id,kind,sale_price,supplier_percent,acquisition_cost,active,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
            [...args, actor.id],
          )
      await c.query(
        'INSERT INTO inventory_product_changes(product_id,previous_data,current_data,changed_by) VALUES($1,$2,$3,$4)',
        [
          result.rows[0].id,
          JSON.stringify(old ?? {}),
          JSON.stringify(result.rows[0]),
          actor.id,
        ],
      )
      return { id: result.rows[0].id }
    })
  }
  async move(actor: AppUser, id: number, d: z.infer<typeof MovementSchema>) {
    this.require(actor, 'products.stock')
    return this.transaction(async (c) => {
      const p = (
        await c.query(
          'SELECT * FROM inventory_products WHERE id=$1 FOR UPDATE',
          [id],
        )
      ).rows[0]
      if (!p) bookingError('Product not found.', 404)
      const existing = (
        await c.query(
          'SELECT * FROM inventory_movements WHERE request_key=$1',
          [d.requestKey],
        )
      ).rows[0]
      const quantity =
        d.kind === 'entry' || d.kind === 'adjustment' ? d.quantity : -d.quantity
      const cost = d.unitCost ?? Number(p.acquisition_cost)
      if (existing) {
        if (
          existing.product_id !== id ||
          existing.quantity !== quantity ||
          existing.kind !== d.kind ||
          existing.reason !== d.reason ||
          (d.unitCost !== undefined &&
            Number(existing.unit_cost) !== d.unitCost)
        )
          bookingError('Request key used for another stock movement.', 409)
        return { id: existing.id }
      }
      if (!p.active && d.kind === 'entry')
        bookingError('Inactive products cannot receive new entries.', 409)
      if (p.stock + quantity < 0) bookingError('Insufficient stock.', 409)
      if (
        p.kind === 'courtesy' &&
        d.kind === 'supplier_return' &&
        d.unitCost === undefined
      )
        bookingError('Specify the supplier credit per returned unit.')
      if (p.kind === 'consigned' && d.unitCost)
        bookingError('Consigned entry has no acquisition payment.', 400)
      const movement = (
        await c.query(
          'INSERT INTO inventory_movements(product_id,quantity,kind,reason,unit_cost,request_key,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
          [
            id,
            quantity,
            d.kind,
            d.reason,
            p.kind === 'courtesy' ? cost : 0,
            d.requestKey,
            actor.id,
          ],
        )
      ).rows[0]
      await c.query(
        'UPDATE inventory_products SET stock=stock+$2,updated_at=now() WHERE id=$1',
        [id, quantity],
      )
      if (
        p.kind === 'courtesy' &&
        ['entry', 'supplier_return'].includes(d.kind)
      ) {
        await c.query('SELECT pg_advisory_xact_lock(70435,$1)', [p.supplier_id])
        await c.query(
          `INSERT INTO inventory_supplier_entries(supplier_id,kind,amount_cents,description,movement_id,created_by) VALUES($1,$7,round($2::numeric*$3*100)::bigint,$4,$5,$6)`,
          [
            p.supplier_id,
            cost,
            quantity,
            p.name,
            movement.id,
            actor.id,
            d.kind === 'entry' ? 'purchase' : 'purchase_return',
          ],
        )
      }
      return movement
    })
  }
  async movements(actor: AppUser, id: number, page: number) {
    this.require(actor, 'products.view')
    const rows = (
      await this.query(
        `SELECT m.id,m.kind,m.quantity,m.reason,m.created_at AS "createdAt",m.order_item_id AS "orderItemId",u.login AS author,${can(actor, 'products.suppliers') ? 'm.unit_cost::float' : 'NULL'} AS "unitCost" FROM inventory_movements m JOIN app_users u ON u.id=m.created_by WHERE product_id=$1 ORDER BY m.id DESC LIMIT 21 OFFSET $2`,
        [id, page * 20],
      )
    ).rows
    return { items: rows.slice(0, 20), hasNext: rows.length > 20 }
  }
  async orderCatalog(actor: AppUser, id: number) {
    this.require(actor, 'orders.products')
    await new CustomerService(this.db, this.work).authorizeOrder(actor, id)
    return (
      await this.query(
        `SELECT p.id,p.name,p.kind,p.stock,p.sale_price::float AS "salePrice" FROM inventory_products p JOIN inventory_suppliers s ON s.id=p.supplier_id WHERE p.active AND s.active AND p.stock>0 ORDER BY lower(p.name),p.id`,
      )
    ).rows
  }
  async sell(
    actor: AppUser,
    id: number,
    d: z.infer<typeof OrderProductSchema>,
  ) {
    this.require(actor, 'orders.products')
    this.require(actor, 'orders.consumptions')
    return this.transaction(async (c) => {
      const order = await new CustomerService(
        this.db,
        this.work,
      ).authorizeOrder(actor, id, c, true, true)
      const existing = (
        await c.query(
          'SELECT * FROM order_consumptions WHERE schedule_id=$1 AND request_key=$2',
          [id, d.requestKey],
        )
      ).rows[0]
      if (existing) {
        if (
          existing.product_id !== d.productId ||
          existing.quantity !== d.quantity
        )
          bookingError('Request key used for another item.', 409)
        return { id: existing.id }
      }
      if (
        !['awaiting_deposit', 'confirmed', 'in_progress'].includes(order.status)
      )
        bookingError('Order is closed for product sales.', 409)
      const p = (
        await c.query(
          'SELECT p.*,s.active AS supplier_active FROM inventory_products p JOIN inventory_suppliers s ON s.id=p.supplier_id WHERE p.id=$1 FOR UPDATE OF p',
          [d.productId],
        )
      ).rows[0]
      if (!p || !p.active || !p.supplier_active)
        bookingError('Product is unavailable.', 409)
      if (p.stock < d.quantity) bookingError('Insufficient stock.', 409)
      const line = (
        await c.query(
          `INSERT INTO order_consumptions(schedule_id,description,quantity,unit_price,request_key,created_by,product_id,product_kind,supplier_id,supplier_percent,acquisition_cost,supplier_cents)
    VALUES($1,$2,$3::integer,$4::numeric,$5,$6,$7,$8,$9,$10::numeric,$11,round($3::integer*$4::numeric*$10::numeric)::bigint) RETURNING id`,
          [
            id,
            p.name,
            d.quantity,
            p.sale_price,
            d.requestKey,
            actor.id,
            p.id,
            p.kind,
            p.supplier_id,
            p.supplier_percent,
            p.acquisition_cost,
          ],
        )
      ).rows[0]
      await c.query(
        'UPDATE inventory_products SET stock=stock-$2,updated_at=now() WHERE id=$1',
        [p.id, d.quantity],
      )
      await c.query(
        'INSERT INTO inventory_movements(product_id,quantity,kind,reason,unit_cost,order_item_id,request_key,created_by) VALUES($1,-$2::integer,$3,$4,$5,$6,$7,$8)',
        [
          p.id,
          d.quantity,
          p.kind === 'courtesy' ? 'courtesy' : 'sale',
          `Comanda #${id}`,
          p.acquisition_cost,
          line.id,
          d.requestKey,
          actor.id,
        ],
      )
      await recognizeProducts(c, id, actor.id)
      return line
    })
  }
  async report(
    actor: AppUser,
    period: string,
    supplierId: number | undefined,
    page: number,
  ) {
    this.finance(actor)
    const args = [period + '-01', supplierId ?? null]
    const summary = (
      await this.query(
        `SELECT s.id,s.name,
   COALESCE((SELECT sum(amount_cents) FROM inventory_supplier_entries WHERE supplier_id=s.id AND created_at>=($1::date::timestamp AT TIME ZONE 'America/Sao_Paulo') AND created_at<(($1::date+interval '1 month')::timestamp AT TIME ZONE 'America/Sao_Paulo')),0)::text AS "periodDueCents",
   COALESCE((SELECT sum(gross_cents) FROM inventory_supplier_entries WHERE supplier_id=s.id AND kind IN ('consignment','reversal') AND created_at>=($1::date::timestamp AT TIME ZONE 'America/Sao_Paulo') AND created_at<(($1::date+interval '1 month')::timestamp AT TIME ZONE 'America/Sao_Paulo')),0)::text AS "grossCents",
   COALESCE((SELECT sum(amount_cents) FROM inventory_supplier_entries WHERE supplier_id=s.id AND kind IN ('consignment','reversal') AND created_at>=($1::date::timestamp AT TIME ZONE 'America/Sao_Paulo') AND created_at<(($1::date+interval '1 month')::timestamp AT TIME ZONE 'America/Sao_Paulo')),0)::text AS "consignmentCents",
   COALESCE((SELECT sum(amount_cents) FROM inventory_supplier_payments WHERE supplier_id=s.id AND period=$1::date),0)::text AS "paidCents",
   ((SELECT COALESCE(sum(amount_cents),0) FROM inventory_supplier_entries WHERE supplier_id=s.id AND created_at<(($1::date+interval '1 month')::timestamp AT TIME ZONE 'America/Sao_Paulo'))-(SELECT COALESCE(sum(amount_cents),0) FROM inventory_supplier_payments WHERE supplier_id=s.id))::text AS "balanceCents",
   (SELECT count(*)::int FROM order_consumptions WHERE supplier_id=s.id AND product_kind='consigned' AND voided_at IS NULL AND recognized_at IS NULL) AS "unpaidItems"
   FROM inventory_suppliers s WHERE ($2::int IS NULL OR s.id=$2) ORDER BY s.name,s.id LIMIT 21 OFFSET $3`,
        [...args, page * 20],
      )
    ).rows
    return { items: summary.slice(0, 20), hasNext: summary.length > 20 }
  }
  async statement(actor: AppUser, id: number, period: string, page: number) {
    this.finance(actor)
    return this.transaction(async (c) => {
      const rows = (
        await c.query(
          `SELECT e.id,e.kind,e.amount_cents::text AS "amountCents",e.gross_cents::text AS "grossCents",e.description,e.created_at AS "createdAt",x.schedule_id AS "orderId",COALESCE(x.quantity,m.quantity) AS quantity,x.supplier_percent::float AS "supplierPercent",u.login AS author FROM inventory_supplier_entries e LEFT JOIN order_consumptions x ON x.id=e.order_item_id LEFT JOIN inventory_movements m ON m.id=e.movement_id JOIN app_users u ON u.id=e.created_by WHERE e.supplier_id=$1 AND e.created_at>=($2::date::timestamp AT TIME ZONE 'America/Sao_Paulo') AND e.created_at<(($2::date+interval '1 month')::timestamp AT TIME ZONE 'America/Sao_Paulo') ORDER BY e.id DESC LIMIT 21 OFFSET $3`,
          [id, period + '-01', page * 20],
        )
      ).rows
      const payments = (
        await c.query(
          `SELECT p.id,p.amount_cents::text AS "amountCents",p.description,p.created_at AS "createdAt",u.login AS author,m.name AS method FROM inventory_supplier_payments p JOIN app_users u ON u.id=p.created_by JOIN salon_transactions t ON t.id=p.transaction_id JOIN payment_methods m ON m.id=t.method_id WHERE p.supplier_id=$1 AND p.period=$2::date ORDER BY p.id DESC LIMIT 21 OFFSET $3`,
          [id, period + '-01', page * 20],
        )
      ).rows
      return {
        items: rows.slice(0, 20),
        hasNext: rows.length > 20,
        payments: payments.slice(0, 20),
        paymentsHasNext: payments.length > 20,
      }
    })
  }
  async settle(actor: AppUser, d: z.infer<typeof SettlementSchema>) {
    this.finance(actor)
    return this.transaction(async (c) => {
      if (
        !(
          await c.query('SELECT id FROM inventory_suppliers WHERE id=$1', [
            d.supplierId,
          ])
        ).rows.length
      )
        bookingError('Supplier not found.', 404)
      await c.query('SELECT pg_advisory_xact_lock(70435,$1)', [d.supplierId])
      const previous = (
        await c.query(
          'SELECT p.*,t.method_id FROM inventory_supplier_payments p JOIN salon_transactions t ON t.id=p.transaction_id WHERE p.request_key=$1',
          [d.requestKey],
        )
      ).rows[0]
      const cents = Math.round(d.amount * 100)
      if (previous) {
        if (
          previous.supplier_id !== d.supplierId ||
          String(
            previous.period.toISOString?.().slice(0, 7) ?? previous.period,
          ).slice(0, 7) !== d.period ||
          Number(previous.amount_cents) !== cents ||
          previous.description !== d.description ||
          previous.method_id !== d.methodId
        )
          bookingError('Request key used for another supplier payment.', 409)
        return { id: previous.id }
      }
      const balance = (
        await c.query(
          `SELECT (SELECT COALESCE(sum(amount_cents),0) FROM inventory_supplier_entries WHERE supplier_id=$1 AND created_at<(($2::date+interval '1 month')::timestamp AT TIME ZONE 'America/Sao_Paulo'))-(SELECT COALESCE(sum(amount_cents),0) FROM inventory_supplier_payments WHERE supplier_id=$1) AS amount`,
          [d.supplierId, d.period + '-01'],
        )
      ).rows[0]
      if (cents > Number(balance.amount))
        bookingError(
          'Payment exceeds the supplier outstanding balance for this period.',
          409,
        )
      if (
        !(
          await c.query(
            'SELECT id FROM payment_methods WHERE id=$1 AND removed_at IS NULL',
            [d.methodId],
          )
        ).rows.length
      )
        bookingError('Invalid payment method.')
      const transaction = (
        await c.query(
          `INSERT INTO salon_transactions(method_id,type_id,is_debit,description,value,created_at,recorded_by) VALUES($1,(SELECT id FROM transaction_types WHERE name='Pagamento a fornecedor'),true,$2,$3,now(),$4) RETURNING id`,
          [d.methodId, d.description, d.amount, actor.id],
        )
      ).rows[0]
      return (
        await c.query(
          'INSERT INTO inventory_supplier_payments(supplier_id,period,amount_cents,description,request_key,transaction_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
          [
            d.supplierId,
            d.period + '-01',
            cents,
            d.description,
            d.requestKey,
            transaction.id,
            actor.id,
          ],
        )
      ).rows[0]
    })
  }
}
