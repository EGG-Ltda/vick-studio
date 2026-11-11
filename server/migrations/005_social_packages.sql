ALTER TABLE booking_settings ADD COLUMN package_validity_months integer NOT NULL DEFAULT 1 CHECK(package_validity_months BETWEEN 1 AND 24);
CREATE INDEX persons_birthday ON persons ((extract(month FROM born_at)),(extract(day FROM born_at))) WHERE born_at IS NOT NULL;
CREATE TABLE promotion_art (
 id bigserial PRIMARY KEY, mime text NOT NULL CHECK(mime IN ('image/png','image/jpeg','image/webp')),
 data bytea NOT NULL CHECK(octet_length(data) BETWEEN 12 AND 3145728), created_by integer NOT NULL REFERENCES app_users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE promotions (
 id serial PRIMARY KEY, title text NOT NULL, description text NOT NULL, conditions text NOT NULL,
 art_id bigint NOT NULL REFERENCES promotion_art(id), alt_text text NOT NULL,
 starts_on date NOT NULL, ends_on date NOT NULL CHECK(ends_on>=starts_on), active boolean NOT NULL DEFAULT false,
 price numeric(9,2) NOT NULL CHECK(price>0), created_by integer NOT NULL REFERENCES app_users(id), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE promotion_items (
 promotion_id integer NOT NULL REFERENCES promotions(id), treatment_id integer NOT NULL REFERENCES salon_treatments(id), quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 10),
 PRIMARY KEY(promotion_id,treatment_id)
);
CREATE INDEX promotions_public ON promotions(starts_on,ends_on) WHERE active;
CREATE TABLE package_purchases (
 id serial PRIMARY KEY, customer_id integer NOT NULL REFERENCES customers(id), account_id integer NOT NULL REFERENCES customer_accounts(id), promotion_id integer NOT NULL REFERENCES promotions(id),
 title text NOT NULL, conditions text NOT NULL, price numeric(9,2) NOT NULL CHECK(price>0),
 acquired_at timestamptz NOT NULL DEFAULT now(), valid_until timestamptz NOT NULL,
 request_key uuid NOT NULL, fingerprint text NOT NULL, UNIQUE(account_id,request_key)
);
CREATE INDEX package_customer ON package_purchases(customer_id,id);
CREATE TABLE package_uses (
 id serial PRIMARY KEY, purchase_id integer NOT NULL REFERENCES package_purchases(id), treatment_id integer NOT NULL REFERENCES salon_treatments(id),
 treatment_name text NOT NULL, duration_minutes integer NOT NULL CHECK(duration_minutes>0), price numeric(9,2) NOT NULL CHECK(price>=0),
 schedule_id integer UNIQUE REFERENCES salon_schedules(id), state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','completed','cancelled','no_show','available'))
);
CREATE INDEX package_uses_purchase ON package_uses(purchase_id,id);
ALTER TABLE salon_schedules ADD COLUMN package_use_id integer UNIQUE REFERENCES package_uses(id);
CREATE TABLE schedule_changes (
 id bigserial PRIMARY KEY, schedule_id integer NOT NULL REFERENCES salon_schedules(id), actor_id integer NOT NULL REFERENCES app_users(id),
 action text NOT NULL, reason text NOT NULL, previous_data jsonb NOT NULL, current_data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX schedule_changes_order ON schedule_changes(schedule_id,id);
CREATE UNIQUE INDEX schedule_change_request ON schedule_changes(schedule_id,(current_data->>'requestKey')) WHERE current_data ? 'requestKey';
-- Headers group receipts only. The allocated salon_transactions below are the sole accounting entries.
CREATE TABLE package_receipts (
 id serial PRIMARY KEY, purchase_id integer NOT NULL REFERENCES package_purchases(id), amount numeric(9,2) NOT NULL CHECK(amount>0),
 kind text NOT NULL CHECK(kind IN ('payment','refund')), method_id integer NOT NULL REFERENCES payment_methods(id),
 description text NOT NULL, refund_of integer REFERENCES package_receipts(id), request_key uuid NOT NULL,
 recorded_by integer NOT NULL REFERENCES app_users(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(purchase_id,request_key)
);
ALTER TABLE salon_transactions ADD COLUMN package_receipt_id integer REFERENCES package_receipts(id);
CREATE INDEX package_receipt_entries ON salon_transactions(package_receipt_id);
CREATE FUNCTION complete_package_use() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.package_use_id IS NOT NULL AND NEW.status='completed' AND OLD.status<>'completed' THEN
  IF (SELECT valid_until FROM package_purchases p JOIN package_uses u ON u.purchase_id=p.id WHERE u.id=NEW.package_use_id)<clock_timestamp() THEN
   RAISE EXCEPTION 'Package has expired' USING ERRCODE='23514';
  END IF;
  UPDATE package_uses SET state='completed' WHERE id=NEW.package_use_id AND state='reserved';
  IF NOT FOUND THEN RAISE EXCEPTION 'Package utilization is unavailable' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER complete_package_use BEFORE UPDATE OF status ON salon_schedules FOR EACH ROW EXECUTE FUNCTION complete_package_use();
