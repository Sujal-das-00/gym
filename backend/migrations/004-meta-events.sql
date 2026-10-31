-- Meta (Facebook) app events sent from the server: meta_devices, meta_sent_purchases.
--
-- backend/schema.sql already creates these on every boot, so a normal deployment needs
-- nothing here. This file is for hosts where the schema is managed by hand.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS meta_devices (
  tenant_id CHAR(36) NOT NULL PRIMARY KEY,
  anon_id VARCHAR(64) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_meta_device_gym FOREIGN KEY (tenant_id) REFERENCES gyms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meta_sent_purchases (
  purchase_id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_meta_sent_gym (tenant_id)
);
