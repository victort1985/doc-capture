import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HolidayCalendarEntry } from './entities/holiday-calendar-entry.entity';
import { EmployeeSalarySettings } from './entities/employee-salary-settings.entity';
import { OrganizationPayrollSettings } from './entities/organization-payroll-settings.entity';
import { TimeClockEntry } from '../time-clock/entities/time-clock-entry.entity';
import { User } from '../users/entities/user.entity';
import { PayrollCalculationService } from './payroll-calculation.service';
import { PayrollSettingsService } from './payroll-settings.service';
import { PayslipService } from './payslip.service';
import { PayrollSettingsController } from './payroll-settings.controller';

@Module({
  imports: [TypeOrmModule.forFeature([HolidayCalendarEntry, EmployeeSalarySettings, OrganizationPayrollSettings, TimeClockEntry, User])],
  controllers: [PayrollSettingsController],
  providers: [PayrollCalculationService, PayrollSettingsService, PayslipService],
  exports: [PayrollCalculationService, PayrollSettingsService, PayslipService, TypeOrmModule],
})
export class PayrollModule {}
