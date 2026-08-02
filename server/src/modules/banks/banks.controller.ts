import { BadRequestException, Controller, Get, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BanksService } from './banks.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('banks')
@UseGuards(JwtAuthGuard)
export class BanksController {
  constructor(private readonly service: BanksService) {}

  /** Reference data every authenticated user can read — this is the
   * same "which bank/branch" lookup used across payment, expense, and
   * settings forms throughout the app, not an admin-only feature. */
  @Get()
  search(@Query('q') q?: string) {
    return this.service.searchBanks(q ?? '');
  }

  @Get('branches')
  searchBranches(@Query('bankCode') bankCode: string, @Query('q') q?: string) {
    if (!bankCode) throw new BadRequestException('bankCode is required');
    return this.service.searchBranches(bankCode, q ?? '');
  }

  @Get('branches/count')
  async branchCount() {
    return { count: await this.service.branchCount() };
  }

  @Post('branches/import-csv')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async importCsv(@UploadedFile() file: { buffer: Buffer } | undefined) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.service.importCsv(file.buffer.toString('utf-8'));
  }
}
