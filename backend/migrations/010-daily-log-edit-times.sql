-- Daily Log edit times
--
-- The Daily Log (admin app sidebar) is rebuilt from timestamps the records
-- already carry; there is no log table. Payments and expenses had no edit
-- time, so their edits could not be shown. Adds:
--   payments.updated_at  last time the row was edited (NULL until then)
--   expenses.updated_at  last time the row was edited (NULL until then)
--
-- backend/schema.sql and migrationService.js already apply this on every boot,
-- so a normal deployment needs nothing here. This file is for hosts where the
-- schema is managed by hand (phpMyAdmin, a DBA-owned database).
--
-- Existing rows start at NULL on purpose, so they don't all show as edited on
-- the day this runs. Add each column only if it is missing.

ALTER TABLE payments ADD COLUMN updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP AFTER created_at;
ALTER TABLE expenses ADD COLUMN updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

-- To reverse: ALTER TABLE payments DROP COLUMN updated_at;
--             ALTER TABLE expenses DROP COLUMN updated_at;
