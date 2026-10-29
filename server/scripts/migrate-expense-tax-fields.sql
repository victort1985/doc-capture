-- Adds the supplier-document / VAT / currency fields the Tax Authority
-- report and the receipt scanner need to the expenses table.
-- Safe to run twice (idempotent) — apply to EACH tenant database
-- separately (doc_capture, vixor_annam, vixor_mceilatmusic, vixor_test
-- and any others).
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "transactionDate" DATE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "vendorName" VARCHAR;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "vendorTaxId" VARCHAR;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "documentType" VARCHAR;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "documentNumber" VARCHAR;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "allocationNumber" VARCHAR;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "vatRate" NUMERIC(5,2);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "vatDeductiblePercent" NUMERIC(5,2);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "currency" VARCHAR(3);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "foreignAmount" NUMERIC(12,2);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "exchangeRate" NUMERIC(14,6);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "withholdingTaxAmount" NUMERIC(12,2);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "scanLanguage" VARCHAR;
