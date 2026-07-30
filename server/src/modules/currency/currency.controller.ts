import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ExchangeRateService, SUPPORTED_CURRENCIES } from './exchange-rate.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('currency')
@UseGuards(JwtAuthGuard)
export class CurrencyController {
  constructor(private readonly service: ExchangeRateService) {}

  @Get('supported')
  supported() {
    return SUPPORTED_CURRENCIES;
  }

  @Get('rate')
  async rate(@Query('currency') currency: string, @Query('date') date?: string) {
    return { currency, date: date ?? new Date().toISOString().slice(0, 10), rateToIls: await this.service.getRate(currency, date) };
  }

  @Get('history')
  async history(@Query('currency') currency: string, @Query('days') days?: string) {
    return this.service.listRecent(currency, days ? Number(days) : 30);
  }

  @Post('manual-rate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async setManual(@Body() body: { currency: string; date: string; rateToIls: number }) {
    return this.service.setManualRate(body.currency, body.date, body.rateToIls);
  }
}
