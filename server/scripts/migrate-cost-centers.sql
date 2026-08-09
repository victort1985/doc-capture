-- Cost-center expense/revenue tracking: new table + three new
-- columns. Safe to run twice (idempotent). Apply to EACH tenant
-- database separately.

CREATE TABLE IF NOT EXISTS cost_centers (
  id SERIAL PRIMARY KEY,
  name VARCHAR NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "organizationId" INTEGER REFERENCES organizations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_cost_centers_org ON cost_centers("organizationId");

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "costCenterId" INTEGER REFERENCES cost_centers(id) ON DELETE SET NULL;
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS "costCenterId" INTEGER REFERENCES cost_centers(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "costCenterId" INTEGER REFERENCES cost_centers(id) ON DELETE SET NULL;
