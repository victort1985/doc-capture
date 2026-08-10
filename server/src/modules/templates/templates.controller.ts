import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type ReqUser = { organizationId: number | null };

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get('templates')
  findAll(@CurrentUser() user: ReqUser) {
    return this.templatesService.findAll(user);
  }

  @Post('templates')
  create(@Body() dto: CreateTemplateDto, @CurrentUser() user: ReqUser) {
    return this.templatesService.create(user, dto);
  }

  @Patch('templates/:id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTemplateDto, @CurrentUser() user: ReqUser) {
    return this.templatesService.update(id, user, dto);
  }

  @Delete('templates/:id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser) {
    return this.templatesService.remove(id, user);
  }
}
