-- Web Push subscriptions, one row per member DEVICE.
--
-- backend/schema.sql is re-applied on every boot and already contains this
-- table, so a normal deployment needs nothing here. This file is for hosts
-- where the schema is managed out of band (shared hosting, a DBA-owned
-- database) and has to be applied by hand.
--
-- Safe to re-run: IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  member_id CHAR(36) NOT NULL,
  tenant_id CHAR(36) NOT NULL,
  endpoint TEXT NOT NULL,
  -- SHA-256 of endpoint: the endpoint URL itself is longer than MySQL will index.
  endpoint_hash CHAR(64) NOT NULL,
  p256dh VARCHAR(255) NOT NULL,
  auth VARCHAR(255) NOT NULL,
  user_agent VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_push_endpoint (endpoint_hash),
  INDEX idx_push_member (member_id),
  INDEX idx_push_tenant (tenant_id),
  CONSTRAINT fk_push_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  CONSTRAINT fk_push_gym FOREIGN KEY (tenant_id) REFERENCES gyms(id) ON DELETE CASCADE
);
