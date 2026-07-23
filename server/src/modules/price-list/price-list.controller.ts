import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PriceListService, CreatePriceListItemDto, UpdatePriceListItemDto } from './price-list.service';
import { PriceListItemType } from './entities/price-list-item.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type RequestUser = { id: number; organizationId: number | null };

@Controller('price-list')
@UseGuards(JwtAuthGuard)
export class PriceListController {
  constructor(private readonly service: PriceListService) {}

  private effectiveOrgId(user: RequestUser, orgId?: string): number | null {
    return user.organizationId == null && orgId ? Number(orgId) : user.organizationId;
  }

  @Get()
  findAll(@CurrentUser() user: RequestUser, @Query('orgId') orgId?: string, @Query('type') type?: PriceListItemType) {
    return this.service.findAll(this.effectiveOrgId(user, orgId), type);
  }

  @Post()
  create(@Body() dto: CreatePriceListItemDto, @CurrentUser() user: RequestUser, @Query('orgId') orgId?: string) {
    return this.service.create(this.effectiveOrgId(user, orgId), dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePriceListItemDto,
    @CurrentUser() user: RequestUser,
    @Query('orgId') orgId?: string,
  ) {
    return this.service.update(id, this.effectiveOrgId(user, orgId), dto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: RequestUser, @Query('orgId') orgId?: string) {
    await this.service.remove(id, this.effectiveOrgId(user, orgId));
    return { deleted: true };
  }
}
