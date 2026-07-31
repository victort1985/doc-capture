import { Controller, Delete, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { BackupService } from './backup.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('backup')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class BackupController {
  constructor(private readonly service: BackupService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  createNow() {
    return this.service.createNow();
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
}
