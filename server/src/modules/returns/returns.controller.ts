import { Body, Controller, Get, Param, ParseIntPipe, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ReturnsService } from './returns.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type ReqUser = { id: number; organizationId: number | null };

@Controller('returns')
@UseGuards(JwtAuthGuard)
export class ReturnsController {
  constructor(private readonly service: ReturnsService) {}

  @Get()
  findAll(@CurrentUser() user: ReqUser) {
    return this.service.findAll(user.organizationId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser) {
    return this.service.findOne(id, user.organizationId);
  }

  @Get(':id/pdf')
  async getPdf(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser, @Res() res: Response) {
    const buffer = await this.service.getPdfBuffer(id, user.organizationId);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="return-${id}.pdf"` });
    res.send(buffer);
  }

  @Post()
  create(@Body() dto: CreateReturnDto, @CurrentUser() user: ReqUser) {
    return this.service.create(user.organizationId, user.id, dto);
  }
}
