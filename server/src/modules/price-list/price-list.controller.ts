import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { PriceListService, CreatePriceListItemDto, UpdatePriceListItemDto } from './price-list.service';
import { PriceTierService } from './price-tier.service';
import { PriceListItemType } from './entities/price-list-item.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type RequestUser = { id: number; organizationId: number | null };

@Controller('price-list')
@UseGuards(JwtAuthGuard)
export class PriceListController {
  constructor(
    private readonly service: PriceListService,
    private readonly tierService: PriceTierService,
  ) {}

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

  // ── Price tiers ───────────────────────────────────────────────────

  @Get('tiers')
  findAllTiers(@CurrentUser() user: RequestUser, @Query('orgId') orgId?: string) {
    return this.tierService.findAllTiers(this.effectiveOrgId(user, orgId));
  }

  @Post('tiers')
  createTier(@Body() body: { name: string }, @CurrentUser() user: RequestUser, @Query('orgId') orgId?: string) {
    return this.tierService.createTier(this.effectiveOrgId(user, orgId), body.name);
  }

  @Patch('tiers/:id')
  renameTier(@Param('id', ParseIntPipe) id: number, @Body() body: { name: string }, @CurrentUser() user: RequestUser, @Query('orgId') orgId?: string) {
    return this.tierService.renameTier(id, this.effectiveOrgId(user, orgId), body.name);
  }

  @Delete('tiers/:id')
  async removeTier(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: RequestUser, @Query('orgId') orgId?: string) {
    await this.tierService.removeTier(id, this.effectiveOrgId(user, orgId));
    return { deleted: true };
  }

  @Get('tiers/:id/catalog')
  getCatalogForTier(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: RequestUser, @Query('orgId') orgId?: string) {
    return this.tierService.getCatalogForTier(id, this.effectiveOrgId(user, orgId));
  }

  @Put('tiers/:id/overrides/:itemId')
  setOverride(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() body: { price: number | null },
    @CurrentUser() user: RequestUser,
    @Query('orgId') orgId?: string,
  ) {
    return this.tierService.setOverride(id, this.effectiveOrgId(user, orgId), itemId, body.price);
  }
}
