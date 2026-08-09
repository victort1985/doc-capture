-- Employee time clock: one new table. Safe to run twice (idempotent).
-- Apply to EACH tenant database separately.

CREATE TABLE IF NOT EXISTS time_clock_entries (
  id SERIAL PRIMARY KEY,
  "clockIn" TIMESTAMP NOT NULL,
  "clockOut" TIMESTAMP,
  notes TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "userId" INTEGER REFERENCES users(id) ON DELETE CASCADE,
  "costCenterId" INTEGER REFERENCES cost_centers(id) ON DELETE SET NULL,
  "organizationId" INTEGER REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_time_clock_entries_org ON time_clock_entries("organizationId");
CREATE INDEX IF NOT EXISTS idx_time_clock_entries_user ON time_clock_entries("userId");
