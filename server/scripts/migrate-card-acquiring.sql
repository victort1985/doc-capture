-- Card acquiring scaffold (settings storage only, no real payment
-- gateway is integrated — see CardAcquiringService.charge's own code
-- comment): one new table. Safe to run twice (idempotent). Apply to
-- EACH tenant database separately.

DO $$ BEGIN
  CREATE TYPE card_acquiring_settings_provider_enum AS ENUM ('none', 'stripe', 'tranzila', 'cardcom');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS card_acquiring_settings (
  id SERIAL PRIMARY KEY,
  provider card_acquiring_settings_provider_enum NOT NULL DEFAULT 'none',
  "apiKey" VARCHAR,
  "organizationId" INTEGER REFERENCES organizations(id) ON DELETE CASCADE
);
