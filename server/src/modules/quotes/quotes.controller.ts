import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { QuotesService } from './quotes.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type ReqUser = { id: number; organizationId: number | null };

@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@CurrentUser() user: ReqUser) {
    return this.quotesService.findAll(user.organizationId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser) {
    return this.quotesService.findOne(id, user.organizationId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateQuoteDto, @CurrentUser() user: ReqUser) {
    return this.quotesService.create(user.organizationId, user.id, dto);
  }

  @Post(':id/send')
  @UseGuards(JwtAuthGuard)
  markSent(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser) {
    return this.quotesService.markSent(id, user.organizationId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser) {
    await this.quotesService.remove(id, user.organizationId);
    return { deleted: true };
  }

  // ── Client-facing (no auth — the token is the credential) ──────────
  @Get('public/:token')
  getByToken(@Param('token') token: string) {
    return this.quotesService.findByToken(token);
  }

  @Post('public/:token/approve')
  approve(@Param('token') token: string) {
    return this.quotesService.respond(token, true);
  }

  @Post('public/:token/decline')
  decline(@Param('token') token: string) {
    return this.quotesService.respond(token, false);
  }
}
