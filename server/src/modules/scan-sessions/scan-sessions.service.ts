import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { ScanSession } from './entities/scan-session.entity';
import { StartScanDto } from './dto/start-scan.dto';
import { RenderScanDto } from './dto/render-scan.dto';
import { CombineScanDto } from './dto/combine-scan.dto';
import { detectDocumentCorners, warpDocument, applyFilters, A4_RATIO, Quad, Point } from '../files/processors/document-scanner';
import { FilesService, UploadResult } from '../files/files.service';
import { TemplatesService } from '../templates/templates.service';
import { FileRecordType } from '../templates/entities/file-record.entity';

export interface StartScanResult {
  sessionId: number;
  corners: Point[];
  imageWidth: number;
  imageHeight: number;
  autoDetected: boolean;
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h — anything left over from an abandoned review (app closed mid-edit, etc.)
const A4_TARGET_WIDTH = 1700; // ~205 DPI at A4 width
const MAX_PDF_BYTES = 1 * 1024 * 1024;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * The capture -> auto-detect -> review (drag corners / pick a filter /
 * adjust brightness+contrast / toggle shadow removal, previewing each
 * change) -> confirm flow. Nothing here touches real storage or the
 * File log until finalize() — see ScanSession's doc comment for why
 * this exists as a separate buffer rather than processing straight
 * through on upload like the old flow did.
 */
@Injectable()
export class ScanSessionsService {
  constructor(
    @InjectRepository(ScanSession) private readonly repo: Repository<ScanSession>,
    private readonly filesService: FilesService,
    private readonly templatesService: TemplatesService,
  ) {}

  async start(
    userId: number,
    dto: StartScanDto,
    file: { originalname: string; buffer: Buffer; mimetype: string },
  ): Promise<StartScanResult> {
    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException(
        `Scan review needs a photo, not a "${file.mimetype || 'unknown'}" file. Pick straight from the file manager instead if you already have a finished PDF.`,
      );
    }

    const rotated = await sharp(file.buffer).rotate().toBuffer();
    const meta = await sharp(rotated).metadata();
    const width = meta.width!, height = meta.height!;

    let detected: Awaited<ReturnType<typeof detectDocumentCorners>> = null;
    try {
      detected = await detectDocumentCorners(rotated);
    } catch (err) {
      console.warn(`[ScanSessions] Auto-detect failed: ${(err as Error)?.message ?? err}`);
    }

    // Fall back to a full-frame quad (with a small margin) so the client
    // always has *something* to show/drag, even when auto-detection
    // couldn't find a confident document region.
    const margin = Math.round(Math.min(width, height) * 0.03);
    const fallbackCorners: Quad = [
      { x: margin, y: margin },
      { x: width - margin, y: margin },
      { x: width - margin, y: height - margin },
      { x: margin, y: height - margin },
    ];

    const session = await this.repo.save(this.repo.create({
      user: { id: userId } as any,
      originalImage: rotated,
      imageWidth: width,
      imageHeight: height,
      detectedCorners: detected?.corners ?? null,
      detectedTopCurve: detected?.topCurve ?? null,
      detectedBottomCurve: detected?.bottomCurve ?? null,
      detectedLeftCurve: detected?.leftCurve ?? null,
      detectedRightCurve: detected?.rightCurve ?? null,
      place: dto.place,
      docType: dto.docType,
      originalFilename: file.originalname,
    }));

    return {
      sessionId: session.id,
      corners: detected?.corners ?? fallbackCorners,
      imageWidth: width,
      imageHeight: height,
      autoDetected: !!detected,
    };
  }

  /** Renders a preview for the current corners/filter choice — nothing
   * is written anywhere, just the resulting image bytes. */
  async render(sessionId: number, userId: number, dto: RenderScanDto): Promise<Buffer> {
    const session = await this.getOwned(sessionId, userId);
    const corners = dto.corners.map((p) => ({ x: p.x, y: p.y })) as Quad;

    const curves = this.matchesDetected(session, corners)
      ? {
          topCurve: session.detectedTopCurve!, bottomCurve: session.detectedBottomCurve!,
          leftCurve: session.detectedLeftCurve!, rightCurve: session.detectedRightCurve!,
        }
      : undefined;
    const targetRatio = session.docType === 'document' ? A4_RATIO : undefined;

    const warped = await warpDocument(session.originalImage, corners, curves, targetRatio);
    return applyFilters(warped, {
      mode: dto.filter,
      brightness: dto.brightness,
      contrast: dto.contrast,
      removeShadows: dto.removeShadows,
    });
  }

