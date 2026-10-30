-- Part payments: payments.period_fee
--
-- A billing period can now be paid in parts (₹500 now, ₹500 with the next
-- payment). Each payment row stores the period's full fee next to the amount
-- taken; the period counts as paid once its rows add up to that fee.
--
-- Existing rows stay NULL, which means "paid this period in full" — every row
-- recorded before this change was a full payment.
--
-- backend/schema.sql and migrationService.js already apply this on every boot,
-- so a normal deployment needs nothing here. This file is for hosts where the
-- schema is managed by hand (phpMyAdmin, a DBA-owned database).
--
-- Safe to re-run: the column is added only if it's missing.

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'payments' AND column_name = 'period_fee') = 0,
  'ALTER TABLE payments ADD COLUMN period_fee DECIMAL(10,2) NULL DEFAULT NULL AFTER amount',
  'SELECT ''payments.period_fee already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
