import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { TemplateDesignService } from './template-design.service';
import { UpdateTemplateDesignDto } from './dto/update-template-design.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type ReqUser = { organizationId: number | null };

@Controller('template-design')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class TemplateDesignController {
  constructor(private readonly service: TemplateDesignService) {}

  @Get()
  async get(@CurrentUser() user: ReqUser) {
    if (user.organizationId == null) return null;
    return this.service.findOrCreate(user.organizationId);
  }

  @Post()
  async update(@Body() dto: UpdateTemplateDesignDto, @CurrentUser() user: ReqUser) {
    if (user.organizationId == null) return null;
    return this.service.update(user.organizationId, dto);
  }
}
