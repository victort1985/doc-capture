import { BadRequestException, Injectable } from '@nestjs/common';
import { processDocument } from './processors/document.processor';
import { processPhoto } from './processors/photo.processor';
import { resolveNamePattern, sanitizeFilenameComponent } from '../templates/name-pattern.util';
import { StorageService } from '../storage/storage.service';
import { TemplatesService } from '../templates/templates.service';
import { FileRecordType } from '../templates/entities/file-record.entity';
import { TemplateAppliesTo } from '../templates/entities/file-template.entity';
import { encryptBuffer, decryptBuffer } from '../../common/crypto/encryption.util';

export interface UploadResult {
  id: number;
  generatedName: string;
  type: 'document' | 'photo';
  storage: { type: string; path: string };
}

export interface DownloadedFile {
  buffer: Buffer;
  mimetype: string;
  filename: string;
}

const DEFAULT_PATTERN = '{date}_{place}_{docType}_{counter}';

@Injectable()
export class FilesService {
  constructor(
    private readonly storageService: StorageService,
    private readonly templatesService: TemplatesService,
  ) {}

  async uploadBatch(
    userId: number,
    username: string,
    place: string,
    docType: 'document' | 'photo',
    files: Array<{ originalname: string; buffer: Buffer; mimetype: string }>,
  ): Promise<UploadResult[]> {
    for (const file of files) {
      this.assertFileTypeAllowed(file, docType);
    }

    // Seed the {counter} variable from what's already been uploaded today
    // for this place — otherwise every separate upload call restarted at
    // 1, so a second single-file upload today could resolve to the exact
    // same filename as an earlier one and silently overwrite it.
    const fileRecordType = docType === 'document' ? FileRecordType.DOCUMENT : FileRecordType.PHOTO;
    const counterStart = await this.templatesService.countTodayRecords(place, fileRecordType);

    const results: UploadResult[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      let processed: Buffer;
      try {
        processed =
          docType === 'document'
            ? await processDocument(file.buffer)
            : await processPhoto(file.buffer);
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'unknown error';
        throw new BadRequestException(
          `Could not process "${file.originalname}" as a ${docType}: ${reason}`,
        );
      }

      const result = await this.commitProcessedFile(
        userId, username, place, docType, processed, file.originalname, counterStart + i + 1,
      );
      results.push(result);
    }

    return results;
  }

  /**
   * Writes an already-processed file (cropped/filtered PDF or JPEG) to
   * the user's configured storage and logs the FileRecord. Shared by
   * uploadBatch() above (the direct, non-interactive upload path) and
   * ScanSessionsService.finalize() (the review-then-commit path) — both
   * ultimately want the same naming/storage/encryption/logging logic
   * once they have a finished buffer in hand.
   */
  async commitProcessedFile(
    userId: number,
    username: string,
    place: string,
    docType: 'document' | 'photo',
    processed: Buffer,
    originalFilename: string,
    counter: number,
    customName?: string,
  ): Promise<UploadResult> {
    const settings = await this.storageService.getClientSettings(userId);

    const connectionId =
      docType === 'document'
        ? settings?.documentStorageConnection?.id
        : settings?.photoStorageConnection?.id;

    if (!connectionId) {
      throw new BadRequestException(
        `No ${docType} storage connection configured for this user. Ask an admin to set it up under Storage routing.`,
      );
    }

    const { adapter, encryptAtRest } = await this.storageService.getAdapterWithMeta(connectionId);
    const subfolderPattern =
      docType === 'document'
        ? settings!.documentSubfolderPattern
        : settings!.photoSubfolderPattern;

    const docTypeEnum =
      docType === 'document' ? TemplateAppliesTo.DOCUMENT : TemplateAppliesTo.PHOTO;
    const template = await this.templatesService.findApplicableTemplate(userId, docTypeEnum);
    const namePattern = template?.pattern || DEFAULT_PATTERN;

    const extension = docType === 'document' ? 'pdf' : 'jpg';
    const baseName = customName?.trim()
      ? sanitizeFilenameComponent(customName.trim())
      : resolveNamePattern(namePattern, { place, username, docType, counter });
    // Encryption happens after naming so the on-disk/on-NAS file gets a
    // visibly different extension (.enc) instead of looking like a normal,
    // openable PDF/JPG that just happens to be corrupt.
    const generatedName = encryptAtRest ? `${baseName}.${extension}.enc` : `${baseName}.${extension}`;
    const toWrite = encryptAtRest ? encryptBuffer(processed) : processed;

    const subfolder = resolveNamePattern(subfolderPattern, { place, username, docType, counter });
    const relativePath = `${subfolder}/${generatedName}`;

    let finalPath: string;
    try {
      finalPath = await adapter.write(relativePath, toWrite);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown error';
      throw new BadRequestException(
        `Could not save "${originalFilename}" to storage: ${reason}`,
      );
    }

    const record = await this.templatesService.logFileRecord({
      user: { id: userId } as any,
      originalName: originalFilename,
      generatedName,
      type: docType === 'document' ? FileRecordType.DOCUMENT : FileRecordType.PHOTO,
      place,
      storageConnection: { id: connectionId } as any,
      path: finalPath,
      relativePath,
      encrypted: encryptAtRest,
    });

    return {
      id: record.id,
      generatedName,
      type: docType,
      storage: { type: 'connection', path: finalPath },
    };
  }

