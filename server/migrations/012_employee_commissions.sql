ALTER TABLE employees ADD COLUMN commission_version integer NOT NULL DEFAULT 1;
CREATE TABLE employee_commission_rates (
 employee_id integer NOT NULL REFERENCES employees(id),treatment_id integer NOT NULL REFERENCES salon_treatments(id),
 standard_percent numeric(5,2) CHECK(standard_percent BETWEEN 0 AND 100),package_percent numeric(5,2) CHECK(package_percent BETWEEN 0 AND 100),
 updated_by integer NOT NULL REFERENCES app_users(id),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(employee_id,treatment_id)
);
CREATE TABLE employee_commission_rate_audit (
 id bigserial PRIMARY KEY,employee_id integer NOT NULL REFERENCES employees(id),previous_data jsonb NOT NULL,current_data jsonb NOT NULL,
 created_by integer NOT NULL REFERENCES app_users(id),created_at timestamptz NOT NULL DEFAULT now()
);
-- Finance installations may already store the pre-discount value in this column.
ALTER TABLE salon_schedule_treatments ADD COLUMN IF NOT EXISTS gross_price numeric(12,2);
UPDATE salon_schedule_treatments SET gross_price=price WHERE gross_price IS NULL;
ALTER TABLE salon_schedule_treatments ADD CONSTRAINT commission_gross_nonnegative CHECK(gross_price>=0);
CREATE FUNCTION snapshot_commission_gross() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='INSERT' THEN NEW.gross_price=COALESCE(NEW.gross_price,NEW.price);ELSE NEW.gross_price=OLD.gross_price;END IF; RETURN NEW;
END $$;
CREATE TRIGGER snapshot_commission_gross BEFORE INSERT OR UPDATE ON salon_schedule_treatments FOR EACH ROW EXECUTE FUNCTION snapshot_commission_gross();
ALTER TABLE salon_transactions ADD COLUMN refund_scope text NOT NULL DEFAULT 'proportional' CHECK(refund_scope IN ('proportional','services','extras'));
ALTER TABLE salon_schedules ADD COLUMN annulled_at timestamptz,ADD COLUMN annulled_by integer REFERENCES app_users(id),ADD COLUMN annulment_reason text;
CREATE TABLE commission_closings (
 id bigserial PRIMARY KEY,employee_id integer NOT NULL REFERENCES employees(id),amount numeric(12,2) NOT NULL CHECK(amount>=0),
 description text NOT NULL,request_key uuid NOT NULL,fingerprint text NOT NULL,created_by integer NOT NULL REFERENCES app_users(id),created_at timestamptz NOT NULL DEFAULT now(),
 transaction_id integer UNIQUE REFERENCES salon_transactions(id),UNIQUE(employee_id,request_key)
);
CREATE TABLE employee_commissions (
 id bigserial PRIMARY KEY,schedule_treatment_id integer NOT NULL UNIQUE REFERENCES salon_schedule_treatments(id),schedule_id integer NOT NULL REFERENCES salon_schedules(id),
 employee_id integer NOT NULL REFERENCES employees(id),treatment_id integer NOT NULL REFERENCES salon_treatments(id),treatment_name text NOT NULL,
 is_package boolean NOT NULL,gross_amount numeric(12,2) NOT NULL CHECK(gross_amount>=0),percent numeric(5,2) NOT NULL CHECK(percent BETWEEN 0 AND 100),
 amount numeric(12,2) NOT NULL CHECK(amount>=0),recognized_at timestamptz NOT NULL DEFAULT now(),created_by integer REFERENCES app_users(id),
 closing_id bigint REFERENCES commission_closings(id)
);
CREATE INDEX commissions_employee_date ON employee_commissions(employee_id,recognized_at DESC,id DESC);
CREATE TABLE employee_commission_adjustments (
 id bigserial PRIMARY KEY,commission_id bigint NOT NULL REFERENCES employee_commissions(id),kind text NOT NULL CHECK(kind IN ('refund','annulment')),
 amount numeric(12,2) NOT NULL CHECK(amount>0),reason text NOT NULL,source_refund_id integer REFERENCES salon_transactions(id),
 created_by integer REFERENCES app_users(id),created_at timestamptz NOT NULL DEFAULT now(),closing_id bigint REFERENCES commission_closings(id)
);
CREATE UNIQUE INDEX commission_refund_once ON employee_commission_adjustments(commission_id,source_refund_id) WHERE source_refund_id IS NOT NULL;
CREATE UNIQUE INDEX commission_annul_once ON employee_commission_adjustments(commission_id) WHERE kind='annulment';
CREATE INDEX commission_adjustments_entry ON employee_commission_adjustments(commission_id,id);
INSERT INTO transaction_types(name,description,created_at) VALUES('Pagamento de comissões','Pagamento manual de fechamento de comissões',now()) ON CONFLICT(name) DO NOTHING;

CREATE FUNCTION lock_commission_order(order_id integer) RETURNS void LANGUAGE plpgsql AS $$ DECLARE employee integer; BEGIN
 FOR employee IN SELECT DISTINCT employee_id FROM salon_schedule_treatments WHERE schedule_id=order_id ORDER BY employee_id LOOP PERFORM pg_advisory_xact_lock(70450,employee); END LOOP;