  /** Renders with the given settings, then commits the result to real
   * storage exactly like the direct-upload path — this is the only
   * place a scan session's bytes ever leave the buffer. */
  async finalize(sessionId: number, userId: number, username: string, dto: RenderScanDto): Promise<UploadResult> {
    const session = await this.getOwned(sessionId, userId);
    const filtered = await this.render(sessionId, userId, dto);

    const docType = session.docType as 'document' | 'photo';
    const finalBuffer = docType === 'document'
      ? await this.wrapAsSizedPdf(filtered)
      : await this.capJpegSize(filtered, MAX_PHOTO_BYTES);

    const fileRecordType = docType === 'document' ? FileRecordType.DOCUMENT : FileRecordType.PHOTO;
    const counter = (await this.templatesService.countTodayRecords(session.place, fileRecordType)) + 1;

    const result = await this.filesService.commitProcessedFile(
      userId, username, session.place, docType, finalBuffer, session.originalFilename, counter, dto.customName,
    );

    await this.repo.delete(sessionId);
    return result;
  }

  /** Same rendering as finalize() (full quality wrap — a real PDF for
   * documents, a size-capped JPEG for photos) but returns the bytes
   * directly instead of committing to the user's configured storage —
   * for callers that want the file somewhere *other* than the normal
   * document/photo library, e.g. calendar attachments, which have their
   * own storage endpoint. Still deletes the session either way; this is
   * still the terminal step for it, just not the one that writes to
   * general storage. */
  async renderFinal(sessionId: number, userId: number, dto: RenderScanDto): Promise<{ buffer: Buffer; docType: 'document' | 'photo' }> {
    const session = await this.getOwned(sessionId, userId);
    const filtered = await this.render(sessionId, userId, dto);
    const docType = session.docType as 'document' | 'photo';
    const buffer = docType === 'document'
      ? await this.wrapAsSizedPdf(filtered)
      : await this.capJpegSize(filtered, MAX_PHOTO_BYTES);

    await this.repo.delete(sessionId);
    return { buffer, docType };
  }

  /** Merges multiple already-reviewed pages (each its own scan session)
   * into a single multi-page PDF and commits that as one document —
   * batch capture, spec: "в один файл можно было сканировать несколько
   * страниц документа". Each page keeps its own corners/filter settings
   * from review; only the crop+filter step runs per page here (not the
   * single-page PDF wrap finalize()/renderFinal() do), then all pages
   * are assembled into one PDF together. */
  async combine(userId: number, username: string, dto: CombineScanDto): Promise<UploadResult> {
    const sessions = await Promise.all(
      dto.pages.map((p) => this.getOwned(p.sessionId, userId)),
    );

    const pageImages: Buffer[] = [];
    for (let i = 0; i < dto.pages.length; i++) {
      pageImages.push(await this.render(dto.pages[i].sessionId, userId, dto.pages[i]));
    }

    const finalBuffer = await this.wrapMultiPageSizedPdf(pageImages);

    const fileRecordType = dto.docType === 'document' ? FileRecordType.DOCUMENT : FileRecordType.PHOTO;
    const counter = (await this.templatesService.countTodayRecords(dto.place, fileRecordType)) + 1;
    const originalFilename = sessions[0]?.originalFilename ?? 'scan.pdf';

    const result = await this.filesService.commitProcessedFile(
      userId, username, dto.place, dto.docType, finalBuffer, originalFilename, counter, dto.customName,
    );

    await this.repo.delete(dto.pages.map((p) => p.sessionId));
    return result;
  }

  async cancel(sessionId: number, userId: number): Promise<void> {
    await this.getOwned(sessionId, userId);
    await this.repo.delete(sessionId);
  }

  /** Hourly sweep for anything abandoned mid-review (app closed without
   * confirming or cancelling) — these are never visible anywhere else in
   * the app, so there's no harm in just quietly reclaiming them. */
  @Cron('17 * * * *')
  async cleanupStale(): Promise<void> {
    const cutoff = new Date(Date.now() - SESSION_TTL_MS);
    await this.repo
      .createQueryBuilder()
      .delete()
      .where('"createdAt" < :cutoff', { cutoff })
      .execute();
  }

