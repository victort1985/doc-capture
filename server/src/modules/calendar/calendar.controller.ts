import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { CalendarService } from './calendar.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type RequestUser = { id: number; organizationId: number | null; role: string; isGlobal: boolean };
const MAX_FILE_SIZE = 20 * 1024 * 1024;

@Controller('calendar')
@UseGuards(JwtAuthGuard)
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get('organizations')
  listOrgsWithCalendars(@CurrentUser() user: RequestUser) {
    const privileged = user.organizationId == null || user.isGlobal || user.role === 'admin';
    if (!privileged) return [];
    return this.calendarService.listOrgsWithCalendars();
  }

  // GET /calendar/events?from=ISO&to=ISO[&organizationId=N]
  @Get('events')
  listEvents(
    @CurrentUser() user: RequestUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('organizationId') orgIdParam?: string,
  ) {
    const privileged = user.organizationId == null || user.isGlobal || user.role === 'admin';
    const targetOrgId = (privileged && orgIdParam) ? parseInt(orgIdParam) : user.organizationId;
    if (targetOrgId == null) return [];
    return this.calendarService.listEvents(targetOrgId, new Date(from), new Date(to));
  }

  @Post('events')
  createEvent(@CurrentUser() user: RequestUser, @Body() dto: CreateEventDto) {
    if (user.organizationId == null) return null;
    return this.calendarService.createEvent(user.organizationId, user.id, dto);
  }

  @Patch('events/:id')
  updateEvent(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateEventDto,
  ) {
    if (user.organizationId == null) return null;
    return this.calendarService.updateEvent(id, user.organizationId, dto);
  }

  @Delete('events/:id')
  removeEvent(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: RequestUser) {
    if (user.organizationId == null) return null;
    return this.calendarService.removeEvent(id, user.organizationId);
  }

  @Post('events/:id/attachments')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  addAttachment(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: RequestUser,
    @UploadedFile() file?: { originalname: string; buffer: Buffer; mimetype: string },
  ) {
    if (!file || user.organizationId == null) return null;
    return this.calendarService.addAttachment(id, user.organizationId, user.id, file);
  }

  @Get('attachments/:id/download')
  async downloadAttachment(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    if (user.organizationId == null) { res.status(403).end(); return; }
    const file = await this.calendarService.downloadAttachment(id, user.organizationId);
    res.set({ 'Content-Type': file.mimetype, 'Content-Disposition': `inline; filename="${file.originalName.replace(/"/g, '')}"` });
    res.send(file.buffer);
  }

  @Delete('attachments/:id')
  removeAttachment(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: RequestUser) {
    if (user.organizationId == null) return null;
    return this.calendarService.removeAttachment(id, user.organizationId);
  }
}
