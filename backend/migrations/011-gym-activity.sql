-- Gym activity record (Daily Log)
--
-- One row per action taken in the admin panel (members, payments, plan
-- changes, expenses, trainers, settings), with who did it and what changed.
-- Written by backend/src/services/auditService.js; read by the Daily Log.
--
-- backend/schema.sql already creates this table on every boot, so a normal
-- deployment needs nothing here. This file is for hosts where the schema is
-- managed by hand (phpMyAdmin, a DBA-owned database). Safe to re-run.
-- To reverse: DROP TABLE gym_activity (nothing else depends on it; the Daily
-- Log then rebuilds everything from record timestamps again).

CREATE TABLE IF NOT EXISTS gym_activity (
  id CHAR(36) NOT NULL PRIMARY KEY,
  seq BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id CHAR(36) NOT NULL,
  at_ms BIGINT NOT NULL,
  action VARCHAR(40) NOT NULL,
  member_id CHAR(36) NULL DEFAULT NULL,
  member_name VARCHAR(160) NOT NULL DEFAULT '',
  member_code VARCHAR(40) NOT NULL DEFAULT '',
  actor_id VARCHAR(64) NULL DEFAULT NULL,
  actor_name VARCHAR(160) NULL DEFAULT NULL,
  actor_role VARCHAR(32) NULL DEFAULT NULL,
  amount DECIMAL(12,2) NULL DEFAULT NULL,
  details MEDIUMTEXT NULL,
  UNIQUE KEY uniq_gym_activity_seq (seq),
  INDEX idx_gym_activity_time (tenant_id, at_ms),
  CONSTRAINT fk_gym_activity_gym FOREIGN KEY (tenant_id) REFERENCES gyms(id) ON DELETE CASCADE
);