  private async getOwned(sessionId: number, userId: number): Promise<ScanSession> {
    const session = await this.repo.findOne({ where: { id: sessionId }, relations: ['user'] });
    if (!session) {
      throw new NotFoundException('Scan session not found — it may have already been finalized/cancelled, or expired after 24h.');
    }
    if (session.user.id !== userId) {
      throw new ForbiddenException('Forbidden resource');
    }
    return session;
  }

  /** A preview/finalize call is trusted to use the curved-boundary
   * correction only when it echoes back the exact corners detection
   * produced — small floating point differences are fine, but a
   * corner the user actually dragged should fall back to a plain
   * 4-point transform instead of a curve traced for a different quad. */
  private matchesDetected(session: ScanSession, corners: Quad): boolean {
    if (!session.detectedCorners || session.detectedCorners.length !== 4) return false;
    const eps = 1.5;
    for (let i = 0; i < 4; i++) {
      if (Math.abs(corners[i].x - session.detectedCorners[i].x) > eps) return false;
      if (Math.abs(corners[i].y - session.detectedCorners[i].y) > eps) return false;
    }
    return true;
  }

  /** Fits every page to A4 and assembles one multi-page PDF, uniformly
   * reducing per-page JPEG quality until the whole document fits a
   * budget that scales with page count — a 5-page scan reasonably needs
   * more room than a 1-page one, so this isn't the flat single-page
   * MAX_PDF_BYTES cap. */
  private async wrapMultiPageSizedPdf(pageImages: Buffer[]): Promise<Buffer> {
    const targetHeight = Math.round(A4_TARGET_WIDTH * A4_RATIO);
    const fitted = await Promise.all(
      pageImages.map((img) =>
        sharp(img)
          .resize(A4_TARGET_WIDTH, targetHeight, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
          .toBuffer(),
      ),
    );

    const maxBytes = MAX_PDF_BYTES * pageImages.length;
    const build = async (quality: number): Promise<Buffer> => {
      const pdfDoc = await PDFDocument.create();
      for (const page of fitted) {
        const jpegBuffer = await sharp(page).jpeg({ quality }).toBuffer();
        const { width, height } = await sharp(jpegBuffer).metadata();
        const image = await pdfDoc.embedJpg(jpegBuffer);
        const pdfPage = pdfDoc.addPage([width || image.width, height || image.height]);
        pdfPage.drawImage(image, { x: 0, y: 0, width: width || image.width, height: height || image.height });
      }
      return Buffer.from(await pdfDoc.save());
    };

    let quality = 90;
    let pdfBytes = await build(quality);
    while (pdfBytes.length > maxBytes && quality > 25) {
      quality -= 10;
      pdfBytes = await build(quality);
    }
    return pdfBytes;
  }

  private async wrapAsSizedPdf(imageBuffer: Buffer): Promise<Buffer> {
    const targetHeight = Math.round(A4_TARGET_WIDTH * A4_RATIO);
    const fitted = await sharp(imageBuffer)
      .resize(A4_TARGET_WIDTH, targetHeight, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
      .toBuffer();

    let quality = 90;
    let jpegBuffer = await sharp(fitted).jpeg({ quality }).toBuffer();
    let pdfBytes = await this.buildSinglePageImagePdf(jpegBuffer);

    while (pdfBytes.length > MAX_PDF_BYTES && quality > 25) {
      quality -= 10;
      jpegBuffer = await sharp(fitted).jpeg({ quality }).toBuffer();
      pdfBytes = await this.buildSinglePageImagePdf(jpegBuffer);
    }
    return pdfBytes;
  }

  private async buildSinglePageImagePdf(jpegBuffer: Buffer): Promise<Buffer> {
    const { width, height } = await sharp(jpegBuffer).metadata();
    const pdfDoc = await PDFDocument.create();
    const image = await pdfDoc.embedJpg(jpegBuffer);
    const page = pdfDoc.addPage([width || image.width, height || image.height]);
    page.drawImage(image, { x: 0, y: 0, width: width || image.width, height: height || image.height });
    return Buffer.from(await pdfDoc.save());
  }

  private async capJpegSize(imageBuffer: Buffer, maxBytes: number): Promise<Buffer> {
    let quality = 90;
    let out = await sharp(imageBuffer).jpeg({ quality }).toBuffer();
    while (out.length > maxBytes && quality > 20) {
      quality -= 10;
      out = await sharp(imageBuffer).jpeg({ quality }).toBuffer();
    }
    return out;
  }
}
