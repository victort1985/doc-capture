import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { FilesInterceptor } from '@nestjs/platform-express';
import { FilesService } from './files.service';
import { TemplatesService } from '../templates/templates.service';
import { UploadFilesDto } from './dto/upload-files.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB || '20', 10)) * 1024 * 1024;

@Controller('files')
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(
    private readonly filesService: FilesService,
    private readonly templatesService: TemplatesService,
  ) {}

  @Post('upload')
  @UseInterceptors(
    FilesInterceptor('files', 20, { limits: { fileSize: MAX_FILE_SIZE } }),
  )
  async upload(
    @UploadedFiles() files: Array<{ originalname: string; buffer: Buffer; mimetype: string }>,
    @Body() dto: UploadFilesDto,
    @CurrentUser() user: { id: number; username: string },
  ) {
    if (!files?.length) {
      throw new BadRequestException('No files provided');
    }
    return this.filesService.uploadBatch(user.id, user.username, dto.place, dto.docType, files);
  }

  /**
   * File log. Admins see everything (optionally filtered by userId/type/
   * date range, e.g. for the admin-panel File log page). Regular users
   * (mobile app, "History" tab) only ever see their own uploads — any
   * userId they pass is ignored, never trusted from the client.
   */
  @Get()
  findFileRecords(
    @CurrentUser() user: { id: number; role: UserRole },
    @Query('userId') userId?: string,
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const isAdmin = user.role === UserRole.ADMIN;
    return this.templatesService.findFileRecords({
      userId: isAdmin ? (userId ? parseInt(userId, 10) : undefined) : user.id,
      type,
      from,
      to,
    });
  }

  /** Admin can download anything; a regular user can only download their own uploads. */
  @Get(':id/download')
  async download(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number; role: UserRole },
    @Res() res: Response,
  ) {
    const record = await this.templatesService.findRecordById(id);
    if (user.role !== UserRole.ADMIN && record.user.id !== user.id) {
      throw new ForbiddenException('Forbidden resource');
    }
    const file = await this.filesService.downloadFile(id);
    res.set({
      'Content-Type': file.mimetype,
      'Content-Disposition': `attachment; filename="${file.filename.replace(/"/g, '')}"`,
    });
    res.send(file.buffer);
  }

  /** Bulk "Clear" button on the admin File log page. Same filters as
   * the list (GET) — omit them to clear everything. */
  @Delete()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async clearAll(
    @Query('userId') userId?: string,
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.filesService.clearAll({
      userId: userId ? parseInt(userId, 10) : undefined,
      type,
      from,
      to,
    });
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async deleteFile(@Param('id', ParseIntPipe) id: number) {
    await this.filesService.deleteFile(id);
    return { deleted: true };
  }
}