END $$;
CREATE FUNCTION adjust_order_commissions(order_id integer,refund_id integer,actor integer,note text,annul boolean DEFAULT false) RETURNS void LANGUAGE plpgsql AS $$
DECLARE item employee_commissions%ROWTYPE; service_sale numeric; extras_sale numeric; returned numeric; desired numeric; already numeric; delta numeric; packaged boolean;
BEGIN
 PERFORM lock_commission_order(order_id);
 SELECT s.package_use_id IS NOT NULL,COALESCE(s.total_price,(SELECT sum(price) FROM salon_schedule_treatments WHERE schedule_id=s.id),0),
 (SELECT COALESCE(sum(quantity*unit_price),0) FROM order_consumptions WHERE schedule_id=s.id)
 INTO packaged,service_sale,extras_sale FROM salon_schedules s WHERE s.id=order_id;
 IF packaged THEN
  SELECT COALESCE(sum(value),0) INTO returned FROM salon_transactions WHERE salon_transactions.order_id=adjust_order_commissions.order_id AND ledger_kind='refund' AND package_receipt_id IS NOT NULL;
 ELSE
  SELECT COALESCE(sum(CASE refund_scope WHEN 'extras' THEN 0 WHEN 'services' THEN value ELSE value*service_sale/NULLIF(service_sale+extras_sale,0) END),0)
  INTO returned FROM salon_transactions WHERE salon_transactions.order_id=adjust_order_commissions.order_id AND ledger_kind='refund';
 END IF;
 FOR item IN SELECT * FROM employee_commissions WHERE schedule_id=order_id ORDER BY id FOR UPDATE LOOP
  desired=CASE WHEN annul THEN item.amount WHEN service_sale>0 THEN round(item.amount*LEAST(GREATEST(returned/service_sale,0),1),2) ELSE 0 END;
  SELECT COALESCE(sum(amount),0) INTO already FROM employee_commission_adjustments WHERE commission_id=item.id;
  delta=GREATEST(LEAST(desired,item.amount)-already,0);
  IF delta>0 THEN INSERT INTO employee_commission_adjustments(commission_id,kind,amount,reason,source_refund_id,created_by)
   VALUES(item.id,CASE WHEN annul THEN 'annulment' ELSE 'refund' END,delta,note,refund_id,actor) ON CONFLICT DO NOTHING;END IF;
 END LOOP;
END $$;
CREATE FUNCTION recognize_employee_commissions() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE row record; rate record; BEGIN
 IF NEW.status='completed' AND OLD.status<>'completed' THEN
  PERFORM lock_commission_order(NEW.id);
  FOR row IN SELECT st.* FROM salon_schedule_treatments st WHERE schedule_id=NEW.id ORDER BY st.id LOOP
   SELECT * INTO rate FROM employee_commission_rates WHERE employee_id=row.employee_id AND treatment_id=row.treatment_id FOR SHARE;
   IF NOT FOUND OR rate.standard_percent IS NULL OR rate.package_percent IS NULL THEN RAISE EXCEPTION 'Configure employee commission percentages before completing this appointment.' USING ERRCODE='P0001';END IF;
   INSERT INTO employee_commissions(schedule_treatment_id,schedule_id,employee_id,treatment_id,treatment_name,is_package,gross_amount,percent,amount,created_by)
   VALUES(row.id,NEW.id,row.employee_id,row.treatment_id,row.treatment_name,NEW.package_use_id IS NOT NULL,COALESCE(row.gross_price,row.price),
   CASE WHEN NEW.package_use_id IS NULL THEN rate.standard_percent ELSE rate.package_percent END,
   round(COALESCE(row.gross_price,row.price)*(CASE WHEN NEW.package_use_id IS NULL THEN rate.standard_percent ELSE rate.package_percent END)/100,2),NEW.completed_by)
   ON CONFLICT(schedule_treatment_id) DO NOTHING;
  END LOOP;
  PERFORM adjust_order_commissions(NEW.id,NULL,NEW.completed_by,'Devoluções registradas antes da conclusão');
 ELSIF OLD.status='completed' AND NEW.status='cancelled' THEN
  PERFORM adjust_order_commissions(NEW.id,NULL,NEW.annulled_by,COALESCE(NEW.annulment_reason,NEW.cancellation_reason,'Atendimento anulado'),true);
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER recognize_employee_commissions AFTER UPDATE OF status ON salon_schedules FOR EACH ROW EXECUTE FUNCTION recognize_employee_commissions();
CREATE FUNCTION refund_employee_commissions() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.ledger_kind='refund' AND NEW.order_id IS NOT NULL THEN PERFORM adjust_order_commissions(NEW.order_id,NEW.id,NEW.recorded_by,NEW.description);END IF;RETURN NEW;
END $$;
CREATE TRIGGER refund_employee_commissions AFTER INSERT ON salon_transactions FOR EACH ROW EXECUTE FUNCTION refund_employee_commissions();
INSERT INTO profile_permissions(role,permission_key,allowed,delegatable)
 SELECT role,key,role='ADMIN' OR operational,role='OPERATIONAL' AND operational FROM access_profiles CROSS JOIN
 (VALUES('commissions.view',true),('commissions.manage',false),('commissions.adjust',false),('commissions.settle',false)) permissions(key,operational);
