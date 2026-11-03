-- Activity history (Phase 4)
--
-- One activity_log row per thing that happened in a gym: members added,
-- edited or removed; payments recorded, edited, corrected or cancelled; plan
-- changes, restarts, waived or kept dues. Written when the action succeeds.
-- Rows are never deleted and never counted as income (money totals read
-- payment_transactions only). Each gym only ever reads its own rows.
--
-- History from before this table existed is rebuilt from the existing
-- records on the next boot (activityService.backfillActivities, once; rows
-- marked backfilled = 1). Edits to member profiles made before Phase 4 were
-- never recorded anywhere, so they can't be rebuilt.
--
-- backend/schema.sql already creates this table on every boot, so a normal
-- deployment needs nothing here. This file is for hosts where the schema is
-- managed by hand (phpMyAdmin, a DBA-owned database). Run it after
-- 007-membership-lifecycle.sql.
--
-- Safe to re-run. To reverse: DROP TABLE activity_log (nothing else depends on it).

CREATE TABLE IF NOT EXISTS activity_log (
  id CHAR(36) NOT NULL PRIMARY KEY,
  seq BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id CHAR(36) NOT NULL,
  occurred_at VARCHAR(32) NOT NULL,
  action VARCHAR(40) NOT NULL,
  categories SET('member', 'payment', 'membership', 'balance') NOT NULL,
  member_id CHAR(36) NULL DEFAULT NULL,
  member_name VARCHAR(160) NOT NULL DEFAULT '',
  member_code VARCHAR(40) NOT NULL DEFAULT '',
  actor_id VARCHAR(64) NULL DEFAULT NULL,
  actor_name VARCHAR(160) NULL DEFAULT NULL,
  actor_role VARCHAR(32) NULL DEFAULT NULL,
  details JSON NULL,
  source_key VARCHAR(100) NULL DEFAULT NULL,
  backfilled TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uniq_activity_seq (seq),
  UNIQUE KEY uniq_activity_source (tenant_id, source_key),
  INDEX idx_activity_tenant_time (tenant_id, occurred_at),
  INDEX idx_activity_member (member_id, occurred_at),
  CONSTRAINT fk_activity_gym FOREIGN KEY (tenant_id) REFERENCES gyms(id) ON DELETE CASCADE
);
