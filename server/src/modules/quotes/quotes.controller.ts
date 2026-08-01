import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { QuotesService } from './quotes.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { SaveAsTemplateDto } from './dto/save-as-template.dto';
import { CreateFromTemplateDto } from './dto/create-from-template.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type ReqUser = { id: number; organizationId: number | null };

@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@CurrentUser() user: ReqUser, @Query('orgId') orgId?: string) {
    // Only a super-admin (organizationId === null) can pick a
    // different org to look at — a regular admin is always scoped to
    // their own, regardless of what's in the query string.
    const effectiveOrgId = user.organizationId == null && orgId ? Number(orgId) : user.organizationId;
    return this.quotesService.findAll(effectiveOrgId);
  }

  /** Must come before @Get(':id') — otherwise "templates" would be
   * swallowed as if it were an :id value. */
  @Get('templates')
  @UseGuards(JwtAuthGuard)
  findTemplates(@CurrentUser() user: ReqUser) {
    return this.quotesService.findTemplates(user.organizationId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser) {
    return this.quotesService.findOne(id, user.organizationId);
  }

  @Get(':id/pdf')
  @UseGuards(JwtAuthGuard)
  async getPdf(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser, @Res() res: Response) {
    const buffer = await this.quotesService.getPdfBuffer(id, user.organizationId);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="quote-${id}.pdf"` });
    res.send(buffer);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateQuoteDto, @CurrentUser() user: ReqUser) {
    return this.quotesService.create(user.organizationId, user.id, dto);
  }

  /** Converts an already-created quote into a reusable template — see
   * Quote.isTemplate's own doc comment for the full rationale. */
  @Post(':id/save-as-template')
  @UseGuards(JwtAuthGuard)
  saveAsTemplate(@Param('id', ParseIntPipe) id: number, @Body() dto: SaveAsTemplateDto, @CurrentUser() user: ReqUser) {
    return this.quotesService.saveAsTemplate(id, user.organizationId, dto.templateName);
  }

  @Post(':id/unmark-template')
  @UseGuards(JwtAuthGuard)
  unmarkTemplate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser) {
    return this.quotesService.unmarkTemplate(id, user.organizationId);
  }

  /** Creates a genuine new draft quote from a template — any field in
   * the body overrides the template's own value, so "replace or add
   * only part of the information" is just sending whatever actually
   * changed. */
  @Post('from-template/:id')
  @UseGuards(JwtAuthGuard)
  createFromTemplate(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateFromTemplateDto, @CurrentUser() user: ReqUser) {
    return this.quotesService.createFromTemplate(id, user.organizationId, user.id, dto);
  }

  @Post(':id/send')
  @UseGuards(JwtAuthGuard)
  markSent(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser) {
    return this.quotesService.markSent(id, user.organizationId);
  }

  @Post(':id/regenerate-pdf')
  @UseGuards(JwtAuthGuard)
  regeneratePdf(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser) {
    return this.quotesService.regeneratePdf(id, user.organizationId);
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
