-- Old databases were created when PaymentMethod only had cash / bank
-- transfer, so a CHECK constraint on "method" still rejects the newer
-- values (credit_card, check, bit, standing_order) — saving a card
-- expense fails with: violates check constraint "expenses_method_check".
-- Replaces the constraint on expenses, supplier_invoices and payments
-- with one that allows all six current methods.
-- Safe to run twice; apply to EACH tenant database.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['expenses', 'supplier_invoices', 'payments'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = t AND column_name = 'method') THEN
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', t, t || '_method_check');
      IF (SELECT data_type FROM information_schema.columns WHERE table_name = t AND column_name = 'method' LIMIT 1) = 'character varying' THEN
        EXECUTE format(
          'ALTER TABLE %I ADD CONSTRAINT %I CHECK (method IS NULL OR method IN (''cash'',''credit_card'',''bank_transfer'',''check'',''bit'',''standing_order''))',
          t, t || '_method_check');
      END IF;
    END IF;
  END LOOP;
END $$;
