-- ============================================================
-- 05_contradiction_rules.sql
-- Tracking contradiction detection rules table
-- ============================================================

CREATE TABLE IF NOT EXISTS simulation.tracking_contradiction_rules (
  id SERIAL PRIMARY KEY,
  supplier_claim VARCHAR NOT NULL,
  tracking_status VARCHAR NOT NULL,
  description TEXT NOT NULL,
  UNIQUE (supplier_claim, tracking_status)
);
