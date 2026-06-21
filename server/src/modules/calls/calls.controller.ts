import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { CallsService } from './calls.service';
import { CreateCallDto } from './dto/create-call.dto';
import { UpdateCallDto } from './dto/update-call.dto';
import { UpdateCallStatusDto } from './dto/update-call-status.dto';
import { AddNoteDto } from './dto/add-note.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || '20', 10) * 1024 * 1024;

@Controller('calls')
@UseGuards(JwtAuthGuard)
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  @Post()
  create(@Body() dto: CreateCallDto, @CurrentUser() user: { id: number; organizationId: number | null }) {
    return this.callsService.create(user.id, user.organizationId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: { organizationId: number | null }) {
    return this.callsService.findAll({ organizationId: user.organizationId });
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const [call, notes, attachments] = await Promise.all([
      this.callsService.findOne(id),
      this.callsService.findNotes(id),
      this.callsService.findAttachments(id),
    ]);
    return { ...call, notes, attachments };
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.callsService.remove(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCallDto) {
    return this.callsService.update(id, dto);
  }

  @Post(':id/status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCallStatusDto,
    @CurrentUser() user: { id: number },
  ) {
    return this.callsService.updateStatus(id, user.id, dto.status);
  }

  @Post(':id/notes')
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: MAX_FILE_SIZE } }))
  addNote(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddNoteDto,
    @CurrentUser() user: { id: number },
    @UploadedFile() photo?: { buffer: Buffer; mimetype: string },
  ) {
    if (!dto.text && !photo) {
      throw new BadRequestException('A note needs text and/or a photo');
    }
    return this.callsService.addNote(id, user.id, dto.text, photo);
  }

  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  addAttachment(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number },
    @UploadedFile() file?: { originalname: string; buffer: Buffer; mimetype: string },
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    return this.callsService.addAttachment(id, user.id, file);
  }

  // --- Viewing already-added photos/documents on a call (spec item 1) ---

  @Get('notes/:noteId/photo')
  async downloadNotePhoto(@Param('noteId', ParseIntPipe) noteId: number, @Res() res: Response) {
    const file = await this.callsService.downloadNotePhoto(noteId);
    res.set({
      'Content-Type': file.mimetype,
      'Content-Disposition': `inline; filename="${file.filename.replace(/"/g, '')}"`,
    });
    res.send(file.buffer);
  }

  @Get('attachments/:attachmentId/download')
  async downloadAttachment(@Param('attachmentId', ParseIntPipe) attachmentId: number, @Res() res: Response) {
    const file = await this.callsService.downloadAttachment(attachmentId);
    res.set({
      'Content-Type': file.mimetype,
      'Content-Disposition': `inline; filename="${file.filename.replace(/"/g, '')}"`,
    });
    res.send(file.buffer);
  }
}
