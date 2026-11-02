-- Membership lifecycle (Phase 3)
--
-- Renewals, upgrades, downgrades and restarts keep using the member's term
-- grid and the plan-change log; no memberships table is added. Each plan
-- change gains:
--   member_plan_changes.change_type  'change' | 'upgrade' | 'downgrade' | 'restart',
--                                    by monthly-equivalent price
--   member_plan_changes.request_id   sent by the Change plan sheet; a retried
--                                    submit returns the first change
--                                    (unique per gym)
--   member_plan_changes.dues_detail  the old-plan terms behind the dues totals:
--                                    collected, waived, or kept as balance due
--
-- Existing rows keep NULL request_id and dues_detail. Their change_type is
-- classified once, from their own old/new snapshots and the gym's cycle
-- setting, when the column is added. No other row is modified.
--
-- backend/schema.sql and migrationService.js already apply this on every boot,
-- so a normal deployment needs nothing here. This file is for hosts where the
-- schema is managed by hand (phpMyAdmin, a DBA-owned database). Run it after
-- 006-payment-transactions.sql.
--
-- Safe to re-run: each column is added only if it's missing, and the type
-- backfill only runs in the same run that adds the column.
-- To reverse: drop uniq_plan_changes_request and the three columns.

SET @add_type := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'member_plan_changes' AND column_name = 'change_type') = 0;

SET @sql := IF(
  @add_type,
  'ALTER TABLE member_plan_changes ADD COLUMN change_type ENUM(''change'', ''upgrade'', ''downgrade'', ''restart'') NOT NULL DEFAULT ''change'' AFTER first_term_collected',
  'SELECT ''member_plan_changes.change_type already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- One month of each plan: a package's fee over its months; a monthly fee is
-- per billing cycle, scaled to 30 days on a custom-day cycle.
SET @sql := IF(
  @add_type,
  'UPDATE member_plan_changes c LEFT JOIN gym_settings s ON s.tenant_id = c.tenant_id
     SET c.change_type = CASE
       WHEN ROUND(IF(c.new_membership_type = ''package'', c.new_fee / GREATEST(c.new_package_months, 1),
                     IF(s.billing_cycle_mode = ''custom-days'', c.new_fee * 30 / GREATEST(s.custom_billing_days, 1), c.new_fee)) * 100)
          > ROUND(IF(c.old_membership_type = ''package'', c.old_fee / GREATEST(c.old_package_months, 1),
                     IF(s.billing_cycle_mode = ''custom-days'', c.old_fee * 30 / GREATEST(s.custom_billing_days, 1), c.old_fee)) * 100)
         THEN ''upgrade''
       WHEN ROUND(IF(c.new_membership_type = ''package'', c.new_fee / GREATEST(c.new_package_months, 1),
                     IF(s.billing_cycle_mode = ''custom-days'', c.new_fee * 30 / GREATEST(s.custom_billing_days, 1), c.new_fee)) * 100)
          < ROUND(IF(c.old_membership_type = ''package'', c.old_fee / GREATEST(c.old_package_months, 1),
                     IF(s.billing_cycle_mode = ''custom-days'', c.old_fee * 30 / GREATEST(s.custom_billing_days, 1), c.old_fee)) * 100)
         THEN ''downgrade''
       ELSE ''change'' END
     WHERE c.change_type = ''change''',
  'SELECT ''member_plan_changes.change_type already classified'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'member_plan_changes' AND column_name = 'request_id') = 0,
  'ALTER TABLE member_plan_changes ADD COLUMN request_id CHAR(36) NULL DEFAULT NULL AFTER change_type',
  'SELECT ''member_plan_changes.request_id already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'member_plan_changes' AND column_name = 'dues_detail') = 0,
  'ALTER TABLE member_plan_changes ADD COLUMN dues_detail JSON NULL AFTER request_id',
  'SELECT ''member_plan_changes.dues_detail already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'member_plan_changes' AND index_name = 'uniq_plan_changes_request') = 0,
  'ALTER TABLE member_plan_changes ADD UNIQUE KEY uniq_plan_changes_request (tenant_id, request_id)',
  'SELECT ''uniq_plan_changes_request already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
