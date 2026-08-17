-- City name + coordinates on employee salary settings, used for
-- precise per-location Shabbat candle-lighting/havdalah calculation
-- via @hebcal/core (falls back to the existing fixed-hour org-wide
-- window when null, preserving current behavior for every existing
-- employee). Safe to run twice (idempotent). Apply to EACH tenant
-- database separately.

ALTER TABLE employee_salary_settings ADD COLUMN IF NOT EXISTS "cityName" VARCHAR;
ALTER TABLE employee_salary_settings ADD COLUMN IF NOT EXISTS "cityLat" DOUBLE PRECISION;
ALTER TABLE employee_salary_settings ADD COLUMN IF NOT EXISTS "cityLon" DOUBLE PRECISION;
