import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { IsEnum, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';
import { TaxAdvancePaymentService } from './tax-advance-payment.service';
import { AdvancePaymentFrequency } from './entities/tax-advance-payment-settings.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type ReqUser = { organizationId: number | null };

class UpdateSettingsDto {
  @IsNumber()
  @Min(0)
  rate: number;

  @IsEnum(AdvancePaymentFrequency)
  frequency: AdvancePaymentFrequency;
}

class MarkPaidDto {
  @IsString()
  periodFrom: string;

  @IsString()
  periodTo: string;

  @IsNumber()
  @IsPositive()
  paidAmount: number;

  @IsString()
  paidDate: string;

  @IsString()
  @IsOptional()
  reference?: string;
}

@Controller('tax-advance-payments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class TaxAdvancePaymentController {
  constructor(private readonly service: TaxAdvancePaymentService) {}

  @Get('settings')
  getSettings(@CurrentUser() user: ReqUser) {
    return this.service.getSettings(user.organizationId);
  }

  @Put('settings')
  updateSettings(@Body() dto: UpdateSettingsDto, @CurrentUser() user: ReqUser) {
    return this.service.updateSettings(user.organizationId, dto.rate, dto.frequency);
  }

  @Get('periods')
  getPeriods(@Query('year') year: string, @CurrentUser() user: ReqUser) {
    return this.service.getPeriods(user.organizationId, Number(year) || new Date().getFullYear());
  }

  @Post('mark-paid')
  markPaid(@Body() dto: MarkPaidDto, @CurrentUser() user: ReqUser) {
    return this.service.markPaid(user.organizationId, dto.periodFrom, dto.periodTo, dto.paidAmount, dto.paidDate, dto.reference);
  }

  @Delete(':recordId')
  unmarkPaid(@Param('recordId', ParseIntPipe) recordId: number, @CurrentUser() user: ReqUser) {
    return this.service.unmarkPaid(user.organizationId, recordId);
  }
}
