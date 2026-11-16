ALTER TABLE promotions ADD COLUMN minimum_payment_percent numeric(5,2) CHECK(minimum_payment_percent>0 AND minimum_payment_percent<=100);
ALTER TABLE package_purchases ADD COLUMN minimum_payment_percent numeric(5,2) CHECK(minimum_payment_percent>0 AND minimum_payment_percent<=100), ADD COLUMN booking_plan jsonb;
ALTER TABLE package_uses ADD COLUMN plan_key text;
UPDATE package_purchases p SET booking_plan=(SELECT plan FROM booking_groups g WHERE g.package_purchase_id=p.id ORDER BY g.id LIMIT 1);
UPDATE package_uses u SET plan_key=COALESCE((SELECT node_key FROM booking_group_members m WHERE m.schedule_id=u.schedule_id),'use:'||u.id);
CREATE UNIQUE INDEX package_use_plan_key ON package_uses(purchase_id,plan_key);
ALTER TABLE salon_transactions ADD COLUMN package_use_id integer REFERENCES package_uses(id);
UPDATE salon_transactions t SET package_use_id=s.package_use_id FROM salon_schedules s WHERE s.id=t.order_id AND t.package_receipt_id IS NOT NULL;
CREATE INDEX package_use_receipts ON salon_transactions(package_use_id) WHERE package_receipt_id IS NOT NULL;
CREATE OR REPLACE FUNCTION snapshot_reserved_duration() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN NEW.reserved_duration_minutes=COALESCE(NEW.reserved_duration_minutes,(SELECT duration_minutes FROM salon_treatments WHERE id=NEW.treatment_id));
 ELSE NEW.reserved_duration_minutes=OLD.reserved_duration_minutes; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION snapshot_treatment_name() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN NEW.treatment_name=COALESCE(NEW.treatment_name,(SELECT name FROM salon_treatments WHERE id=NEW.treatment_id));
 ELSE NEW.treatment_name=OLD.treatment_name; END IF;
 RETURN NEW;
END $$;
CREATE TABLE package_reservations (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 purchase_id integer NOT NULL REFERENCES package_purchases(id),
 account_id integer NOT NULL REFERENCES customer_accounts(id),
 group_id integer NOT NULL REFERENCES booking_groups(id),
 request_key uuid NOT NULL, fingerprint text NOT NULL,
 UNIQUE(account_id,request_key)
);
-- Serialize payment/refund operations and execution against the same package header.
CREATE FUNCTION enforce_package_payment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE purchase package_purchases%ROWTYPE; paid numeric;
BEGIN
 IF NEW.package_use_id IS NOT NULL AND NEW.status IN ('in_progress','completed') AND NEW.status IS DISTINCT FROM OLD.status THEN
  SELECT p.* INTO purchase FROM package_purchases p JOIN package_uses u ON u.purchase_id=p.id WHERE u.id=NEW.package_use_id FOR UPDATE OF p;
  SELECT COALESCE(sum(CASE WHEN kind='refund' THEN -amount ELSE amount END),0) INTO paid FROM package_receipts WHERE purchase_id=purchase.id;
  IF purchase.minimum_payment_percent IS NULL THEN
   RAISE EXCEPTION 'Configure the minimum payment for this package before starting or completing appointments.' USING ERRCODE='P0001';
  END IF;
  IF paid<ceil(purchase.price*purchase.minimum_payment_percent)/100 THEN
   RAISE EXCEPTION 'Package minimum payment has not been received.' USING ERRCODE='P0001';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a_package_payment BEFORE UPDATE OF status ON salon_schedules FOR EACH ROW EXECUTE FUNCTION enforce_package_payment();
