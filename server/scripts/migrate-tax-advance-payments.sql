-- Tax advance payments (מקדמות) module: two new tables.
-- Safe to run twice (idempotent). Apply to EACH tenant database
-- separately.

DO $$ BEGIN
  CREATE TYPE tax_advance_payment_settings_frequency_enum AS ENUM ('monthly', 'bimonthly');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS tax_advance_payment_settings (
  id SERIAL PRIMARY KEY,
  rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  frequency tax_advance_payment_settings_frequency_enum NOT NULL DEFAULT 'bimonthly',
  "organizationId" INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tax_advance_payment_records (
  id SERIAL PRIMARY KEY,
  "periodFrom" DATE NOT NULL,
  "periodTo" DATE NOT NULL,
  "paidAmount" NUMERIC(12,2) NOT NULL,
  "paidDate" DATE NOT NULL,
  reference VARCHAR,
  "organizationId" INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tax_advance_payment_records_org_period
  ON tax_advance_payment_records("organizationId", "periodFrom");
