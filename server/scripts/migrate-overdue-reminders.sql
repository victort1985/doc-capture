-- Overdue-invoice reminders module: two new tables.
-- Safe to run twice (idempotent). Apply to EACH tenant database
-- separately.

CREATE TABLE IF NOT EXISTS overdue_reminder_settings (
  id SERIAL PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  "thresholdDays" INTEGER[] NOT NULL DEFAULT '{7,14,30}'::integer[],
  "messageTemplate" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  "organizationId" INTEGER REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS overdue_reminder_logs (
  id SERIAL PRIMARY KEY,
  "thresholdDays" INTEGER NOT NULL,
  "sentSuccessfully" BOOLEAN NOT NULL DEFAULT false,
  "sentAt" TIMESTAMP NOT NULL DEFAULT now(),
  "invoiceId" INTEGER REFERENCES invoices(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_overdue_reminder_logs_invoice_threshold
  ON overdue_reminder_logs("invoiceId", "thresholdDays");
