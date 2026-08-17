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
import { HebcalZmanimService } from './hebcal-zmanim.service';
import { PayrollSettingsController } from './payroll-settings.controller';
import { PayrollSelfServiceController } from './payroll-self-service.controller';

@Module({
  imports: [TypeOrmModule.forFeature([HolidayCalendarEntry, EmployeeSalarySettings, OrganizationPayrollSettings, TimeClockEntry, User])],
  controllers: [PayrollSettingsController, PayrollSelfServiceController],
  providers: [PayrollCalculationService, PayrollSettingsService, PayslipService, HebcalZmanimService],
  exports: [PayrollCalculationService, PayrollSettingsService, PayslipService, HebcalZmanimService, TypeOrmModule],
})
export class PayrollModule {}
