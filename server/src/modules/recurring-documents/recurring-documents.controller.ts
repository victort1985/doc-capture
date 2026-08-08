import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { RecurringDocumentsService } from './recurring-documents.service';
import { CreateRecurringTemplateDto, UpdateRecurringTemplateDto } from './dto/recurring-template.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type ReqUser = { id: number; organizationId: number | null };

@Controller('recurring-documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class RecurringDocumentsController {
  constructor(private readonly service: RecurringDocumentsService) {}

  @Post()
  create(@Body() dto: CreateRecurringTemplateDto, @CurrentUser() user: ReqUser) {
    return this.service.create(user.organizationId, user.id, dto);
  }

  @Get()
  findAll(@CurrentUser() user: ReqUser) {
    return this.service.findAll(user.organizationId);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRecurringTemplateDto, @CurrentUser() user: ReqUser) {
    return this.service.update(id, user.organizationId, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser) {
    return this.service.remove(id, user.organizationId);
  }

  @Post(':id/run-now')
  runNow(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser) {
    return this.service.runNow(id, user.organizationId);
  }
}
