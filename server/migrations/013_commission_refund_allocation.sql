-- Freeze mixed-order refund attribution using what existed at the original payment.
-- Later consumptions or product returns must not recalculate earlier commission adjustments.
ALTER TABLE salon_transactions ADD COLUMN commission_refund_service_value numeric(18,8);
-- A closing aggregates many appointments and can exceed a single sale's old limit.
ALTER TABLE salon_transactions ALTER COLUMN value TYPE numeric(12,2);
CREATE FUNCTION commission_refund_service_value(refund salon_transactions) RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE sale numeric; extras numeric; paid_at timestamp;
BEGIN
 IF refund.ledger_kind<>'refund' OR refund.order_id IS NULL THEN RETURN NULL; END IF;
 IF refund.refund_scope='extras' THEN RETURN 0; END IF;
 IF refund.refund_scope='services' OR refund.package_receipt_id IS NOT NULL THEN RETURN refund.value; END IF;
 SELECT created_at INTO paid_at FROM salon_transactions WHERE id=refund.refund_of;
 SELECT COALESCE(s.total_price,(SELECT sum(price) FROM salon_schedule_treatments WHERE schedule_id=s.id),0)
 INTO sale FROM salon_schedules s WHERE s.id=refund.order_id;
 SELECT COALESCE(sum(quantity*unit_price),0) INTO extras FROM order_consumptions
 WHERE schedule_id=refund.order_id AND created_at<=COALESCE(paid_at,refund.created_at)
 AND (voided_at IS NULL OR voided_at>COALESCE(paid_at,refund.created_at));
 RETURN COALESCE(refund.value*sale/NULLIF(sale+extras,0),0);
END $$;
UPDATE salon_transactions t SET commission_refund_service_value=commission_refund_service_value(t) WHERE ledger_kind='refund';
CREATE FUNCTION snapshot_commission_refund_allocation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 NEW.commission_refund_service_value=commission_refund_service_value(NEW);RETURN NEW;
END $$;
CREATE TRIGGER snapshot_commission_refund_allocation BEFORE INSERT ON salon_transactions FOR EACH ROW EXECUTE FUNCTION snapshot_commission_refund_allocation();
CREATE OR REPLACE FUNCTION adjust_order_commissions(order_id integer,refund_id integer,actor integer,note text,annul boolean DEFAULT false) RETURNS void LANGUAGE plpgsql AS $$
DECLARE item employee_commissions%ROWTYPE; service_sale numeric; returned numeric; desired numeric; already numeric; delta numeric; packaged boolean;
BEGIN
 PERFORM lock_commission_order(order_id);
 SELECT s.package_use_id IS NOT NULL,COALESCE(s.total_price,(SELECT sum(price) FROM salon_schedule_treatments WHERE schedule_id=s.id),0)
 INTO packaged,service_sale FROM salon_schedules s WHERE s.id=order_id;
 IF packaged THEN
  SELECT COALESCE(sum(value),0) INTO returned FROM salon_transactions WHERE salon_transactions.order_id=adjust_order_commissions.order_id AND ledger_kind='refund' AND package_receipt_id IS NOT NULL;
 ELSE
  SELECT COALESCE(sum(commission_refund_service_value),0) INTO returned FROM salon_transactions WHERE salon_transactions.order_id=adjust_order_commissions.order_id AND ledger_kind='refund';
 END IF;
 FOR item IN SELECT * FROM employee_commissions WHERE schedule_id=order_id ORDER BY id FOR UPDATE LOOP
  desired=CASE WHEN annul THEN item.amount WHEN service_sale>0 THEN round(item.amount*LEAST(GREATEST(returned/service_sale,0),1),2) ELSE 0 END;
  SELECT COALESCE(sum(amount),0) INTO already FROM employee_commission_adjustments WHERE commission_id=item.id;
  delta=GREATEST(LEAST(desired,item.amount)-already,0);
  IF delta>0 THEN INSERT INTO employee_commission_adjustments(commission_id,kind,amount,reason,source_refund_id,created_by)
   VALUES(item.id,CASE WHEN annul THEN 'annulment' ELSE 'refund' END,delta,note,refund_id,actor) ON CONFLICT DO NOTHING;END IF;
 END LOOP;
END $$;
