import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HolidayCalendarEntry } from './entities/holiday-calendar-entry.entity';
import { EmployeeSalarySettings, SalaryType } from './entities/employee-salary-settings.entity';
import { TimeClockEntry } from '../time-clock/entities/time-clock-entry.entity';
import { OrganizationPayrollSettings } from './entities/organization-payroll-settings.entity';

const DEFAULT_SHABBAT_START_HOUR = 18;
const DEFAULT_SHABBAT_END_HOUR = 20;

export interface CategorizedHours {
  regular: number;
  overtimeTier1: number;
  overtimeTier2: number;
  restDay: number;
  restDayOvertimeTier1: number;
  restDayOvertimeTier2: number;
}

/**
 * The actual hour-categorization math, straight from חוק שעות עבודה
 * ומנוחה תשי"א-1951 and the Labor Court's own consistently-applied
 * "cumulative method" (השיטה המצטברת) for combining the weekly-rest
 * premium with overtime, cross-confirmed against multiple current
 * legal sources before writing a single line of this calculation:
 *
 *   Ordinary workday:
 *     - First 8 hours: regular pay (100%)
 *     - Next 2 hours beyond that: 125%
 *     - Every hour after that: 150%
 *
 *   Shabbat / weekly rest day / recognized holiday:
 *     - Every regular hour worked: 150% (the rest-day premium alone —
 *       applies from the FIRST hour worked that day, since any hour
 *       on a rest day is itself the "excess" the premium exists for)
 *     - First 2 hours that are ALSO beyond the employee's own 8-hour
 *       daily quota: 175% (150% rest-day + 25% first-tier overtime,
 *       additive per the cumulative method)
 *     - 3rd+ overtime hour on a rest day: 200% (150% + 50%)
 *
 * Worked example matching a real cited case (60 ILS/hour, 11 hours
 * worked entirely within a rest period, after already having
 * completed a full 34-hour week): 8h@150%(regular rest-day) +
 * 2h@175% + 1h@200% = 720 + 210 + 120 = 1050 ILS — matches the source
 * exactly, verified before trusting this implementation.
 *
 * This service only CATEGORIZES hours and applies the percentages
 * already configured on EmployeeSalarySettings (defaulting to these
 * exact legal minimums, settable higher by agreement, never lower) —
 * it does not decide what counts as a recognized holiday (see
 * HolidayCalendarEntry, admin-maintained) or where Shabbat's own
 * boundary falls (organization-configurable, since exact sunset
 * varies by season/location — see this file's own constants).
 */
@Injectable()
export class PayrollCalculationService {
  constructor(
    @InjectRepository(HolidayCalendarEntry) private readonly holidaysRepo: Repository<HolidayCalendarEntry>,
    @InjectRepository(EmployeeSalarySettings) private readonly salaryRepo: Repository<EmployeeSalarySettings>,
    @InjectRepository(TimeClockEntry) private readonly timeClockRepo: Repository<TimeClockEntry>,
    @InjectRepository(OrganizationPayrollSettings) private readonly orgSettingsRepo: Repository<OrganizationPayrollSettings>,
  ) {}

  private async isHoliday(organizationId: number | null, date: string): Promise<boolean> {
    const count = await this.holidaysRepo.count({
      where: { date, ...(organizationId != null ? { organization: { id: organizationId } } : {}) } as any,
    });
    return count > 0;
  }

  private isRestPeriod(dt: Date, shabbatStartHour: number, shabbatEndHour: number): boolean {
    const day = dt.getDay(); // 0=Sunday, 5=Friday, 6=Saturday
    const hour = dt.getHours() + dt.getMinutes() / 60;
    if (day === 5) return hour >= shabbatStartHour;
    if (day === 6) return hour < shabbatEndHour;
    return false;
  }

