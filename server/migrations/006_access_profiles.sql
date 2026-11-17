ALTER TABLE app_users ADD COLUMN role text NOT NULL DEFAULT 'OPERATIONAL' CHECK(role IN ('MASTER','ADMIN','OPERATIONAL'));
UPDATE app_users SET role=CASE WHEN is_admin THEN 'ADMIN' ELSE 'OPERATIONAL' END;
-- Preserve compatibility with existing bootstrap scripts while keeping the explicit role authoritative.
CREATE FUNCTION sync_user_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' AND NEW.is_admin AND NEW.role='OPERATIONAL' THEN NEW.role='ADMIN'; END IF;
 IF TG_OP='UPDATE' AND NEW.role=OLD.role AND NEW.is_admin<>OLD.is_admin AND NEW.role<>'MASTER' THEN
  NEW.role=CASE WHEN NEW.is_admin THEN 'ADMIN' ELSE 'OPERATIONAL' END;
 END IF;
 NEW.is_admin=NEW.role IN ('ADMIN','MASTER');
 RETURN NEW;
END $$;
CREATE TRIGGER sync_user_role BEFORE INSERT OR UPDATE OF role,is_admin ON app_users FOR EACH ROW EXECUTE FUNCTION sync_user_role();
UPDATE app_users SET role='MASTER' WHERE id=NULLIF(current_setting('vick.master_user_id',true),'')::integer;
CREATE TABLE access_profiles(role text PRIMARY KEY CHECK(role IN ('ADMIN','OPERATIONAL')), version integer NOT NULL DEFAULT 1);
INSERT INTO access_profiles(role) VALUES('ADMIN'),('OPERATIONAL');
CREATE TABLE profile_permissions(role text NOT NULL REFERENCES access_profiles(role),permission_key text NOT NULL,allowed boolean NOT NULL,delegatable boolean NOT NULL DEFAULT false,PRIMARY KEY(role,permission_key));
INSERT INTO profile_permissions(role,permission_key,allowed,delegatable)
 SELECT role,key,CASE WHEN role='ADMIN' THEN true ELSE operational END,role='OPERATIONAL' AND operational
 FROM access_profiles CROSS JOIN (VALUES
 ('agenda.view',true),('agenda.create',true),('agenda.change',true),('agenda.deposit',true),('agenda.complete',true),
 ('orders.view',true),('orders.consumptions',true),('orders.notes',true),('orders.payments',true),('orders.refunds',false),
 ('clients.view',true),('clients.edit',false),('clients.notes',false),('clients.financial',true),('birthdays.view',true),
 ('promotions.view',false),('promotions.manage',false),('packages.payments',false),('finance.view',true),('finance.manage',false),
 ('employees.view',false),('employees.manage',false),('services.view',true),('services.manage',false),('services.status',false),
 ('booking.settings',false),('users.view',false),('users.passwords',false),('staff.permissions',false)
 ) AS permissions(key,operational);
CREATE TABLE user_permission_overrides(user_id integer NOT NULL REFERENCES app_users(id),permission_key text NOT NULL,allowed boolean NOT NULL,updated_by integer NOT NULL REFERENCES app_users(id),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,permission_key));
CREATE TABLE access_audit(id bigserial PRIMARY KEY,actor_id integer NOT NULL REFERENCES app_users(id),target_user_id integer REFERENCES app_users(id),target_role text,action text NOT NULL,previous_data jsonb NOT NULL,current_data jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX access_audit_user ON access_audit(target_user_id,id);
CREATE UNIQUE INDEX financial_manual_request ON salon_transactions(recorded_by,request_key) WHERE order_id IS NULL AND request_key IS NOT NULL;
CREATE INDEX financial_entry_date ON salon_transactions(created_at DESC,id DESC);
