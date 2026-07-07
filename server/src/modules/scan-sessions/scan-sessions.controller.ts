import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Param,
  ParseIntPipe,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ScanSessionsService } from './scan-sessions.service';
import { StartScanDto } from './dto/start-scan.dto';
import { RenderScanDto } from './dto/render-scan.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB || '20', 10)) * 1024 * 1024;

/**
 * The review-before-commit flow: start (upload + auto-detect) -> any
 * number of preview calls (drag corners / change filter / adjust
 * brightness+contrast / toggle shadow removal) -> finalize (commit to
 * real storage) or cancel (discard). See ScanSession's doc comment.
 */
@Controller('scan')
@UseGuards(JwtAuthGuard)
export class ScanSessionsController {
  constructor(private readonly scanSessions: ScanSessionsService) {}

  @Post('start')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  async start(
    @UploadedFile() file: { originalname: string; buffer: Buffer; mimetype: string },
    @Body() dto: StartScanDto,
    @CurrentUser() user: { id: number },
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    return this.scanSessions.start(user.id, dto, file);
  }

  /** Returns rendered image bytes directly (not JSON) so the client can
   * drop them straight into an <img>/Image widget. */
  @Post(':id/preview')
  async preview(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RenderScanDto,
    @CurrentUser() user: { id: number },
    @Res() res: Response,
  ) {
    const image = await this.scanSessions.render(id, user.id, dto);
    res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
    res.send(image);
  }

  @Post(':id/finalize')
  async finalize(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RenderScanDto,
    @CurrentUser() user: { id: number; username: string },
  ) {
    return this.scanSessions.finalize(id, user.id, user.username, dto);
  }

  @Delete(':id')
  async cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: { id: number }) {
    await this.scanSessions.cancel(id, user.id);
    return { cancelled: true };
  }
}