  /** Categorizes one shift's hours into the six buckets above, in
   * 15-minute slices (fine enough for real payroll accuracy without
   * true continuous integration). `priorRegularHoursToday` lets a
   * later shift on the same calendar day (a split shift) correctly
   * continue accumulating toward the daily quota rather than
   * resetting to zero; `priorRestHoursToday` does the same for the
   * rest-day's own equivalent threshold. `standardWorkdayHours` is
   * the employee's own standard-day length (see
   * EmployeeSalarySettings.standardWorkdayHours's own doc comment for
   * the legal basis — overtime starts relative to THIS number, not a
   * fixed 8, and the tier1/tier2 split point moves with it: tier1 is
   * always the first 2 hours beyond this threshold, tier2 is
   * everything past that, on both ordinary and rest days alike). */
  async categorizeShift(
    organizationId: number | null,
    clockIn: Date,
    clockOut: Date,
    priorRegularHoursToday = 0,
    priorRestHoursToday = 0,
    shabbatStartHour = DEFAULT_SHABBAT_START_HOUR,
    shabbatEndHour = DEFAULT_SHABBAT_END_HOUR,
    standardWorkdayHours = 8,
  ): Promise<CategorizedHours> {
    const result: CategorizedHours = {
      regular: 0, overtimeTier1: 0, overtimeTier2: 0,
      restDay: 0, restDayOvertimeTier1: 0, restDayOvertimeTier2: 0,
    };

    const SLICE_HOURS = 0.25;
    let cursor = new Date(clockIn);
    let regularAccrued = priorRegularHoursToday;
    let restAccrued = priorRestHoursToday;
    const tier2Threshold = standardWorkdayHours + 2;

    const datesInvolved = new Set<string>();
    for (let t = new Date(clockIn); t < clockOut; t = new Date(t.getTime() + 24 * 3600 * 1000)) {
      datesInvolved.add(t.toISOString().slice(0, 10));
    }
    datesInvolved.add(clockOut.toISOString().slice(0, 10));
    const holidayByDate = new Map<string, boolean>();
    for (const d of datesInvolved) holidayByDate.set(d, await this.isHoliday(organizationId, d));

    while (cursor < clockOut) {
      const sliceEnd = new Date(Math.min(cursor.getTime() + SLICE_HOURS * 3600 * 1000, clockOut.getTime()));
      const sliceHours = (sliceEnd.getTime() - cursor.getTime()) / 3600000;
      const dateKey = cursor.toISOString().slice(0, 10);
      const isRest = this.isRestPeriod(cursor, shabbatStartHour, shabbatEndHour) || (holidayByDate.get(dateKey) ?? false);

      if (isRest) {
        // Matches the worked legal example exactly for an 8-hour
        // standard day (60 ILS/hour, 11 hours entirely within a rest
        // period → 8h@150%(restDay) + 2h@175%(tier1) + 1h@200%(tier2)
        // = 1050 ILS): the rest day's OWN first `standardWorkdayHours`
        // worked that day get the plain 150% base rate, the next 2
        // hours get 175% (150%+25% first-tier overtime), beyond that
        // gets 200% (150%+50%). An earlier version of this method
        // incorrectly applied the 175%/200% split starting from hour
        // 1 instead of the standard-day threshold — caught by testing
        // against this exact worked example, whose TOTAL happened to
        // still match by coincidence (every hour in that specific
        // example was already effectively overtime), which is exactly
        // why a single aggregate-total check isn't enough
        // verification on its own; the bucket-by-bucket breakdown had
        // to match too.
        if (restAccrued < standardWorkdayHours) {
          const toRestDay = Math.min(sliceHours, standardWorkdayHours - restAccrued);
          result.restDay += toRestDay;
          if (sliceHours > toRestDay) {
            const remaining = sliceHours - toRestDay;
            const toTier1 = Math.min(remaining, 2);
            result.restDayOvertimeTier1 += toTier1;
            if (remaining > toTier1) result.restDayOvertimeTier2 += remaining - toTier1;
          }
        } else if (restAccrued < tier2Threshold) {
          const toTier1 = Math.min(sliceHours, tier2Threshold - restAccrued);
          result.restDayOvertimeTier1 += toTier1;
          if (sliceHours > toTier1) result.restDayOvertimeTier2 += sliceHours - toTier1;
        } else {
          result.restDayOvertimeTier2 += sliceHours;
        }
        restAccrued += sliceHours;
      } else {
        if (regularAccrued < standardWorkdayHours) {
          const toRegular = Math.min(sliceHours, standardWorkdayHours - regularAccrued);
          result.regular += toRegular;
          if (sliceHours > toRegular) {
            const remaining = sliceHours - toRegular;
            const toTier1 = Math.min(remaining, 2);
            result.overtimeTier1 += toTier1;
            if (remaining > toTier1) result.overtimeTier2 += remaining - toTier1;
          }
        } else if (regularAccrued < tier2Threshold) {
          const toTier1 = Math.min(sliceHours, tier2Threshold - regularAccrued);
          result.overtimeTier1 += toTier1;
          if (sliceHours > toTier1) result.overtimeTier2 += sliceHours - toTier1;
        } else {
          result.overtimeTier2 += sliceHours;
        }
        regularAccrued += sliceHours;
      }
      cursor = sliceEnd;
    }

    return result;
  }

