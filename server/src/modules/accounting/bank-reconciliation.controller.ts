import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, UploadedFile, UseGuards, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BankReconciliationService } from './bank-reconciliation.service';
import { BankLineStatus } from './entities/bank-statement-line.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type ReqUser = { organizationId: number | null };
const MAX_FILE_SIZE = 10 * 1024 * 1024;

@Controller('bank-reconciliation')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class BankReconciliationController {
  constructor(private readonly service: BankReconciliationService) {}

  private requireOrg(user: ReqUser): number {
    if (user.organizationId == null) {
      throw new BadRequestException('Pick which organization to reconcile (use the organization switcher in the header).');
    }
    return user.organizationId;
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  async import(@UploadedFile() file: { buffer: Buffer; originalname: string } | undefined, @CurrentUser() user: ReqUser) {
    if (!file) throw new BadRequestException('No file provided');
    return this.service.importStatement(this.requireOrg(user), file.buffer, file.originalname);
  }

  @Get('lines')
  lines(@CurrentUser() user: ReqUser, @Query('status') status?: BankLineStatus) {
    return this.service.listLines(this.requireOrg(user), status);
  }

  @Get('summary')
  summary(@CurrentUser() user: ReqUser) {
    return this.service.summary(this.requireOrg(user));
  }

  @Get(':id/suggestions')
  suggestions(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser) {
    return this.service.suggestMatches(this.requireOrg(user), id);
  }

  @Post(':id/match')
  match(@Param('id', ParseIntPipe) id: number, @Body() body: { ledgerEntryId: number }, @CurrentUser() user: ReqUser) {
    return this.service.confirmMatch(this.requireOrg(user), id, body.ledgerEntryId);
  }

  @Post(':id/unmatch')
  unmatch(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser) {
    return this.service.unmatch(this.requireOrg(user), id);
  }

  @Post(':id/ignore')
  ignore(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser) {
    return this.service.ignoreLine(this.requireOrg(user), id);
  }

  @Delete('batch/:importBatchId')
  deleteBatch(@Param('importBatchId') importBatchId: string, @CurrentUser() user: ReqUser) {
    return this.service.deleteBatch(this.requireOrg(user), importBatchId);
  }
}
