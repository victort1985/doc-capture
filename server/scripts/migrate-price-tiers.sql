-- Multi-tier price lists: two new tables + one new column on
-- phonebook_contacts. Safe to run twice (idempotent). Apply to EACH
-- tenant database separately.

CREATE TABLE IF NOT EXISTS price_tiers (
  id SERIAL PRIMARY KEY,
  name VARCHAR NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "organizationId" INTEGER REFERENCES organizations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_price_tiers_org ON price_tiers("organizationId");

CREATE TABLE IF NOT EXISTS price_tier_overrides (
  id SERIAL PRIMARY KEY,
  price NUMERIC(12,2) NOT NULL,
  "tierId" INTEGER REFERENCES price_tiers(id) ON DELETE CASCADE,
  "priceListItemId" INTEGER REFERENCES price_list_items(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_price_tier_overrides_tier_item
  ON price_tier_overrides("tierId", "priceListItemId");

ALTER TABLE phonebook_contacts ADD COLUMN IF NOT EXISTS "priceTierId" INTEGER REFERENCES price_tiers(id) ON DELETE SET NULL;
