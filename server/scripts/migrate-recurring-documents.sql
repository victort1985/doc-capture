-- Recurring documents module: new recurring_templates table.
-- Safe to run twice (idempotent). Apply to EACH tenant database
-- separately.

DO $$ BEGIN
  CREATE TYPE recurring_templates_documenttype_enum AS ENUM ('expense', 'invoice');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS recurring_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR NOT NULL,
  "documentType" recurring_templates_documenttype_enum NOT NULL,
  "dayOfMonth" INTEGER NOT NULL,
  "templateData" JSONB NOT NULL,
  "nextRunDate" DATE NOT NULL,
  "lastRunDate" DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  "generatedLog" JSONB NOT NULL DEFAULT '[]',
  "organizationId" INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  "createdById" INTEGER REFERENCES users(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recurring_templates_active ON recurring_templates(active);
CREATE INDEX IF NOT EXISTS idx_recurring_templates_org ON recurring_templates("organizationId");
