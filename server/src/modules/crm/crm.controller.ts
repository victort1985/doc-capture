import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { CrmService } from './crm.service';
import { CreateDealDto, UpdateDealDto, AddInteractionDto } from './dto/crm.dto';
import { DealStage } from './entities/deal.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type ReqUser = { id: number; organizationId: number | null; allowedOrganizationIds?: number[] };

@Controller('crm/deals')
@UseGuards(JwtAuthGuard)
export class CrmController {
  constructor(private readonly service: CrmService) {}

  @Get()
  findAll(@CurrentUser() user: ReqUser) {
    return this.service.findAll(user);
  }

  @Get('pipeline-summary')
  pipelineSummary(@CurrentUser() user: ReqUser) {
    return this.service.pipelineSummary(user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  create(@Body() dto: CreateDealDto, @CurrentUser() user: ReqUser) {
    return this.service.create(user.organizationId, user.id, dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDealDto, @CurrentUser() user: ReqUser) {
    return this.service.update(id, user, dto);
  }

  @Patch(':id/stage')
  markStage(@Param('id', ParseIntPipe) id: number, @Body() body: { stage: DealStage }, @CurrentUser() user: ReqUser) {
    return this.service.markStage(id, user, body.stage);
  }

  @Get(':id/interactions')
  getInteractions(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser) {
    return this.service.getInteractions(id, user);
  }

  @Post(':id/interactions')
  addInteraction(@Param('id', ParseIntPipe) id: number, @Body() dto: AddInteractionDto, @CurrentUser() user: ReqUser) {
    return this.service.addInteraction(id, user, user.id, dto.type, dto.text);
  }
}
