-- Move the existing duration to each package; purchased expiration dates remain unchanged.
ALTER TABLE promotions ADD COLUMN validity_months integer;
UPDATE promotions SET validity_months=(SELECT package_validity_months FROM booking_settings WHERE id=true);
ALTER TABLE promotions ALTER COLUMN validity_months SET NOT NULL;
ALTER TABLE promotions ALTER COLUMN validity_months SET DEFAULT 1;
ALTER TABLE promotions ADD CONSTRAINT promotions_validity_months_check CHECK(validity_months BETWEEN 1 AND 24);
ALTER TABLE booking_settings DROP COLUMN package_validity_months;
