-- Other payments
--
-- Extra money taken from a member while their fees are up to date: supplements,
-- a part payment, anything that is not a membership term or the admission fee.
-- Adds:
--   payments.kind  gains the value 'other'
--   payments.note  what the payment was for (required for 'other' rows)
--
-- backend/schema.sql and migrationService.js already apply this on every boot,
-- so a normal deployment needs nothing here. This file is for hosts where the
-- schema is managed by hand (phpMyAdmin, a DBA-owned database).
--
-- Every existing row keeps its kind and gets an empty note. Safe to re-run
-- the MODIFY; add the column only if it is missing.

ALTER TABLE payments MODIFY COLUMN kind ENUM('membership', 'admission', 'other') NOT NULL DEFAULT 'membership';
ALTER TABLE payments ADD COLUMN note VARCHAR(160) NOT NULL DEFAULT '' AFTER date_known;

-- To reverse: DELETE the 'other' rows (or move them), then MODIFY kind back
-- to ENUM('membership', 'admission') and DROP COLUMN note.
