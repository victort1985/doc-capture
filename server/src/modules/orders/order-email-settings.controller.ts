import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { OrderEmailSettingsService } from './order-email-settings.service';
import { UpdateEmailSettingsDto } from './dto/update-email-settings.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('orders/email-settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class OrderEmailSettingsController {
  constructor(private readonly settingsService: OrderEmailSettingsService) {}

  @Get()
  async get() {
    const settings = await this.settingsService.get();
    // appPassword is select:false already, so it's never present here
    // to begin with -- returning the entity directly is safe.
    return settings;
  }

  @Put()
  update(@Body() dto: UpdateEmailSettingsDto) {
    return this.settingsService.update(dto);
  }
}
