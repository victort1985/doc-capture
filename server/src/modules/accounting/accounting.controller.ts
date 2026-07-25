import { Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

type ReqUser = { organizationId: number | null };

@Controller('accounting')
@UseGuards(JwtAuthGuard)
export class AccountingController {
  constructor(private readonly service: AccountingService) {}

  @Get('accounts')
  findAllAccounts(@CurrentUser() user: ReqUser) {
    return this.service.findAllAccounts(user.organizationId);
  }

  @Post('accounts/seed-defaults')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  seedDefaults(@CurrentUser() user: ReqUser) {
    if (user.organizationId == null) return [];
    return this.service.seedDefaultAccounts(user.organizationId);
  }

  @Get('trial-balance')
  trialBalance(@CurrentUser() user: ReqUser, @Query('from') from: string, @Query('to') to: string) {
    return this.service.trialBalance(user.organizationId, from, to);
  }

  @Get('general-ledger/:accountId')
  generalLedger(
    @Param('accountId', ParseIntPipe) accountId: number,
    @CurrentUser() user: ReqUser,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.service.generalLedger(user.organizationId, accountId, from, to);
  }
}
