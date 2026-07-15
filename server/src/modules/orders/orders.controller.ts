import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { OrdersService } from './orders.service';
import { CompleteOrderDto } from './dto/complete-order.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type RequestUser = { id: number; organizationId: number | null };

const MAX_FILE_SIZE = 30 * 1024 * 1024;

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.ordersService.findAll(user.organizationId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: RequestUser) {
    return this.ordersService.findOne(id, user.organizationId);
  }

  @Get(':id/pdf')
  async downloadPdf(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: RequestUser, @Res() res: Response) {
    const order = await this.ordersService.findOne(id, user.organizationId);
    const buffer = await this.ordersService.getPdfBuffer(order);
    res.set({ 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' });
    res.send(buffer);
  }

  /** Manual capture — the person already produced a single-page PDF
   * via the same scan flow used elsewhere in the app (camera/gallery/
   * file -> crop & filter -> PDF bytes) and just uploads it here. */
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  async create(@UploadedFile() file: { buffer: Buffer } | undefined, @CurrentUser() user: RequestUser) {
    if (!file) throw new BadRequestException('No file provided');
    const order = await this.ordersService.createManual(user.id, user.organizationId, file.buffer);
    return this.ordersService.toListItem(order);
  }

  /** Attaches the scanned delivery note as page 2+ and marks the order
   * complete with the given invoice number. */
  @Post(':id/invoice')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  async addInvoice(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CompleteOrderDto,
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    const order = await this.ordersService.addInvoicePage(id, user.organizationId, dto.invoiceNumber, file.buffer);
    return this.ordersService.toListItem(order);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: RequestUser) {
    await this.ordersService.remove(id, user.organizationId);
    return { removed: true };
  }
}
