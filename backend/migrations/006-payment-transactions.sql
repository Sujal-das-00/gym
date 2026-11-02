-- Payment transactions (Phase 2)
--
-- Money received is now one payment_transactions row per collection, however
-- many terms it paid; the existing payments rows become its allocations (one
-- per term, or the opening balance). Payments are corrected by reversal plus a
-- linked replacement, never edited or deleted; in-place edits of method,
-- reference and note are logged in payment_corrections.
--
-- Existing data: every membership payment row gets a transaction of its own
-- (same id, amount, date, date_known, mode and entry time) and is linked to
-- it. No amount, date or term changes. Admission rows stay unlinked.
--
-- backend/schema.sql and migrationService.js already apply this on every boot,
-- so a normal deployment needs nothing here. This file is for hosts where the
-- schema is managed by hand (phpMyAdmin, a DBA-owned database). Run it after
-- 005-existing-member-onboarding.sql.
--
-- Safe to re-run. To reverse: drop fk_payments_transaction, the two payments
-- columns and the two new tables.

CREATE TABLE IF NOT EXISTS payment_transactions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  member_id CHAR(36) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  -- When the money was received. With date_known = 0 it was never recorded and
  -- this holds the start of the earliest term paid (reports split it per term).
  collected_on DATE NOT NULL,
  date_known TINYINT(1) NOT NULL DEFAULT 1,
  payment_mode ENUM('cash', 'upi', 'card', 'bank', 'cheque', 'other') NULL DEFAULT NULL,
  reference VARCHAR(80) NOT NULL DEFAULT '',
  note VARCHAR(300) NOT NULL DEFAULT '',
  -- Sent by the Record payment sheet; a retried submit returns the first result.
  request_id CHAR(36) NULL DEFAULT NULL,
  source ENUM('desk', 'join', 'plan_change', 'onboarding', 'correction', 'legacy') NOT NULL DEFAULT 'desk',
  status ENUM('active', 'reversed') NOT NULL DEFAULT 'active',
  reversed_at DATETIME NULL DEFAULT NULL,
  reversed_by_id VARCHAR(64) NULL DEFAULT NULL,
  reversed_by_name VARCHAR(160) NULL DEFAULT NULL,
  reversal_reason VARCHAR(300) NULL DEFAULT NULL,
  -- A correction: the replacement points at the original and back.
  replaces_id CHAR(36) NULL DEFAULT NULL,
  replaced_by_id CHAR(36) NULL DEFAULT NULL,
  -- Who typed it in, and when (created_at). Never the collection date. NULL on
  -- rows made from payments recorded before transactions existed.
  entered_by_id VARCHAR(64) NULL DEFAULT NULL,
  entered_by_name VARCHAR(160) NULL DEFAULT NULL,
  entered_by_role VARCHAR(32) NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_payment_transactions_request (tenant_id, request_id),
  INDEX idx_payment_transactions_member (member_id, collected_on),
  CONSTRAINT fk_payment_transactions_gym FOREIGN KEY (tenant_id) REFERENCES gyms(id) ON DELETE CASCADE,
  CONSTRAINT fk_payment_transactions_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

-- In-place edits of a transaction's method, reference or note, one row per
-- changed field, so the original value is never lost.
CREATE TABLE IF NOT EXISTS payment_corrections (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  transaction_id CHAR(36) NOT NULL,
  field ENUM('mode', 'reference', 'note') NOT NULL,
  old_value VARCHAR(300) NOT NULL DEFAULT '',
  new_value VARCHAR(300) NOT NULL DEFAULT '',
  changed_by_id VARCHAR(64) NOT NULL DEFAULT '',
  changed_by_name VARCHAR(160) NOT NULL DEFAULT '',
  changed_by_role VARCHAR(32) NOT NULL DEFAULT '',
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_payment_corrections_transaction (transaction_id),
  CONSTRAINT fk_payment_corrections_transaction FOREIGN KEY (transaction_id) REFERENCES payment_transactions(id) ON DELETE CASCADE
);

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'payments' AND column_name = 'transaction_id') = 0,
  'ALTER TABLE payments ADD COLUMN transaction_id CHAR(36) NULL DEFAULT NULL AFTER date_known',
  'SELECT ''payments.transaction_id already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'payments' AND column_name = 'reversed_at') = 0,
  'ALTER TABLE payments ADD COLUMN reversed_at DATETIME NULL DEFAULT NULL AFTER transaction_id',
  'SELECT ''payments.reversed_at already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'payments' AND index_name = 'idx_payments_transaction') = 0,
  'ALTER TABLE payments ADD INDEX idx_payments_transaction (transaction_id)',
  'SELECT ''idx_payments_transaction already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.table_constraints
    WHERE table_schema = DATABASE() AND table_name = 'payments' AND constraint_name = 'fk_payments_transaction') = 0,
  'ALTER TABLE payments ADD CONSTRAINT fk_payments_transaction FOREIGN KEY (transaction_id) REFERENCES payment_transactions(id) ON DELETE CASCADE',
  'SELECT ''fk_payments_transaction already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- One transaction per existing membership payment row, then link them.
INSERT INTO payment_transactions (id, tenant_id, member_id, amount, collected_on, date_known, payment_mode, source, created_at)
SELECT p.id, m.tenant_id, p.member_id, p.amount, p.payment_date, p.date_known, p.payment_mode, 'legacy', p.created_at
FROM payments p JOIN members m ON m.id = p.member_id
WHERE p.kind = 'membership' AND p.transaction_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM payment_transactions t WHERE t.id = p.id);

UPDATE payments p JOIN payment_transactions t ON t.id = p.id
SET p.transaction_id = t.id
WHERE p.kind = 'membership' AND p.transaction_id IS NULL;
