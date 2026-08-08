-- Bank reconciliation module: new bank_statement_lines table.
-- Safe to run twice (idempotent). Apply to EACH tenant database
-- separately (doc_capture, vixor_test, vixor_mceilatmusic, and any
-- others).

DO $$ BEGIN
  CREATE TYPE bank_statement_lines_status_enum AS ENUM ('unmatched', 'matched', 'ignored');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS bank_statement_lines (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  description VARCHAR NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  reference VARCHAR,
  status bank_statement_lines_status_enum NOT NULL DEFAULT 'unmatched',
  "matchedLedgerEntryId" INTEGER REFERENCES ledger_entries(id) ON DELETE SET NULL,
  "importBatchId" VARCHAR NOT NULL,
  "organizationId" INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_statement_lines_date ON bank_statement_lines(date);
CREATE INDEX IF NOT EXISTS idx_bank_statement_lines_status ON bank_statement_lines(status);
CREATE INDEX IF NOT EXISTS idx_bank_statement_lines_import_batch ON bank_statement_lines("importBatchId");
CREATE INDEX IF NOT EXISTS idx_bank_statement_lines_org ON bank_statement_lines("organizationId");