  async downloadFile(recordId: number): Promise<DownloadedFile> {
    const record = await this.templatesService.findRecordById(recordId);
    if (!record.storageConnection) {
      throw new BadRequestException(
        'The storage connection this file was uploaded to no longer exists, so it can no longer be read back through the app.',
      );
    }
    if (!record.relativePath) {
      throw new BadRequestException('This file was uploaded before download support existed and has no recorded path.');
    }

    const adapter = await this.storageService.getAdapter(record.storageConnection.id);
    let bytes: Buffer;
    try {
      bytes = await adapter.read(record.relativePath);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown error';
      throw new BadRequestException(`Could not read the file from storage: ${reason}`);
    }

    if (record.encrypted) {
      try {
        bytes = decryptBuffer(bytes);
      } catch {
        throw new BadRequestException(
          'Could not decrypt this file — it may have been encrypted with a different ENCRYPTION_KEY than the one currently configured.',
        );
      }
    }

    const downloadName = record.generatedName.replace(/\.enc$/, '');
    const mimetype = downloadName.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
    return { buffer: bytes, mimetype, filename: downloadName };
  }

  async deleteFile(recordId: number): Promise<void> {
    const record = await this.templatesService.findRecordById(recordId);

    if (record.storageConnection && record.relativePath) {
      const adapter = await this.storageService.getAdapter(record.storageConnection.id);
      try {
        await adapter.remove(record.relativePath);
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'unknown error';
        throw new BadRequestException(
          `Could not delete the underlying file from storage (record was NOT removed, so this can be retried): ${reason}`,
        );
      }
    }
    // No storageConnection (deleted earlier) or no relativePath (uploaded
    // before this existed) — nothing reachable to remove from storage;
    // erasing the log entry itself is the most useful thing left to do.

    await this.templatesService.removeRecord(recordId);
  }

  /** Reject obviously-wrong file types before they ever reach sharp/pdf-lib. */
  private assertFileTypeAllowed(
    file: { originalname: string; mimetype: string },
    docType: 'document' | 'photo',
  ): void {
    const isImage = file.mimetype?.startsWith('image/');
    const isPdf = file.mimetype === 'application/pdf';

    const allowed = docType === 'photo' ? isImage : isImage || isPdf;

    if (!allowed) {
      const expected = docType === 'photo' ? 'an image' : 'an image or a PDF';
      throw new BadRequestException(
        `"${file.originalname}" can't be used as a ${docType} (expected ${expected}, got ${file.mimetype || 'unknown type'}).`,
      );
    }
  }
}
