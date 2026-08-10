import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HolidayCalendarEntry } from './entities/holiday-calendar-entry.entity';
import { EmployeeSalarySettings, SalaryType } from './entities/employee-salary-settings.entity';
import { OrganizationPayrollSettings } from './entities/organization-payroll-settings.entity';

const LEGAL_MINIMUMS = {
  overtimeFirst2HoursPercent: 125,
  overtimeBeyond2HoursPercent: 150,
  restDayPercent: 150,
  restDayOvertimeFirst2HoursPercent: 175,
  restDayOvertimeBeyond2HoursPercent: 200,
} as const;

export interface UpdateSalarySettingsInput {
  salaryType: SalaryType;
  hourlyRate?: number;
  globalMonthlySalary?: number;
  overtimeFirst2HoursPercent?: number;
  overtimeBeyond2HoursPercent?: number;
  restDayPercent?: number;
  restDayOvertimeFirst2HoursPercent?: number;
  restDayOvertimeBeyond2HoursPercent?: number;
}

@Injectable()
export class PayrollSettingsService {
  constructor(
    @InjectRepository(HolidayCalendarEntry) private readonly holidaysRepo: Repository<HolidayCalendarEntry>,
    @InjectRepository(EmployeeSalarySettings) private readonly salaryRepo: Repository<EmployeeSalarySettings>,
    @InjectRepository(OrganizationPayrollSettings) private readonly orgSettingsRepo: Repository<OrganizationPayrollSettings>,
  ) {}

  async listHolidays(organizationId: number | null): Promise<HolidayCalendarEntry[]> {
    return this.holidaysRepo.find({
      where: organizationId != null ? { organization: { id: organizationId } } : {},
      order: { date: 'ASC' },
    });
  }

  async addHoliday(organizationId: number | null, date: string, name: string): Promise<HolidayCalendarEntry> {
    return this.holidaysRepo.save(this.holidaysRepo.create({
      date, name,
      organization: organizationId != null ? ({ id: organizationId } as any) : undefined,
    }));
  }

  async removeHoliday(id: number, organizationId: number | null): Promise<void> {
    const entry = await this.holidaysRepo.findOne({ where: { id }, relations: ['organization'] });
    if (!entry) throw new NotFoundException('Holiday not found');
    if (organizationId != null && entry.organization?.id !== organizationId) throw new NotFoundException('Holiday not found');
    await this.holidaysRepo.remove(entry);
  }

  async getOrgSettings(organizationId: number | null): Promise<OrganizationPayrollSettings> {
    const existing = await this.orgSettingsRepo.findOne({ where: organizationId != null ? { organization: { id: organizationId } } : {} });
    if (existing) return existing;
    return this.orgSettingsRepo.create({});
  }

  async updateOrgSettings(organizationId: number | null, shabbatStartHour: number, shabbatEndHour: number): Promise<OrganizationPayrollSettings> {
    if (shabbatStartHour < 0 || shabbatStartHour > 23 || shabbatEndHour < 0 || shabbatEndHour > 23) {
      throw new BadRequestException('Hours must be between 0 and 23.');
    }
    let settings = await this.orgSettingsRepo.findOne({ where: organizationId != null ? { organization: { id: organizationId } } : {} });
    if (!settings) {
      settings = this.orgSettingsRepo.create({ organization: organizationId != null ? ({ id: organizationId } as any) : undefined });
    }
    settings.shabbatStartHour = shabbatStartHour;
    settings.shabbatEndHour = shabbatEndHour;
    return this.orgSettingsRepo.save(settings);
  }

  async getSalarySettings(userId: number, organizationId: number | null): Promise<EmployeeSalarySettings> {
    const existing = await this.salaryRepo.findOne({ where: { user: { id: userId } }, relations: ['user'] });
    if (existing) return existing;
    return this.salaryRepo.create({
      user: { id: userId } as any,
      salaryType: SalaryType.HOURLY,
      organization: organizationId != null ? ({ id: organizationId } as any) : undefined,
    });
  }

  /** Validates every percentage against its own legal floor before
   * saving anything — a collective agreement or personal contract may
   * set any premium HIGHER than the legal minimum, never lower; this
   * rejects a lower value outright rather than saving a wage-law
   * violation into the system as if it were a legitimate
   * configuration. Also requires the matching rate field for whichever
   * salaryType is chosen. */
  async updateSalarySettings(userId: number, organizationId: number | null, input: UpdateSalarySettingsInput): Promise<EmployeeSalarySettings> {
    for (const [field, minimum] of Object.entries(LEGAL_MINIMUMS)) {
      const value = (input as any)[field];
      if (value != null && value < minimum) {
        throw new BadRequestException(`${field} cannot be set below the legal minimum of ${minimum}%.`);
      }
    }
    if (input.salaryType === SalaryType.HOURLY && !input.hourlyRate) {
      throw new BadRequestException('An hourly rate is required for hourly-paid employees.');
    }
    if (input.salaryType === SalaryType.GLOBAL && !input.globalMonthlySalary) {
      throw new BadRequestException('A monthly amount is required for globally-paid employees.');
    }

    let settings = await this.salaryRepo.findOne({ where: { user: { id: userId } } });
    if (!settings) {
      settings = this.salaryRepo.create({
        user: { id: userId } as any,
        organization: organizationId != null ? ({ id: organizationId } as any) : undefined,
      });
    }
    settings.salaryType = input.salaryType;
    settings.hourlyRate = input.salaryType === SalaryType.HOURLY ? input.hourlyRate : null;
    settings.globalMonthlySalary = input.salaryType === SalaryType.GLOBAL ? input.globalMonthlySalary : null;
    if (input.overtimeFirst2HoursPercent != null) settings.overtimeFirst2HoursPercent = input.overtimeFirst2HoursPercent;
    if (input.overtimeBeyond2HoursPercent != null) settings.overtimeBeyond2HoursPercent = input.overtimeBeyond2HoursPercent;
    if (input.restDayPercent != null) settings.restDayPercent = input.restDayPercent;
    if (input.restDayOvertimeFirst2HoursPercent != null) settings.restDayOvertimeFirst2HoursPercent = input.restDayOvertimeFirst2HoursPercent;
    if (input.restDayOvertimeBeyond2HoursPercent != null) settings.restDayOvertimeBeyond2HoursPercent = input.restDayOvertimeBeyond2HoursPercent;
    return this.salaryRepo.save(settings);
  }
}
