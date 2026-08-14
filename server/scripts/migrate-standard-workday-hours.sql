-- Standard-workday-hours field on employee salary settings (6h vs 8h
-- day, determines when overtime starts): one new column. Safe to run
-- twice (idempotent). Apply to EACH tenant database separately.

ALTER TABLE employee_salary_settings ADD COLUMN IF NOT EXISTS "standardWorkdayHours" INTEGER NOT NULL DEFAULT 8;
