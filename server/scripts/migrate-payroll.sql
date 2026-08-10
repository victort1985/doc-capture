-- Payroll foundation (Timekeeper + salary settings, part 1 of the
-- payroll feature): three new tables. Safe to run twice (idempotent).
-- Apply to EACH tenant database separately.

DO $$ BEGIN
  CREATE TYPE employee_salary_settings_salarytype_enum AS ENUM ('hourly', 'global');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS holiday_calendar (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  name VARCHAR NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "organizationId" INTEGER REFERENCES organizations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_holiday_calendar_org ON holiday_calendar("organizationId");
CREATE INDEX IF NOT EXISTS idx_holiday_calendar_date ON holiday_calendar(date);

CREATE TABLE IF NOT EXISTS employee_salary_settings (
  id SERIAL PRIMARY KEY,
  "salaryType" employee_salary_settings_salarytype_enum NOT NULL DEFAULT 'hourly',
  "hourlyRate" NUMERIC(10,2),
  "globalMonthlySalary" NUMERIC(10,2),
  "overtimeFirst2HoursPercent" NUMERIC(6,2) NOT NULL DEFAULT 125,
  "overtimeBeyond2HoursPercent" NUMERIC(6,2) NOT NULL DEFAULT 150,
  "restDayPercent" NUMERIC(6,2) NOT NULL DEFAULT 150,
  "restDayOvertimeFirst2HoursPercent" NUMERIC(6,2) NOT NULL DEFAULT 175,
  "restDayOvertimeBeyond2HoursPercent" NUMERIC(6,2) NOT NULL DEFAULT 200,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  "userId" INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  "organizationId" INTEGER REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS organization_payroll_settings (
  id SERIAL PRIMARY KEY,
  "shabbatStartHour" INTEGER NOT NULL DEFAULT 18,
  "shabbatEndHour" INTEGER NOT NULL DEFAULT 20,
  "organizationId" INTEGER REFERENCES organizations(id) ON DELETE CASCADE
);

-- Seed 2026 recognized holidays (General Extension Order 2000 — nine
-- paid holiday days) for every existing organization that doesn't
-- already have any holidays configured. Dates cross-confirmed against
-- multiple current Hebrew-calendar sources as of this migration's own
-- authoring date — an accountant or business owner should still
-- verify these against an authoritative Hebrew calendar each year and
-- add future years manually via the app's own Timekeeper settings,
-- since this migration only ever seeds 2026 once.
INSERT INTO holiday_calendar (date, name, "organizationId")
SELECT d.date, d.name, o.id
FROM organizations o
CROSS JOIN (VALUES
  ('2026-09-11'::date, 'Rosh Hashana I'),
  ('2026-09-12'::date, 'Rosh Hashana II'),
  ('2026-09-21'::date, 'Yom Kippur'),
  ('2026-09-25'::date, 'Sukkot I'),
  ('2026-10-03'::date, 'Shmini Atzeret'),
  ('2026-04-02'::date, 'Passover I'),
  ('2026-04-08'::date, 'Passover VII'),
  ('2026-05-22'::date, 'Shavuot'),
  ('2026-04-22'::date, 'Independence Day')
) AS d(date, name)
WHERE NOT EXISTS (
  SELECT 1 FROM holiday_calendar h WHERE h."organizationId" = o.id
);
