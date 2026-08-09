-- Purchasing recommendations: two new columns on warehouse_items.
-- Safe to run twice (idempotent). Apply to EACH tenant database
-- separately.

ALTER TABLE warehouse_items ADD COLUMN IF NOT EXISTS "reorderPoint" INTEGER;
ALTER TABLE warehouse_items ADD COLUMN IF NOT EXISTS "preferredSupplierName" VARCHAR;
