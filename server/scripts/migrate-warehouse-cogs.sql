-- Warehouse COGS (FIFO / weighted-average) module: new columns +
-- new table. Safe to run twice (idempotent). Apply to EACH tenant
-- database separately.

ALTER TABLE warehouse_transactions ADD COLUMN IF NOT EXISTS "unitCost" NUMERIC(12,2);
ALTER TABLE warehouse_transactions ADD COLUMN IF NOT EXISTS "cogsAmount" NUMERIC(12,2);

DO $$ BEGIN
  CREATE TYPE warehouse_cost_settings_method_enum AS ENUM ('fifo', 'weighted_average');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS warehouse_cost_settings (
  id SERIAL PRIMARY KEY,
  method warehouse_cost_settings_method_enum NOT NULL DEFAULT 'weighted_average',
  "organizationId" INTEGER REFERENCES organizations(id) ON DELETE CASCADE
);