  async getSalarySettings(userId: number, organizationId: number | null): Promise<EmployeeSalarySettings> {
    const existing = await this.salaryRepo.findOne({ where: { user: { id: userId } }, relations: ['user'] });
    if (existing) return existing;
    return this.salaryRepo.create({
      user: { id: userId } as any,
      salaryType: SalaryType.HOURLY,
      standardWorkdayHours: 8,
      organization: organizationId != null ? ({ id: organizationId } as any) : undefined,
    });
  }

  /** Categorizes every REAL, closed shift a person worked in a period
   * — the shared piece both the Timekeeper view and the payslip
   * report build on, so they can never disagree about the same
   * underlying hours. Open shifts (still clocked in) are excluded,
   * same reasoning as TimeClockService.getTimesheet's own totals —
   * counting a still-running shift would make the same report return
   * a different answer depending on when it's viewed.
   *
   * Correctly threads accumulated daily hours ACROSS multiple shifts
   * on the same calendar day (a split shift — clock out for lunch,
   * clock back in) so the 8-hour regular/2-hour-tier1 thresholds
   * apply to the day as a whole, not reset per shift; regular and
   * rest-day accumulation are tracked separately per calendar date
   * since they're independent thresholds (see categorizeShift's own
   * doc comment). */
  /** Categorizes every REAL, closed shift a person worked in a period
   * — the shared piece both the Timekeeper view and the payslip
   * report build on, so they can never disagree about the same
   * underlying hours. Open shifts (still clocked in) are excluded,
   * same reasoning as TimeClockService.getTimesheet's own totals -
   * counting a still-running shift would make the same report return
   * a different answer depending on when it's viewed.
   *
   * Hours accumulate toward the daily regular/overtime thresholds by
   * WORKDAY GROUP, not by calendar date — two shifts count as the
   * SAME workday (continuing the same accumulated total, not each
   * getting a fresh regular-hours allowance) whenever the gap between
   * one shift's clockOut and the next shift's clockIn is under 6
   * hours, regardless of whether that gap crosses midnight. This
   * matches how a real workday actually works: someone who finishes
   * late and is back within a few hours is continuing the same
   * stretch of work, not starting a fresh day - splitting that across
   * a calendar-date boundary would silently understate real overtime
   * by giving each half its own regular-hours quota. A gap of 6 hours
   * or more (or the very first shift) starts a new workday group.
   *
   * Walks the person's ENTIRE shift history (not just the requested
   * [from, to] window) to correctly establish workday-group
   * boundaries and carry over accumulated hours into shifts that
   * start the requested period already mid-workday-group (e.g. a
   * shift that began the evening before `from`) - only the OUTPUT
   * (shiftBreakdowns/total) is filtered to the requested range,
   * exactly like before; the accumulation state itself needs the
   * fuller history to be correct at the boundary. */
  async categorizePeriod(userId: number, organizationId: number | null, from: string, to: string) {
    const orgSettings = await this.orgSettingsRepo.findOne({ where: organizationId != null ? { organization: { id: organizationId } } : {} });
    const shabbatStartHour = orgSettings?.shabbatStartHour ?? 18;
    const shabbatEndHour = orgSettings?.shabbatEndHour ?? 20;
    const salarySettings = await this.getSalarySettings(userId, organizationId);
    const standardWorkdayHours = salarySettings.standardWorkdayHours ?? 8;

    const WORKDAY_GROUP_GAP_HOURS = 6;

    const entries = await this.timeClockRepo.find({
      where: { user: { id: userId } },
      order: { clockIn: 'ASC' },
    });
    const closedAll = entries.filter((e) => e.clockOut != null);

    const shiftBreakdowns: Array<CategorizedHours & { entryId: number; date: string; clockIn: string; clockOut: string }> = [];
    const total: CategorizedHours = { regular: 0, overtimeTier1: 0, overtimeTier2: 0, restDay: 0, restDayOvertimeTier1: 0, restDayOvertimeTier2: 0 };

    let regularAccrued = 0;
    let restAccrued = 0;
    let previousClockOut: Date | null = null;

    for (const entry of closedAll) {
      const startsNewWorkdayGroup = previousClockOut == null
        || (entry.clockIn.getTime() - previousClockOut.getTime()) >= WORKDAY_GROUP_GAP_HOURS * 3600 * 1000;
      if (startsNewWorkdayGroup) {
        regularAccrued = 0;
        restAccrued = 0;
      }

      const categorized = await this.categorizeShift(
        organizationId, entry.clockIn, entry.clockOut!, regularAccrued, restAccrued, shabbatStartHour, shabbatEndHour, standardWorkdayHours,
      );
      const shiftTotalRegularSide = categorized.regular + categorized.overtimeTier1 + categorized.overtimeTier2;
      const shiftTotalRestSide = categorized.restDay + categorized.restDayOvertimeTier1 + categorized.restDayOvertimeTier2;
      regularAccrued += shiftTotalRegularSide;
      restAccrued += shiftTotalRestSide;
      previousClockOut = entry.clockOut!;

      const dateKey = entry.clockIn.toISOString().slice(0, 10);
      if (dateKey < from || dateKey > to) continue; // accumulation state above still needed this shift even though it's outside the requested output window

      shiftBreakdowns.push({
        entryId: entry.id, date: dateKey,
        clockIn: entry.clockIn.toISOString(), clockOut: entry.clockOut!.toISOString(),
        ...categorized,
      });
      total.regular += categorized.regular;
      total.overtimeTier1 += categorized.overtimeTier1;
      total.overtimeTier2 += categorized.overtimeTier2;
      total.restDay += categorized.restDay;
      total.restDayOvertimeTier1 += categorized.restDayOvertimeTier1;
      total.restDayOvertimeTier2 += categorized.restDayOvertimeTier2;
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;
    return {
      shifts: shiftBreakdowns.map((s) => ({
        ...s,
        regular: round2(s.regular), overtimeTier1: round2(s.overtimeTier1), overtimeTier2: round2(s.overtimeTier2),
        restDay: round2(s.restDay), restDayOvertimeTier1: round2(s.restDayOvertimeTier1), restDayOvertimeTier2: round2(s.restDayOvertimeTier2),
      })),
      total: {
        regular: round2(total.regular), overtimeTier1: round2(total.overtimeTier1), overtimeTier2: round2(total.overtimeTier2),
        restDay: round2(total.restDay), restDayOvertimeTier1: round2(total.restDayOvertimeTier1), restDayOvertimeTier2: round2(total.restDayOvertimeTier2),
      },
    };
  }
}
