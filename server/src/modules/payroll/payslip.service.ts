import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PayrollCalculationService, CategorizedHours } from './payroll-calculation.service';
import { PayrollSettingsService } from './payroll-settings.service';
import { SalaryType } from './entities/employee-salary-settings.entity';
import { User } from '../users/entities/user.entity';

const STANDARD_WEEKLY_HOURS = 42;
const STANDARD_MONTHLY_HOURS = Math.round(STANDARD_WEEKLY_HOURS * 4.33 * 100) / 100;

export interface PayslipLine {
  category: string;
  categoryKey: keyof CategorizedHours;
  hours: number;
  ratePercent: number;
  amount: number;
}

export interface Payslip {
  userId: number;
  username: string;
  period: { from: string; to: string };
  salaryType: SalaryType;
  hours: CategorizedHours;
  lines: PayslipLine[];
  grossPay: number;
  globalFloorCheck?: {
    statedGlobalAmount: number;
    impliedHourlyRate: number;
    itemizedEquivalent: number;
    belowFloor: boolean;
  };
}

const CATEGORY_LABELS: Record<keyof CategorizedHours, string> = {
  regular: 'Regular hours',
  overtimeTier1: 'Overtime 125%',
  overtimeTier2: 'Overtime 150%',
  restDay: 'Shabbat/Holiday 150%',
  restDayOvertimeTier1: 'Shabbat/Holiday overtime 175%',
  restDayOvertimeTier2: 'Shabbat/Holiday overtime 200%',
};

/**
 * Combines the calculation engine, real Timekeeper data, and salary
 * settings into gross-pay figures — the actual point of this whole
 * payroll feature. Deliberately stops at gross pay: see this whole
 * feature's own scope boundary (discussed before any of this was
 * built) — income tax, National Insurance, and health-tax withholding
 * depend on each employee's personal tax situation (תיאום מס, נקודות
 * זיכוי) and current-year brackets, and this app doesn't attempt to
 * compute those. An accountant finalizes net pay from the gross
 * figure and category breakdown this produces.
 */
@Injectable()
export class PayslipService {
  constructor(
    private readonly calcService: PayrollCalculationService,
    private readonly settingsService: PayrollSettingsService,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
  ) {}

  /** For HOURLY employees: each category's hours × the employee's own
   * hourly rate × that category's own configured premium percentage,
   * summed.
   *
   * For GLOBAL employees: grossPay is simply the stated monthly
   * amount (that's the whole point of a global arrangement — it
   * doesn't vary with hours worked). Alongside it, computes a
   * globalFloorCheck: an implied hourly rate (statedAmount /
   * STANDARD_MONTHLY_HOURS — the standard weekly-hours×4.33
   * convention, see this file's own top constants), used to calculate
   * what the SAME actual hours would have cost under the itemized
   * law. If the itemized equivalent exceeds the stated global amount,
   * belowFloor is flagged true — a genuine, useful compliance signal,
   * but NOT a legal certification that the arrangement itself is
   * lawful (see EmployeeSalarySettings' own doc comment for the full
   * 5-condition case-law standard this single numeric check can't
   * verify on its own — informed consent and genuineness of the
   * average are factual questions about how the arrangement was
   * actually reached, not derivable from stored numbers). */
  /** `skipOwnershipCheck` exists for the self-service endpoints (see
   * PayrollSelfServiceController), where userId is ALWAYS the
   * caller's own id straight from their JWT — never attacker-
   * controlled — so there's nothing to verify. The check matters for
   * the ADMIN endpoint (an admin looking up an arbitrary employee
   * id), but was incorrectly applied to self-lookups too — confirmed
   * root cause: JwtStrategy's "acting as org" mechanism
   * (X-Active-Org header, used when a super-admin or multi-org admin
   * switches which organization's data they're viewing) puts the
   * SWITCHED org into `organizationId`, not the account's own real
   * one. A super-admin's own `targetUser.organization` is always
   * null/undefined — so the moment they'd switched their active org
   * context to view ANY specific organization and then opened their
   * OWN "My Payslip", the mismatch check (undefined !== the switched
   * org id) incorrectly threw "Employee not found" on a person
   * looking up literally themselves. Reproduced exactly via a live
   * request with X-Active-Org set before this fix, confirmed
   * resolved after. Regardless of this flag, organizationId is still
   * used for the FUNCTIONAL lookups below (holidays, Shabbat window)
   * — skipping the check doesn't skip using the org's real settings,
   * it only skips the identity-mismatch guard that doesn't apply when
   * the id is provably the caller's own. */
  async generatePayslip(userId: number, organizationId: number | null, from: string, to: string, skipOwnershipCheck = false): Promise<Payslip> {
    const targetUser = await this.usersRepo.findOne({ where: { id: userId }, relations: ['organization'] });
    if (!targetUser) throw new NotFoundException('Employee not found');
    if (!skipOwnershipCheck && organizationId != null && targetUser.organization?.id !== organizationId) {
      throw new NotFoundException('Employee not found');
    }

    const { total: hours } = await this.calcService.categorizePeriod(userId, organizationId, from, to);
    const settings = await this.settingsService.getSalarySettings(userId, organizationId);

    const categories: (keyof CategorizedHours)[] = ['regular', 'overtimeTier1', 'overtimeTier2', 'restDay', 'restDayOvertimeTier1', 'restDayOvertimeTier2'];
    const percentByCategory: Record<keyof CategorizedHours, number> = {
      regular: 100,
      overtimeTier1: Number(settings.overtimeFirst2HoursPercent),
      overtimeTier2: Number(settings.overtimeBeyond2HoursPercent),
      restDay: Number(settings.restDayPercent),
      restDayOvertimeTier1: Number(settings.restDayOvertimeFirst2HoursPercent),
      restDayOvertimeTier2: Number(settings.restDayOvertimeBeyond2HoursPercent),
    };

    const rateForItemizedCalc = settings.salaryType === SalaryType.HOURLY
      ? Number(settings.hourlyRate ?? 0)
      : Number(settings.globalMonthlySalary ?? 0) / STANDARD_MONTHLY_HOURS;

    const lines: PayslipLine[] = categories
      .filter((cat) => hours[cat] > 0)
      .map((cat) => {
        const amount = Math.round(hours[cat] * rateForItemizedCalc * (percentByCategory[cat] / 100) * 100) / 100;
        return { category: CATEGORY_LABELS[cat], categoryKey: cat, hours: hours[cat], ratePercent: percentByCategory[cat], amount };
      });

    const itemizedTotal = Math.round(lines.reduce((sum, l) => sum + l.amount, 0) * 100) / 100;

    if (settings.salaryType === SalaryType.HOURLY) {
      return {
        userId, username: targetUser.username, period: { from, to }, salaryType: SalaryType.HOURLY,
        hours, lines, grossPay: itemizedTotal,
      };
    }

    const statedGlobalAmount = Number(settings.globalMonthlySalary ?? 0);
    return {
      userId, username: targetUser.username, period: { from, to }, salaryType: SalaryType.GLOBAL,
      hours, lines, grossPay: statedGlobalAmount,
      globalFloorCheck: {
        statedGlobalAmount,
        impliedHourlyRate: Math.round(rateForItemizedCalc * 100) / 100,
        itemizedEquivalent: itemizedTotal,
        belowFloor: itemizedTotal > statedGlobalAmount,
      },
    };
  }
}
