import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CardAcquiringService } from './card-acquiring.service';
import { CardAcquiringProvider } from './entities/card-acquiring-settings.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type ReqUser = { organizationId: number | null };

class UpdateSettingsDto {
  @IsEnum(CardAcquiringProvider)
  provider: CardAcquiringProvider;

  @IsString()
  @IsOptional()
  apiKey?: string;
}

class ChargeDto {
  @IsString()
  amountIls: string;

  @IsString()
  cardToken: string;
}

@Controller('card-acquiring')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class CardAcquiringController {
  constructor(private readonly service: CardAcquiringService) {}

  @Get('settings')
  getSettings(@CurrentUser() user: ReqUser) {
    return this.service.getSettings(user.organizationId);
  }

  @Post('settings')
  updateSettings(@Body() dto: UpdateSettingsDto, @CurrentUser() user: ReqUser) {
    return this.service.updateSettings(user.organizationId, dto.provider, dto.apiKey);
  }

  /** Always fails right now — see CardAcquiringService.charge's own
   * doc comment. Exists as an endpoint so the admin panel's own
   * "attempt a card charge" button (which deliberately surfaces this
   * failure clearly rather than hiding the feature entirely) has
   * something real to call. */
  @Post('charge')
  charge(@Body() dto: ChargeDto, @CurrentUser() user: ReqUser) {
    return this.service.charge(user.organizationId, Number(dto.amountIls), dto.cardToken);
  }
}
