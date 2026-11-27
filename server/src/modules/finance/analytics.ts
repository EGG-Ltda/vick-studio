import { IGenericDatabaseClient } from '@/core/db'
import { FinanceFilter, safeMoney } from '@/core/finance'

export type FinancialLine = {
  id: number; source: string; kind: 'procedure' | 'product'; itemId: number;
  item: string; date: string; orderId: number | null; saleId: number | null;
  employeeId: number | null; employee: string; ownerUserId: number;
  customerId: number | null; customer: string; quantity: number;
  grossCents: number; discountCents: number; finalCents: number;
  knownCostCents: number | null; commissionCents: number | null;
  refundCents: number; actualStartedAt: string | null; actualEndedAt: string | null;
  orderTotalCents: number | null;
}

// The same completed items feed insights, reports and exports. A manual record
// replaces its appointment item; it never adds a second realization.
export async function financialLines(client: IGenericDatabaseClient, filter: FinanceFilter, ownerUserId?: number): Promise<FinancialLine[]> {
  const { rows } = await client.query(`WITH procedure_lines AS (
    SELECT COALESCE(f.id,-st.id) AS id,'procedure'::text AS kind,
      'procedure:'||st.id AS source,st.treatment_id AS item_id,
      COALESCE(f.treatment_name,st.treatment_name,t.name) AS item,
      COALESCE(f.performed_on,(COALESCE(s.completed_at,s.schedule_ended_at) AT TIME ZONE 'America/Sao_Paulo')::date) AS day,
      s.id AS order_id,NULL::int AS sale_id,e.id AS employee_id,
      COALESCE(f.employee_name,ep.name) AS employee,e.user_id AS owner_user_id,
      s.customer_id,COALESCE(f.customer_name,cp.name) AS customer,
      COALESCE(f.quantity,1) AS quantity,
      COALESCE(f.gross_cents,round(COALESCE(st.gross_price,st.price)*100)::bigint) AS gross_cents,
      COALESCE(f.discount_cents,round(GREATEST(COALESCE(st.gross_price,st.price)-st.price,0)*100)::bigint) AS discount_cents,
      COALESCE(f.final_cents,round(st.price*100)::bigint) AS final_cents,
      CASE WHEN cm.id IS NOT NULL THEN GREATEST(round(cm.amount*100)::bigint-COALESCE(ca.cents,0),0) END AS cost_cents,
      CASE WHEN cm.id IS NOT NULL THEN GREATEST(round(cm.amount*100)::bigint-COALESCE(ca.cents,0),0) END AS commission_cents,
      f.actual_started_at,f.actual_ended_at
    FROM salon_schedule_treatments st JOIN salon_schedules s ON s.id=st.schedule_id
    JOIN employees e ON e.id=st.employee_id JOIN persons ep ON ep.id=e.person_id
    JOIN customers c ON c.id=s.customer_id JOIN persons cp ON cp.id=c.person_id
    JOIN salon_treatments t ON t.id=st.treatment_id
    LEFT JOIN finance_treatment_records f ON f.schedule_item_id=st.id
    LEFT JOIN employee_commissions cm ON cm.schedule_treatment_id=st.id
    LEFT JOIN LATERAL (SELECT sum(round(amount*100))::bigint AS cents FROM employee_commission_adjustments WHERE commission_id=cm.id) ca ON true
    WHERE s.status='completed' AND s.annulled_at IS NULL AND (f.id IS NULL OR f.status='completed')
  ), product_lines AS (
    SELECT -oc.id AS id,'product'::text AS kind,'inventory:'||COALESCE(oc.product_id,0)||':'||oc.description AS source,
      COALESCE(oc.product_id,0) AS item_id,oc.description AS item,
      (oc.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
      s.id AS order_id,NULL::int AS sale_id,e.id AS employee_id,
      COALESCE(ep.name,u.login||' (sem funcionário vinculado)') AS employee,u.id AS owner_user_id,
      s.customer_id,cp.name AS customer,oc.quantity,
      round(oc.unit_price*oc.quantity*100)::bigint AS gross_cents,0::bigint AS discount_cents,
      round(oc.unit_price*oc.quantity*100)::bigint AS final_cents,
      CASE WHEN oc.product_kind='consigned' THEN oc.supplier_cents
           WHEN oc.product_kind='courtesy' THEN round(oc.acquisition_cost*oc.quantity*100)::bigint END AS cost_cents,
      NULL::bigint AS commission_cents,NULL::timestamptz AS actual_started_at,NULL::timestamptz AS actual_ended_at
    FROM order_consumptions oc JOIN salon_schedules s ON s.id=oc.schedule_id
    JOIN app_users u ON u.id=oc.created_by LEFT JOIN employees e ON e.user_id=u.id
    LEFT JOIN persons ep ON ep.id=e.person_id
    JOIN customers c ON c.id=s.customer_id JOIN persons cp ON cp.id=c.person_id
    WHERE oc.voided_at IS NULL AND s.status='completed' AND s.annulled_at IS NULL
    UNION ALL
    SELECT i.id,'product','legacy:'||i.product_id,i.product_id,i.product_name,sa.sold_on,
      NULL,sa.id,e.id,ep.name,e.user_id,sa.customer_id,COALESCE(cp.name,'Não informado'),i.quantity,
      i.gross_cents,i.discount_cents,i.final_cents,NULL,NULL,NULL,NULL
    FROM salon_product_sale_items i JOIN salon_product_sales sa ON sa.id=i.sale_id
    JOIN employees e ON e.id=sa.employee_id JOIN persons ep ON ep.id=e.person_id
    LEFT JOIN customers c ON c.id=sa.customer_id LEFT JOIN persons cp ON cp.id=c.person_id
    WHERE sa.status='completed'
  ), lines AS (SELECT * FROM procedure_lines UNION ALL SELECT * FROM product_lines),
  totals AS (SELECT order_id,sum(final_cents) AS cents,
    sum(final_cents) FILTER(WHERE kind='procedure') AS service_cents,
    sum(final_cents) FILTER(WHERE kind='product') AS product_cents
    FROM lines WHERE order_id IS NOT NULL GROUP BY order_id),
  refunds AS (SELECT order_id,
    COALESCE(sum(round(abs(value)*100)) FILTER(WHERE refund_scope='proportional'),0) AS proportional,
    COALESCE(sum(round(abs(value)*100)) FILTER(WHERE refund_scope='services'),0) AS services,
    COALESCE(sum(round(abs(value)*100)) FILTER(WHERE refund_scope='extras'),0) AS extras
    FROM salon_transactions WHERE ledger_kind='refund' GROUP BY order_id),
  allocation AS (SELECT l.*,tot.cents AS order_total_cents,
    COALESCE(LEAST(COALESCE(r.proportional,0),tot.cents)*l.final_cents/NULLIF(tot.cents,0),0)
      + CASE WHEN l.kind='procedure' THEN COALESCE(LEAST(COALESCE(r.services,0),tot.service_cents)*l.final_cents/NULLIF(tot.service_cents,0),0)
        ELSE COALESCE(LEAST(COALESCE(r.extras,0),tot.product_cents)*l.final_cents/NULLIF(tot.product_cents,0),0) END AS exact_refund
    FROM lines l LEFT JOIN totals tot ON tot.order_id=l.order_id LEFT JOIN refunds r ON r.order_id=l.order_id),
  resolved AS (SELECT a.*,
    floor(exact_refund)+CASE WHEN row_number() OVER(PARTITION BY order_id ORDER BY exact_refund-floor(exact_refund) DESC,source,id)
      <= round(sum(exact_refund) OVER(PARTITION BY order_id))-sum(floor(exact_refund)) OVER(PARTITION BY order_id)
      THEN 1 ELSE 0 END AS refund_cents
    FROM allocation a)
  SELECT l.id,l.source,l.kind,l.item_id AS "itemId",l.item,to_char(l.day,'YYYY-MM-DD') AS date,
    l.order_id AS "orderId",l.sale_id AS "saleId",l.employee_id AS "employeeId",l.employee,
    l.owner_user_id AS "ownerUserId",l.customer_id AS "customerId",l.customer,l.quantity,
    l.gross_cents AS "grossCents",l.discount_cents AS "discountCents",l.final_cents AS "finalCents",
    l.cost_cents AS "knownCostCents",l.commission_cents AS "commissionCents",
    l.order_total_cents AS "orderTotalCents",
    LEAST(l.final_cents,l.refund_cents)::bigint AS "refundCents",
    l.actual_started_at AS "actualStartedAt",l.actual_ended_at AS "actualEndedAt"
  FROM resolved l
  WHERE l.day BETWEEN $1::date AND $2::date
    AND ($3::int IS NULL OR l.employee_id=$3)
    AND ($4::int IS NULL OR l.kind='product' OR l.item_id=$4)
    AND ($5='' OR strpos(lower(l.employee||' '||l.customer||' '||l.item),lower($5))>0)
    AND ($6::int IS NULL OR l.owner_user_id=$6)
  ORDER BY l.day DESC,l.kind,l.id DESC,l.source`, [filter.start,filter.end,filter.employeeId ?? null,filter.treatmentId ?? null,filter.search,ownerUserId ?? null])
  return rows.map((row: FinancialLine) => ({ ...row,
    grossCents: safeMoney(row.grossCents),discountCents: safeMoney(row.discountCents),finalCents: safeMoney(row.finalCents),
    knownCostCents: row.knownCostCents === null ? null : safeMoney(row.knownCostCents),
    commissionCents: row.commissionCents === null ? null : safeMoney(row.commissionCents),refundCents: safeMoney(row.refundCents),
    orderTotalCents:row.orderTotalCents===null?null:safeMoney(row.orderTotalCents),
    actualStartedAt: row.actualStartedAt ? new Date(row.actualStartedAt).toISOString() : null,
    actualEndedAt: row.actualEndedAt ? new Date(row.actualEndedAt).toISOString() : null,
  }))
}

