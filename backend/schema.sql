-- MySQL schema for the multi-tenant gym admin/check-in app.
-- One server hosts many gyms (tenants). Every tenant-owned row carries tenant_id
-- (FK -> gyms.id). NOTE: members.gym_id is the member's own membership CODE
-- (e.g. GYM1001, printed on the card) and is NOT the tenant id.
-- Images are stored locally in backend/uploads; tables store their /uploads/... paths.

CREATE TABLE IF NOT EXISTS gyms (
  id CHAR(36) NOT NULL PRIMARY KEY,
  slug VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  status ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('super_admin', 'gym_admin', 'staff') NOT NULL DEFAULT 'gym_admin',
  name VARCHAR(160) NOT NULL DEFAULT '',
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  last_login_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_users_email (email),
  INDEX idx_users_tenant (tenant_id),
  CONSTRAINT fk_users_gym FOREIGN KEY (tenant_id) REFERENCES gyms(id) ON DELETE CASCADE
);

-- Per-gym settings (replaces the old single-row app_settings table).
CREATE TABLE IF NOT EXISTS gym_settings (
  tenant_id CHAR(36) NOT NULL PRIMARY KEY,
  gym_name VARCHAR(160) NOT NULL DEFAULT 'Gym Admin',
  logo VARCHAR(512) NOT NULL DEFAULT '',
  billing_cycle_mode ENUM('month-start', '30-days', 'custom-days') NOT NULL DEFAULT '30-days',
  custom_billing_days INT UNSIGNED NOT NULL DEFAULT 25,
  default_collection_timing ENUM('at-join', 'fixed-day') NOT NULL DEFAULT 'at-join',
  weekly_holidays JSON NULL,
  holiday_dates JSON NULL,
  theme JSON NULL,
  attendance_revision INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_gym_settings_gym FOREIGN KEY (tenant_id) REFERENCES gyms(id) ON DELETE CASCADE
);

-- Legacy single-row settings table kept only so existing installs can be migrated
-- into gym_settings on boot. Fresh installs never write to it.
CREATE TABLE IF NOT EXISTS app_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  gym_name VARCHAR(160) NOT NULL DEFAULT 'Gym Admin',
  logo VARCHAR(512) NOT NULL DEFAULT '',
  billing_cycle_mode ENUM('month-start', '30-days', 'custom-days') NOT NULL DEFAULT '30-days',
  custom_billing_days INT UNSIGNED NOT NULL DEFAULT 25,
  default_collection_timing ENUM('at-join', 'fixed-day') NOT NULL DEFAULT 'at-join',
  weekly_holidays JSON NULL,
  holiday_dates JSON NULL,
  theme JSON NULL,
  attendance_revision INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT app_settings_single_row CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS members (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  gym_id VARCHAR(40) NOT NULL,
  name VARCHAR(160) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  address TEXT NOT NULL,
  fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  membership_type ENUM('monthly', 'package') NOT NULL DEFAULT 'monthly',
  package_months INT UNSIGNED NOT NULL DEFAULT 1,
  collection_timing VARCHAR(16) NOT NULL DEFAULT '',
  start_date DATE NOT NULL,
  photo VARCHAR(512) NOT NULL DEFAULT '',
  created_at VARCHAR(32) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_members_tenant_code (tenant_id, gym_id),
  UNIQUE KEY uniq_members_tenant_phone (tenant_id, phone),
  INDEX idx_members_tenant (tenant_id),
  INDEX idx_members_name (name),
  INDEX idx_members_phone (phone),
  CONSTRAINT fk_members_gym FOREIGN KEY (tenant_id) REFERENCES gyms(id) ON DELETE CASCADE
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
  tenant_id CHAR(36) NOT NULL,
  gym_id VARCHAR(40) NOT NULL,
  member_name VARCHAR(160) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  checkin_date DATE NOT NULL,
  checkin_time VARCHAR(32) NOT NULL,
  CONSTRAINT fk_checkins_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_checkin_member_date (member_id, checkin_date),
  INDEX idx_checkins_tenant_date (tenant_id, checkin_date),
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
