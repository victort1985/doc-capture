-- Adds VAT tracking to expenses and supplier invoices, and a new
-- "Input VAT Receivable" account to the chart of accounts, so
-- purchase-side VAT can be reclaimed correctly and reported on
-- separately from sales-side (output) VAT — see Expense.vatAmount's
-- own doc comment in the code for the full accounting reasoning.
-- Safe to run twice (idempotent) — apply to EACH tenant database
-- separately (doc_capture, vixor_test, vixor_mceilatmusic, and any
-- others).

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "vatAmount" NUMERIC(12,2);
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS "vatAmount" NUMERIC(12,2);

-- Seed the new Input VAT account for every existing organization that
-- doesn't already have it (matches AccountingService.seedDefaultAccounts'
-- own DEFAULT_ACCOUNTS list — code 1200 specifically).
INSERT INTO accounts (code, name, type, "isSystem", "organizationId", "createdAt", "updatedAt")
SELECT '1200', 'מע"מ תשומות (Input VAT Receivable)', 'asset', true, o.id, now(), now()
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM accounts a WHERE a."organizationId" = o.id AND a.code = '1200'
);
