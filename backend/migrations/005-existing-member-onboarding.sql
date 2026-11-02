-- Existing-member onboarding (Phase 1)
--
-- Members who joined the gym before being entered into GymBoo can be added
-- with their history: each past term marked paid or unpaid, or one opening
-- balance. Adds:
--   members.onboarding_type            'new' (default) or 'existing'
--   members.opening_balance            owed at registration (opening-balance method)
--   members.opening_balance_admission  part of it that is an unpaid admission fee
--   members.billing_cutover            first term billed normally after an opening balance
--   payments.date_known                0 = collection date not recorded
--
-- Every existing row keeps the defaults ('new', 0, 0, NULL, 1), which is
-- exactly how it is billed and reported today. No existing row is modified.
--
-- backend/schema.sql and migrationService.js already apply this on every boot,
-- so a normal deployment needs nothing here. This file is for hosts where the
-- schema is managed by hand (phpMyAdmin, a DBA-owned database).
--
-- Safe to re-run: each column is added only if it's missing.
-- To reverse: drop the five columns (nothing else depends on them).

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'members' AND column_name = 'onboarding_type') = 0,
  'ALTER TABLE members ADD COLUMN onboarding_type ENUM(''new'', ''existing'') NOT NULL DEFAULT ''new'' AFTER plan_start_date',
  'SELECT ''members.onboarding_type already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'members' AND column_name = 'opening_balance') = 0,
  'ALTER TABLE members ADD COLUMN opening_balance DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER onboarding_type',
  'SELECT ''members.opening_balance already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'members' AND column_name = 'opening_balance_admission') = 0,
  'ALTER TABLE members ADD COLUMN opening_balance_admission DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER opening_balance',
  'SELECT ''members.opening_balance_admission already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'members' AND column_name = 'billing_cutover') = 0,
  'ALTER TABLE members ADD COLUMN billing_cutover DATE NULL DEFAULT NULL AFTER opening_balance_admission',
  'SELECT ''members.billing_cutover already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'payments' AND column_name = 'date_known') = 0,
  'ALTER TABLE payments ADD COLUMN date_known TINYINT(1) NOT NULL DEFAULT 1 AFTER payment_mode',
  'SELECT ''payments.date_known already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
