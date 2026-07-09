-- MySQL schema for the gym admin/check-in app.
-- Images are stored locally in backend/uploads for now; tables store their public /uploads/... paths.

CREATE TABLE IF NOT EXISTS app_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  gym_name VARCHAR(160) NOT NULL DEFAULT 'Gym Admin',
  logo VARCHAR(512) NOT NULL DEFAULT '',
  billing_cycle_mode ENUM('month-start', '30-days', 'custom-days') NOT NULL DEFAULT 'month-start',
  custom_billing_days INT UNSIGNED NOT NULL DEFAULT 25,
  theme JSON NULL,
  attendance_revision INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT app_settings_single_row CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS members (
  id CHAR(36) NOT NULL PRIMARY KEY,
  gym_id VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  phone VARCHAR(30) NOT NULL UNIQUE,
  address TEXT NOT NULL,
  fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  membership_type ENUM('monthly', 'package') NOT NULL DEFAULT 'monthly',
  package_months INT UNSIGNED NOT NULL DEFAULT 1,
  start_date DATE NOT NULL,
  photo VARCHAR(512) NOT NULL DEFAULT '',
  created_at VARCHAR(32) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_members_name (name),
  INDEX idx_members_phone (phone)
);

CREATE TABLE IF NOT EXISTS attendance (
  member_id CHAR(36) NOT NULL,
  attendance_date DATE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (member_id, attendance_date),
  CONSTRAINT fk_attendance_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  INDEX idx_attendance_date (attendance_date)
);

CREATE TABLE IF NOT EXISTS checkins (
  id CHAR(36) NOT NULL PRIMARY KEY,
  member_id CHAR(36) NOT NULL,
  gym_id VARCHAR(40) NOT NULL,
  member_name VARCHAR(160) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  checkin_date DATE NOT NULL,
  checkin_time VARCHAR(32) NOT NULL,
  CONSTRAINT fk_checkins_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_checkin_member_date (member_id, checkin_date),
  INDEX idx_checkins_date (checkin_date),
  INDEX idx_checkins_time (checkin_time)
);

CREATE TABLE IF NOT EXISTS payments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  member_id CHAR(36) NOT NULL,
  payment_date DATE NOT NULL,
  month_key VARCHAR(7) NOT NULL,
  billing_month VARCHAR(7) NOT NULL DEFAULT '',
  billing_period VARCHAR(20) NOT NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_payments_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  INDEX idx_payments_member_date (member_id, payment_date),
  INDEX idx_payments_billing_period (billing_period)
);
