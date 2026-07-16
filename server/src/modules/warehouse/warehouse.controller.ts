import { Body, Controller, Delete, ForbiddenException, Get, Param, ParseIntPipe, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { WarehouseService } from './warehouse.service';
import { TransactionType } from './entities/warehouse-transaction.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

type RequestUser = { id: number; organizationId: number | null; permissions?: Record<string, boolean> };

@Controller('warehouse')
@UseGuards(JwtAuthGuard)
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  // ── Barcode ────────────────────────────────────────────────────────

  @Get('generate-barcode')
  generateBarcode(@Query('prefix') prefix?: string) {
    return this.warehouseService.generateBarcode(prefix);
  }

  // ── Categories ─────────────────────────────────────────────────────

  @Get('categories')
  findCategories(@CurrentUser() user: RequestUser) {
    return this.warehouseService.findCategories(user.organizationId);
  }

  @Post('categories')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  createCategory(@Body() dto: { name: string; description?: string }, @CurrentUser() user: RequestUser) {
    return this.warehouseService.createCategory(dto.name, dto.description, user.organizationId);
  }

  @Delete('categories/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  removeCategory(@Param('id', ParseIntPipe) id: number) {
    return this.warehouseService.removeCategory(id);
  }

  // ── Items ──────────────────────────────────────────────────────────

  @Get('items')
  findItems(@CurrentUser() user: RequestUser, @Query('categoryId') catId?: string, @Query('q') q?: string, @Query('locationId') locationId?: string, @Query('mainOnly') mainOnly?: string) {
    return this.warehouseService.findItems(user.organizationId, catId ? parseInt(catId) : undefined, q, locationId ? parseInt(locationId) : undefined, mainOnly === 'true');
  }

  @Get('items/by-barcode/:barcode')
  findByBarcode(@Param('barcode') barcode: string, @CurrentUser() user: RequestUser) {
    return this.warehouseService.findItemByBarcode(barcode, user.organizationId);
  }

  @Post('items')
  createItem(@Body() dto: any, @CurrentUser() user: RequestUser) {
    return this.warehouseService.createItem(dto, user.organizationId);
  }

  @Patch('items/:id')
  updateItem(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @CurrentUser() user: RequestUser) {
    return this.warehouseService.updateItem(id, dto, user.organizationId);
  }

  @Delete('items/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  removeItem(@Param('id', ParseIntPipe) id: number) {
    return this.warehouseService.removeItem(id);
  }

  // ── Transactions ───────────────────────────────────────────────────

  @Get('items/:id/transactions')
  findTransactions(@Param('id', ParseIntPipe) id: number) {
    return this.warehouseService.findTransactions(id);
  }

  @Post('items/:id/transactions')
  addTransaction(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { type: TransactionType; quantity: number; reason?: string; referenceCallId?: number },
    @CurrentUser() user: RequestUser,
  ) {
    return this.warehouseService.addTransaction(id, dto.type, dto.quantity, dto.reason, dto.referenceCallId, user.id);
  }

  // ── Repairs ────────────────────────────────────────────────────────

  /** Send item to repair — sets repairStatus = 'in_repair', creates repair record */
  @Post('items/:id/repair')
  sendToRepair(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { supplierName?: string; supplierPhone?: string; supplierEmail?: string; reason?: string; barcode?: string; notes?: string },
  ) {
    return this.warehouseService.sendToRepair(id, dto);
  }

  /** Mark item as returned from repair */
  @Post('repairs/:repairId/return')
  returnFromRepair(
    @Param('repairId', ParseIntPipe) repairId: number,
    @Body() dto: { notes?: string },
  ) {
    return this.warehouseService.returnFromRepair(repairId, dto.notes);
  }

  /** List all active repairs for the org */
  @Get('repairs')
  listRepairs(@CurrentUser() user: RequestUser) {
    if (!user.organizationId) return [];
    return this.warehouseService.listRepairs(user.organizationId);
  }

  /** Get repair history for a specific item */
  @Get('items/:id/repairs')
  getItemRepairs(@Param('id', ParseIntPipe) id: number) {
    return this.warehouseService.getItemRepairs(id);
  }

  /** Full chronological history for one piece of equipment: stock
   * in/out (with the service call it was used on, if any), repairs
   * sent/returned, and cross-location transfers — one timeline. */
  @Get('items/:id/history')
  getItemHistory(@Param('id', ParseIntPipe) id: number) {
    return this.warehouseService.getItemHistory(id);
  }

  // ── Location-to-location transfers ────────────────────────────────

  /** History of equipment transfers between locations. */
  @Get('transfers')
  listTransfers(@CurrentUser() user: RequestUser) {
    return this.warehouseService.listTransfers(user.organizationId);
  }

  /** Move equipment from one location's warehouse to another. Only users
   * with the `warehouseTransfer` permission (set in the admin panel) may
   * do this. */
  @Post('transfers')
  createTransfer(
    @Body() dto: { fromLocationId: number; toLocationId: number; itemIds: number[]; notes?: string },
    @CurrentUser() user: RequestUser,
  ) {
    if (!user.permissions?.warehouseTransfer) {
      throw new ForbiddenException('You do not have permission to transfer warehouse equipment');
    }
    return this.warehouseService.createTransfer(dto, user.id, user.organizationId);
  }
}
