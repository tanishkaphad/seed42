-- ============================================================
-- 06_config.sql
-- Runtime-configurable business rules table
-- ============================================================

CREATE TABLE IF NOT EXISTS simulation.config (
  key VARCHAR PRIMARY KEY,
  value VARCHAR NOT NULL,
  description TEXT
);
