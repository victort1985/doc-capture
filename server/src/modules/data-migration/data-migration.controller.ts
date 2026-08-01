import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { DataMigrationService } from './data-migration.service';
import { MigrationJobsService } from './migration-jobs.service';
import { RunImportDto } from './dto/run-import.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type ReqUser = { id: number; organizationId: number | null };

@Controller('data-migration')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class DataMigrationController {
  constructor(
    private readonly service: DataMigrationService,
    private readonly jobs: MigrationJobsService,
  ) {}

  @Post('import/analyze')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async analyze(@UploadedFile() file: { originalname: string; buffer: Buffer } | undefined) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.service.analyzeImportFile(file.buffer, file.originalname);
  }

  @Post('import/run')
  runImport(@Body() dto: RunImportDto, @CurrentUser() user: ReqUser) {
    const jobId = this.service.startContactsImport(dto, user.id, user.organizationId);
    return { jobId };
  }

  @Post('export')
  async runExport(
    @Body() body: { entity: 'contacts' | 'warehouse'; format: 'csv' | 'xlsx' | 'json' },
    @CurrentUser() user: ReqUser,
  ) {
    const jobId = await this.service.startExport(body.entity, body.format, user.organizationId);
    return { jobId };
  }

  @Get('jobs/:id')
  getJobStatus(@Param('id') id: string) {
    const job = this.jobs.get(id);
    if (!job) throw new NotFoundException('Job not found or expired');
    // Never send the file buffer itself over the status-polling
    // endpoint — that's what /jobs/:id/download is for; keeping it
    // out here is what makes the frequent poll cheap.
    const status = { ...job };
    delete status.fileBuffer;
    return status;
  }

  @Get('jobs/:id/download')
  download(@Param('id') id: string, @Res() res: Response) {
    const job = this.jobs.get(id);
    if (!job || !job.fileBuffer) throw new NotFoundException('File not found or expired');
    res.set({
      'Content-Type': job.fileMimeType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${job.fileName}"`,
    });
    res.send(job.fileBuffer);
  }
}
