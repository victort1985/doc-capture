import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { WarehouseService } from './warehouse.service';
import { TransactionType } from './entities/warehouse-transaction.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

type RequestUser = { id: number; organizationId: number | null };

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
  findItems(@CurrentUser() user: RequestUser, @Query('categoryId') catId?: string, @Query('q') q?: string) {
    return this.warehouseService.findItems(user.organizationId, catId ? parseInt(catId) : undefined, q);
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
}
