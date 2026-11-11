CREATE TABLE treatment_dependencies (
 treatment_id integer NOT NULL REFERENCES salon_treatments(id),
 required_treatment_id integer NOT NULL REFERENCES salon_treatments(id),
 position text NOT NULL CHECK(position IN ('before','after')),
 same_day boolean NOT NULL DEFAULT true,
 consecutive boolean NOT NULL DEFAULT false,
 min_minutes integer NOT NULL DEFAULT 0 CHECK(min_minutes BETWEEN 0 AND 525600),
 max_minutes integer CHECK(max_minutes BETWEEN 0 AND 525600),
 PRIMARY KEY(treatment_id,required_treatment_id),CHECK(treatment_id<>required_treatment_id),
 CHECK(max_minutes IS NULL OR max_minutes>=min_minutes),
 CHECK(NOT consecutive OR (min_minutes=0 AND (max_minutes IS NULL OR max_minutes=0)))
);
CREATE INDEX treatment_dependency_required ON treatment_dependencies(required_treatment_id);
CREATE TABLE booking_groups (
 id serial PRIMARY KEY,account_id integer NOT NULL REFERENCES customer_accounts(id),
 request_key uuid NOT NULL,fingerprint text NOT NULL,plan jsonb NOT NULL,
 package_purchase_id integer REFERENCES package_purchases(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(account_id,request_key)
);
CREATE TABLE booking_group_members (
 group_id integer NOT NULL REFERENCES booking_groups(id),node_key text NOT NULL,
 schedule_id integer NOT NULL UNIQUE REFERENCES salon_schedules(id),
 PRIMARY KEY(group_id,node_key)
);
-- Duration snapshots belong to the reservation and never follow catalog edits.
ALTER TABLE salon_schedule_treatments ADD COLUMN reserved_duration_minutes integer CHECK(reserved_duration_minutes>0);
CREATE FUNCTION snapshot_reserved_duration() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN SELECT duration_minutes INTO NEW.reserved_duration_minutes FROM salon_treatments WHERE id=NEW.treatment_id;
 ELSE NEW.reserved_duration_minutes=OLD.reserved_duration_minutes; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER snapshot_reserved_duration BEFORE INSERT OR UPDATE ON salon_schedule_treatments FOR EACH ROW EXECUTE FUNCTION snapshot_reserved_duration();
