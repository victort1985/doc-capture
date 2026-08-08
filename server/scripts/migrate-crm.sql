-- CRM module: two new tables (crm_deals, crm_deal_interactions).
-- Safe to run twice (idempotent). Apply to EACH tenant database
-- separately.

DO $$ BEGIN
  CREATE TYPE crm_deals_stage_enum AS ENUM ('lead', 'contacted', 'negotiation', 'won', 'lost');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE crm_deal_interactions_type_enum AS ENUM ('call', 'meeting', 'email', 'note');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS crm_deals (
  id SERIAL PRIMARY KEY,
  "clientName" VARCHAR NOT NULL,
  "clientPhone" VARCHAR,
  "clientEmail" VARCHAR,
  stage crm_deals_stage_enum NOT NULL DEFAULT 'lead',
  "estimatedValue" NUMERIC(12,2),
  description TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  "assignedToId" INTEGER REFERENCES users(id),
  "createdById" INTEGER REFERENCES users(id),
  "organizationId" INTEGER REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_crm_deals_stage ON crm_deals(stage);
CREATE INDEX IF NOT EXISTS idx_crm_deals_org ON crm_deals("organizationId");

CREATE TABLE IF NOT EXISTS crm_deal_interactions (
  id SERIAL PRIMARY KEY,
  type crm_deal_interactions_type_enum NOT NULL,
  text TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "dealId" INTEGER REFERENCES crm_deals(id) ON DELETE CASCADE,
  "authorId" INTEGER REFERENCES users(id)
);
