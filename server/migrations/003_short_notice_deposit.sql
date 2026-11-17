ALTER TABLE booking_settings
 ADD COLUMN short_notice_hours integer NOT NULL DEFAULT 2 CHECK(short_notice_hours BETWEEN 1 AND 24);