const sum = (values: number[]) => values.reduce((total, value) => safeMoney(total+value),0)
export function buildInsights(lines: FinancialLine[]) {
  function metrics(rows: FinancialLine[]) {
    const revenueCents=sum(rows.map((r)=>r.finalCents)),refundCents=sum(rows.map((r)=>r.refundCents))
    const knownCostCents=sum(rows.map((r)=>r.knownCostCents ?? 0))
    return { revenueCents,refundCents,knownCostCents,netCents:revenueCents-refundCents,
      contributionCents:revenueCents-refundCents-knownCostCents,
      missingCosts:rows.filter((r)=>r.knownCostCents===null).length,
      quantity:sum(rows.map((r)=>r.quantity)),procedureCount:sum(rows.filter((r)=>r.kind==='procedure').map((r)=>r.quantity)),
      productCount:sum(rows.filter((r)=>r.kind==='product').map((r)=>r.quantity)),
      commissionCents:rows.some((r)=>r.kind==='procedure'&&r.commissionCents===null)?null:sum(rows.map((r)=>r.commissionCents ?? 0)),
      attendanceCount:new Set(rows.filter((r)=>r.orderId!==null).map((r)=>r.orderId)).size }
  }
  function group(key:(row:FinancialLine)=>string, name:(row:FinancialLine)=>string, rows=lines) {
    const groups=new Map<string,FinancialLine[]>()
    for(const row of rows){const id=key(row);groups.set(id,[...(groups.get(id) ?? []),row])}
    return [...groups].map(([id,items])=>({id,name:name(items[0]),...metrics(items)})).sort((a,b)=>b.revenueCents-a.revenueCents||a.name.localeCompare(b.name))
  }
  return { summary:metrics(lines),
    employees:group((r)=>String(r.ownerUserId),(r)=>r.employee),
    procedures:group((r)=>String(r.itemId),(r)=>r.item,lines.filter((r)=>r.kind==='procedure')),
    products:group((r)=>r.source.startsWith('legacy:')?r.source:r.source.split(':').slice(0,2).join(':'),(r)=>r.item,lines.filter((r)=>r.kind==='product')),
    employeeProducts:group((r)=>`${r.ownerUserId}:${r.source.startsWith('legacy:')?r.source:r.source.split(':').slice(0,2).join(':')}`,(r)=>`${r.employee} · ${r.item}`,lines.filter((r)=>r.kind==='product')),
    customers:group((r)=>r.customerId===null?'unidentified':String(r.customerId),(r)=>r.customer),
  }
}

export function financialCsv(lines: FinancialLine[]) {
  const cell=(value:string|number)=>`"${String(value).replace(/^[\s]*[=+@-]/,"'$&").replace(/"/g,'""')}"`
  const money=(value:number)=>(value/100).toFixed(2).replace('.',',')
  const rows: (string|number)[][]=[['Funcionário','Tipo','Produto ou procedimento','Data','Cliente','Quantidade','Valor bruto (R$)','Desconto (R$)','Valor final (R$)','Estorno atribuído (R$)']]
  for(const r of [...lines].sort((a,b)=>a.employee.localeCompare(b.employee)||a.date.localeCompare(b.date)||a.item.localeCompare(b.item)))
    rows.push([r.employee,r.kind==='procedure'?'Procedimento':'Produto',r.item,r.date.split('-').reverse().join('/'),r.customer,r.quantity,money(r.grossCents),money(r.discountCents),money(r.finalCents),money(r.refundCents)])
  return '\uFEFF'+rows.map((row)=>row.map(cell).join(';')).join('\r\n')+'\r\n'
}
