import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PayrollCalculationService } from './payroll-calculation.service';
import { PayslipService } from './payslip.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type ReqUser = { id: number; organizationId: number | null };

/**
 * Deliberately a SEPARATE controller from PayrollSettingsController
 * (which is entirely @Roles(ADMIN)-gated) rather than trying to
 * override the role guard on individual methods — any employee can
 * see THEIR OWN hours and payslip here, but never anyone else's
 * (there's no userId parameter to override at all; every method uses
 * the caller's own id from the JWT). Keeping this as its own
 * controller makes that boundary structurally obvious rather than
 * relying on a decorator override that would be easy to get wrong on
 * a future edit.
 */
@Controller('payroll')
@UseGuards(JwtAuthGuard)
export class PayrollSelfServiceController {
  constructor(
    private readonly calcService: PayrollCalculationService,
    private readonly payslipService: PayslipService,
  ) {}

  @Get('my-timekeeper')
  getMyTimekeeper(@Query('from') from: string, @Query('to') to: string, @CurrentUser() user: ReqUser) {
    return this.calcService.categorizePeriod(user.id, user.organizationId, from, to);
  }

  @Get('my-payslip')
  getMyPayslip(@Query('from') from: string, @Query('to') to: string, @CurrentUser() user: ReqUser) {
    return this.payslipService.generatePayslip(user.id, user.organizationId, from, to, true);
  }
}
