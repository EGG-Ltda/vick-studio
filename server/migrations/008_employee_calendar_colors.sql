ALTER TABLE app_users ADD COLUMN calendar_color varchar(7) NOT NULL DEFAULT '#A51545' CONSTRAINT app_users_calendar_color_hex CHECK (calendar_color ~ '^#[0-9A-Fa-f]{6}$');
