ALTER TABLE employee_booking_hours ADD COLUMN lunch_start time;
ALTER TABLE employee_booking_hours ADD CONSTRAINT valid_employee_lunch CHECK(lunch_start IS NULL OR (lunch_start>=opens_at AND extract(epoch FROM lunch_start)+3600<=extract(epoch FROM closes_at) AND lunch_start<='23:00'::time));
CREATE TABLE employee_availability_requests (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 employee_id integer NOT NULL REFERENCES employees(id),
 kind text NOT NULL CHECK(kind IN ('lunch','absence','vacation')),
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL CHECK(ends_at>starts_at),
 baseline_lunch time, reason text NOT NULL CHECK(length(reason) BETWEEN 3 AND 2000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','declined','cancelled')),
 request_key uuid NOT NULL, created_by integer NOT NULL REFERENCES app_users(id),
 created_at timestamptz NOT NULL DEFAULT now(), decided_by integer REFERENCES app_users(id),
 decided_at timestamptz, decision_reason text,
 UNIQUE(employee_id,request_key),
 CHECK(kind<>'lunch' OR ends_at-starts_at=interval '1 hour')
);
CREATE INDEX employee_requests_period ON employee_availability_requests(employee_id,starts_at,ends_at) WHERE status IN ('pending','approved');
CREATE INDEX employee_requests_queue ON employee_availability_requests(status,created_at DESC,id DESC);
CREATE UNIQUE INDEX employee_daily_lunch_change ON employee_availability_requests(employee_id,((starts_at AT TIME ZONE 'America/Sao_Paulo')::date)) WHERE kind='lunch' AND status IN ('pending','approved');
CREATE TABLE employee_availability_events (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 request_id integer REFERENCES employee_availability_requests(id), employee_id integer NOT NULL REFERENCES employees(id),
 actor_id integer NOT NULL REFERENCES app_users(id), action text NOT NULL,
 previous_data jsonb NOT NULL DEFAULT '{}', current_data jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX employee_availability_event_request ON employee_availability_events(request_id,id);
CREATE TABLE employee_availability_notices (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id integer NOT NULL REFERENCES app_users(id), request_id integer NOT NULL REFERENCES employee_availability_requests(id),
 kind text NOT NULL CHECK(kind IN ('review','decision')), body text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz
);
CREATE INDEX employee_notice_unread ON employee_availability_notices(user_id,id DESC) WHERE read_at IS NULL;

-- One source for public slots, staff bookings, packages, reschedules and calendar.
CREATE FUNCTION employee_calendar_blocks(employee integer,period_start timestamptz,period_end timestamptz)
RETURNS TABLE(starts_at timestamptz,ends_at timestamptz,kind text,request_id integer)
LANGUAGE sql STABLE AS $$
 WITH days AS (
 SELECT day::date AS date FROM generate_series((period_start AT TIME ZONE 'America/Sao_Paulo')::date::timestamp,
 (period_end AT TIME ZONE 'America/Sao_Paulo')::date::timestamp,interval '1 day') day
 ), lunches AS (
 SELECT ((d.date+COALESCE((r.starts_at AT TIME ZONE 'America/Sao_Paulo')::time,h.lunch_start)) AT TIME ZONE 'America/Sao_Paulo') AS start,r.id
 FROM days d JOIN employee_booking_hours h ON h.employee_id=employee AND h.weekday=extract(dow FROM d.date)
 LEFT JOIN employee_availability_requests r ON r.employee_id=employee AND r.kind='lunch' AND r.status='approved'
 AND (r.starts_at AT TIME ZONE 'America/Sao_Paulo')::date=d.date
 WHERE h.lunch_start IS NOT NULL
 )
 SELECT l.start,l.start+interval '1 hour','lunch',l.id FROM lunches l
 WHERE l.start<period_end AND l.start+interval '1 hour'>period_start
 AND NOT EXISTS(SELECT 1 FROM employee_availability_requests a WHERE a.employee_id=employee AND a.status='approved' AND a.kind<>'lunch' AND a.starts_at<=l.start AND a.ends_at>=l.start+interval '1 hour')
 UNION ALL
 SELECT r.starts_at,r.ends_at,r.kind,r.id FROM employee_availability_requests r
 WHERE r.employee_id=employee AND r.status='approved' AND r.kind<>'lunch' AND r.starts_at<period_end AND r.ends_at>period_start
$$;
INSERT INTO profile_permissions(role,permission_key,allowed,delegatable)
 SELECT role,key,role='ADMIN' OR operational,role='OPERATIONAL' AND operational
 FROM access_profiles CROSS JOIN (VALUES('availability.view',true),('availability.request',true),('availability.manage',false)) permissions(key,operational);
