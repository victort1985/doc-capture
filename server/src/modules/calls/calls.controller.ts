import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CallsService } from './calls.service';
import { CreateCallDto } from './dto/create-call.dto';
import { UpdateCallStatusDto } from './dto/update-call-status.dto';
import { AddNoteDto } from './dto/add-note.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || '20', 10) * 1024 * 1024;

@Controller('calls')
@UseGuards(JwtAuthGuard)
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  @Post()
  create(@Body() dto: CreateCallDto, @CurrentUser() user: { id: number }) {
    return this.callsService.create(user.id, dto);
  }

  @Get()
  findAll() {
    return this.callsService.findAll();
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
}
