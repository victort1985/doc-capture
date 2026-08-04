import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { BackupService } from './backup.service';
import { BackupSchedulerService, UpdateBackupScheduleDto } from './backup-scheduler.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';

@Controller('backup')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class BackupController {
  constructor(
    private readonly service: BackupService,
    private readonly scheduler: BackupSchedulerService,
  ) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  createNow() {
    return this.service.createNow('manual');
  }

  @Get(':filename/download')
  async download(@Param('filename') filename: string, @Res() res: Response) {
    const buffer = await this.service.getDecryptedForDownload(filename);
    const downloadName = filename.replace(/\.enc$/, ''); // .sql.gz once decrypted
    res.set({
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="${downloadName}"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  @Delete(':filename')
  delete(@Param('filename') filename: string) {
    return this.service.delete(filename);
  }

  /** Genuinely destructive — see BackupService.restore()'s own doc
   * comment. Requires the literal string "RESTORE" in the request
   * body as a deliberate extra step beyond just clicking a button,
   * so this can't be triggered by a stray double-click or a client
   * bug replaying the request. */
  @Post(':filename/restore')
  async restore(@Param('filename') filename: string, @Body() body: { confirm?: string }) {
    if (body.confirm !== 'RESTORE') {
      throw new BadRequestException('Restore not confirmed — send { "confirm": "RESTORE" } to proceed. This is destructive and cannot be undone.');
    }
    await this.service.restore(filename);
    return { restored: true };
  }

  @Get('schedule')
  getSchedule() {
    return this.scheduler.getOrCreate();
  }

  @Post('schedule')
  updateSchedule(@Body() dto: UpdateBackupScheduleDto) {
    return this.scheduler.update(dto);
  }

  /** Restore-from-a-device-file, non-destructive: existing rows are
   * never deleted or overwritten, only rows missing from the current
   * database get added — see BackupService.mergeRestoreFromUpload()'s
   * own doc comment for exactly how. No confirm-string requirement
   * here the way the destructive restore has, since this mode can't
   * delete or overwrite anything by design. */
  @Post('restore-merge')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 500 * 1024 * 1024 } }))
  async restoreMerge(@UploadedFile() file: { buffer: Buffer } | undefined) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.service.mergeRestoreFromUpload(file.buffer);
  }
}
