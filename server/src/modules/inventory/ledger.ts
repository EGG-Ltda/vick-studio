import { IGenericDatabaseClient } from '@/core/db'

// Caller holds the order row lock. Recognize each sale once when the order is paid;
// package receipts cover treatments, while individual receipts cover its extras.
export async function recognizeProducts(
  client: IGenericDatabaseClient,
  orderId: number,
  actorId: number,
) {
  const balance = (
    await client.query(
      `SELECT
 CASE WHEN s.package_use_id IS NULL THEN COALESCE(s.total_price,(SELECT sum(price) FROM salon_schedule_treatments WHERE schedule_id=s.id),0) ELSE 0 END
 +(SELECT COALESCE(sum(quantity*unit_price),0) FROM order_consumptions WHERE schedule_id=s.id AND voided_at IS NULL)
 -(SELECT COALESCE(sum(CASE WHEN ledger_kind='refund' THEN -value ELSE value END),0) FROM salon_transactions WHERE order_id=s.id AND ledger_kind IS NOT NULL AND (s.package_use_id IS NULL OR package_receipt_id IS NULL)) AS balance
 FROM salon_schedules s WHERE s.id=$1`,
      [orderId],
    )
  ).rows[0]
  if (!balance || Number(balance.balance) > 0) return
  const suppliers = (
    await client.query(
      "SELECT DISTINCT supplier_id FROM order_consumptions WHERE schedule_id=$1 AND product_kind='consigned' AND voided_at IS NULL AND recognized_at IS NULL ORDER BY supplier_id",
      [orderId],
    )
  ).rows
  for (const supplier of suppliers)
    await client.query('SELECT pg_advisory_xact_lock(70435,$1)', [
      supplier.supplier_id,
    ])
  await client.query(
    `WITH recognized AS (
 UPDATE order_consumptions SET recognized_at=now() WHERE schedule_id=$1 AND product_kind='consigned' AND voided_at IS NULL AND recognized_at IS NULL RETURNING *
 ) INSERT INTO inventory_supplier_entries(supplier_id,kind,amount_cents,gross_cents,description,order_item_id,created_by)
 SELECT supplier_id,'consignment',supplier_cents,round(quantity*unit_price*100)::bigint,description,id,$2 FROM recognized`,
    [orderId, actorId],
  )
}

export async function reverseProduct(
  client: IGenericDatabaseClient,
  item: any,
  actorId: number,
  reason: string,
  restock: boolean,
) {
  // Product is locked after its order, matching the sale lock order.
  await client.query(
    'SELECT id FROM inventory_products WHERE id=$1 FOR UPDATE',
    [item.product_id],
  )
  if (restock) {
    await client.query(
      'UPDATE inventory_products SET stock=stock+$2,updated_at=now() WHERE id=$1',
      [item.product_id, item.quantity],
    )
    await client.query(
      `INSERT INTO inventory_movements(product_id,quantity,kind,reason,unit_cost,order_item_id,request_key,created_by) VALUES($1,$2,'customer_return',$3,$4,$5,gen_random_uuid(),$6)`,
      [
        item.product_id,
        item.quantity,
        reason,
        item.acquisition_cost ?? 0,
        item.id,
        actorId,
      ],
    )
  }
  if (item.recognized_at) {
    await client.query('SELECT pg_advisory_xact_lock(70435,$1)', [
      item.supplier_id,
    ])
    await client.query(
      `INSERT INTO inventory_supplier_entries(supplier_id,kind,amount_cents,gross_cents,description,order_item_id,created_by) VALUES($1,'reversal',-$2::bigint,-round($3::numeric*$4*100)::bigint,$5,$6,$7)`,
      [
        item.supplier_id,
        item.supplier_cents,
        item.unit_price,
        item.quantity,
        reason,
        item.id,
        actorId,
      ],
    )
  }
}
