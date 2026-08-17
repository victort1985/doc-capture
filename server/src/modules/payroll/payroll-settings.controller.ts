import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { PayrollSettingsService } from './payroll-settings.service';
import { PayrollCalculationService } from './payroll-calculation.service';
import { PayslipService } from './payslip.service';
import { SalaryType } from './entities/employee-salary-settings.entity';
import { searchIsraeliCities } from './data/israeli-cities';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type ReqUser = { organizationId: number | null };

class AddHolidayDto {
  @IsString()
  date: string;

  @IsString()
  name: string;
}

class OrgHoursDto {
  @IsNumber() @Min(0)
  shabbatStartHour: number;

  @IsNumber() @Min(0)
  shabbatEndHour: number;
}

class SalarySettingsDto {
  @IsEnum(SalaryType)
  salaryType: SalaryType;

  @IsInt() @Min(4) @Max(8) @IsOptional()
  standardWorkdayHours?: number;

  @IsNumber() @IsOptional()
  hourlyRate?: number;

  @IsNumber() @IsOptional()
  globalMonthlySalary?: number;

  @IsNumber() @IsOptional()
  overtimeFirst2HoursPercent?: number;

  @IsNumber() @IsOptional()
  overtimeBeyond2HoursPercent?: number;

  @IsNumber() @IsOptional()
  restDayPercent?: number;

  @IsNumber() @IsOptional()
  restDayOvertimeFirst2HoursPercent?: number;

  @IsNumber() @IsOptional()
  restDayOvertimeBeyond2HoursPercent?: number;

  @IsString() @IsOptional()
  cityName?: string | null;

  @IsNumber() @IsOptional()
  cityLat?: number | null;

  @IsNumber() @IsOptional()
  cityLon?: number | null;
}

@Controller('payroll')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class PayrollSettingsController {
  constructor(
    private readonly service: PayrollSettingsService,
    private readonly calcService: PayrollCalculationService,
    private readonly payslipService: PayslipService,
  ) {}

  /** Backs the Salary Settings page's own city autocomplete field —
   * a static, curated list (see data/israeli-cities.ts's own doc
   * comment for what it does and doesn't cover), searched server-side
   * so the client never needs its own copy of the list. No
   * organization scoping needed — this is reference data, not
   * anything tenant-specific. */
  @Get('cities')
  searchCities(@Query('q') q?: string) {
    return searchIsraeliCities(q ?? '');
  }

  /** Lets an admin/accountant verify the hour-categorization math for
   * any hypothetical shift directly — genuinely useful for spot-
   * checking the system's own arithmetic against a known example
   * before trusting it for real payroll, not just a debugging tool. */
  @Post('calculate-preview')
  calculatePreview(@Body() dto: { clockIn: string; clockOut: string }, @CurrentUser() user: ReqUser) {
    return this.calcService.categorizeShift(user.organizationId, new Date(dto.clockIn), new Date(dto.clockOut));
  }

  /** The Timekeeper view's own data source — every real closed shift
   * for one employee in a period, categorized. */
  @Get('timekeeper/:userId')
  getTimekeeperData(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: ReqUser,
  ) {
    return this.calcService.categorizePeriod(userId, user.organizationId, from, to);
  }

  /** The payslip report's own data source — see PayslipService's own
   * doc comment for exactly what this does and deliberately does not
   * compute (gross pay only, no tax/National-Insurance withholding). */
  @Get('payslip/:userId')
  getPayslip(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: ReqUser,
  ) {
    return this.payslipService.generatePayslip(userId, user.organizationId, from, to);
  }

  @Get('holidays')
  listHolidays(@CurrentUser() user: ReqUser) {
    return this.service.listHolidays(user.organizationId);
  }

  @Post('holidays')
  addHoliday(@Body() dto: AddHolidayDto, @CurrentUser() user: ReqUser) {
    return this.service.addHoliday(user.organizationId, dto.date, dto.name);
  }

  @Delete('holidays/:id')
  async removeHoliday(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser) {
    await this.service.removeHoliday(id, user.organizationId);
    return { deleted: true };
  }

  @Get('org-settings')
  getOrgSettings(@CurrentUser() user: ReqUser) {
    return this.service.getOrgSettings(user.organizationId);
  }

  @Put('org-settings')
  updateOrgSettings(@Body() dto: OrgHoursDto, @CurrentUser() user: ReqUser) {
    return this.service.updateOrgSettings(user.organizationId, dto.shabbatStartHour, dto.shabbatEndHour);
  }

  @Get('salary/:userId')
  getSalarySettings(@Param('userId', ParseIntPipe) userId: number, @CurrentUser() user: ReqUser) {
    return this.service.getSalarySettings(userId, user.organizationId);
  }

  @Put('salary/:userId')
  updateSalarySettings(@Param('userId', ParseIntPipe) userId: number, @Body() dto: SalarySettingsDto, @CurrentUser() user: ReqUser) {
    return this.service.updateSalarySettings(userId, user.organizationId, dto);
  }
}
