-- Member plan changes + gym phone.
--
--   1. members.plan_start_date   where billing counts from after a plan change
--   2. gym_settings.gym_phone    the gym's contact number (signup / Settings)
--   3. member_plan_changes       the plan-change log (Detailed Insights → Plan changes)
--
-- backend/schema.sql and migrationService.js already apply all of this on every
-- boot, so a normal deployment needs nothing here. This file is for hosts where
-- the schema is managed by hand (phpMyAdmin, a DBA-owned database), or to set the
-- database up before the new code goes live.
--
-- Safe to re-run: each column is added only if it's missing, the table only if
-- it doesn't exist. Run it against the app's database (select it first in
-- phpMyAdmin, or `mysql -u USER -p DB_NAME < 002-plan-changes-and-gym-phone.sql`).

-- 1. members.plan_start_date (NULL = plan never changed; billing uses start_date)
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'members' AND column_name = 'plan_start_date') = 0,
  'ALTER TABLE members ADD COLUMN plan_start_date DATE NULL DEFAULT NULL AFTER start_date',
  'SELECT ''members.plan_start_date already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. gym_settings.gym_phone (bare 10 digits, no +91; '' when not given)
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'gym_settings' AND column_name = 'gym_phone') = 0,
  'ALTER TABLE gym_settings ADD COLUMN gym_phone VARCHAR(15) NOT NULL DEFAULT '''' AFTER gym_name',
  'SELECT ''gym_settings.gym_phone already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. The plan-change log. Same definition as backend/schema.sql.
CREATE TABLE IF NOT EXISTS member_plan_changes (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  member_id CHAR(36) NOT NULL,
  member_name VARCHAR(160) NOT NULL DEFAULT '',
  member_code VARCHAR(40) NOT NULL DEFAULT '',
  old_membership_type ENUM('monthly', 'package') NOT NULL,
  old_package_months INT UNSIGNED NOT NULL DEFAULT 1,
  old_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  old_collection_timing VARCHAR(16) NOT NULL DEFAULT '',
  new_membership_type ENUM('monthly', 'package') NOT NULL,
  new_package_months INT UNSIGNED NOT NULL DEFAULT 1,
  new_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  new_collection_timing VARCHAR(16) NOT NULL DEFAULT '',
  -- The day the new plan's first billing period starts.
  effective_date DATE NOT NULL,
  -- Unpaid periods of the old plan before effective_date: collected with the
  -- change, or waived. 0 when there were none.
  dues_collected DECIMAL(10,2) NOT NULL DEFAULT 0,
  dues_waived DECIMAL(10,2) NOT NULL DEFAULT 0,
  -- First term of the new plan, when it was collected with the change.
  first_term_collected DECIMAL(10,2) NOT NULL DEFAULT 0,
  note VARCHAR(200) NOT NULL DEFAULT '',
  changed_by_id VARCHAR(64) NOT NULL DEFAULT '',
  changed_by_name VARCHAR(160) NOT NULL DEFAULT '',
  changed_by_role VARCHAR(32) NOT NULL DEFAULT '',
  -- ISO-8601 UTC timestamp, like members.created_at.
  changed_at VARCHAR(32) NOT NULL,
  INDEX idx_plan_changes_tenant_time (tenant_id, changed_at),
  INDEX idx_plan_changes_member (member_id, changed_at),
  CONSTRAINT fk_plan_changes_gym FOREIGN KEY (tenant_id) REFERENCES gyms(id) ON DELETE CASCADE
);

-- Check: should list plan_start_date, gym_phone and member_plan_changes.
SELECT table_name, column_name FROM information_schema.columns
 WHERE table_schema = DATABASE()
   AND ((table_name = 'members' AND column_name = 'plan_start_date')
     OR (table_name = 'gym_settings' AND column_name = 'gym_phone')
     OR (table_name = 'member_plan_changes' AND column_name = 'id'));
