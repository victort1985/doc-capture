import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { Organization } from '../organizations/entities/organization.entity';
import { generateDocumentPdf } from '../documents/document-pdf.util';
import { PreviewTemplateDesignDto } from './dto/preview-template-design.dto';

/**
 * Renders an actual PDF page — through the exact same
 * generateDocumentPdf() every real quote/invoice/etc already calls,
 * not a separate re-implementation — then converts it to a PNG with
 * pdftoppm (the same tool already relied on elsewhere in this app for
 * OCR) so the editor can show it as an image. This is what makes the
 * editor genuinely WYSIWYG: whatever design values are currently on
 * screen (including ones not saved yet) get rendered through the
 * identical code path a real document would use, so there's no
 * separate approximation of the layout that could ever drift out of
 * sync with it.
 */
@Injectable()
export class TemplatePreviewService {
  private readonly logger = new Logger(TemplatePreviewService.name);

  constructor(@InjectRepository(Organization) private readonly orgRepo: Repository<Organization>) {}

  async renderPreviewPng(organizationId: number | null, dto: PreviewTemplateDesignDto): Promise<Buffer> {
    let companyName = 'Sample Company Ltd.';
    let logoBase64: string | undefined;

    if (organizationId != null) {
      const org = await this.orgRepo
        .createQueryBuilder('org')
        .addSelect('org.logoData')
        .where('org.id = :id', { id: organizationId })
        .getOne();
      if (org) {
        companyName = org.name;
        if (org.logoData && org.logoMimetype) {
          logoBase64 = `data:${org.logoMimetype};base64,${org.logoData.toString('base64')}`;
        }
      }
    }

    const hasColors = dto.primaryColor || dto.accentColor || dto.textColor;
    const hasLogo = dto.logoXPercent != null && dto.logoYPercent != null && dto.logoHeightPercent != null;
    const hasCompanyInfo = dto.companyInfoXPercent != null && dto.companyInfoYPercent != null;

    const pdfBytes = await generateDocumentPdf({
      docTypeLabel: 'הצעת מחיר לדוגמה',
      docNumber: 'SAMPLE-0001',
      date: new Date().toISOString().slice(0, 10),
      clientName: 'לקוח לדוגמה בע"מ',
      clientEmail: 'sample@example.com',
      items: [
        { description: 'פריט לדוגמה מספר 1', quantity: 2, unitPrice: 150 },
        { description: 'פריט לדוגמה מספר 2', quantity: 1, unitPrice: 480 },
        { description: 'פריט לדוגמה מספר 3', quantity: 5, unitPrice: 60 },
      ],
      total: 2 * 150 + 480 + 5 * 60,
      header: { companyName, logoBase64 },
      template: dto.template,
      vatEnabled: true,
      design: {
        colors: hasColors ? { primary: dto.primaryColor, accent: dto.accentColor, text: dto.textColor } : undefined,
        logo: hasLogo ? { xPercent: dto.logoXPercent!, yPercent: dto.logoYPercent!, heightPercent: dto.logoHeightPercent! } : undefined,
        companyInfo: hasCompanyInfo ? { xPercent: dto.companyInfoXPercent!, yPercent: dto.companyInfoYPercent! } : undefined,
      },
    });

    return this.pdfFirstPageToPng(Buffer.from(pdfBytes));
  }

  private async pdfFirstPageToPng(pdfBytes: Buffer): Promise<Buffer> {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'template-preview-'));
    try {
      const pdfPath = path.join(tmpDir, 'preview.pdf');
      await fs.writeFile(pdfPath, pdfBytes);
      const imgPrefix = path.join(tmpDir, 'page');

      await new Promise<void>((resolve, reject) => {
        const child = spawn('pdftoppm', ['-png', '-r', '150', '-f', '1', '-l', '1', pdfPath, imgPrefix]);
        let stderr = '';
        child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
        child.on('error', (err) => reject(new InternalServerErrorException(`pdftoppm could not start: ${err.message}`)));
        child.on('close', (code) => {
          if (code !== 0) {
            this.logger.error(`pdftoppm exited with code ${code}: ${stderr}`);
            reject(new InternalServerErrorException('Failed to render preview'));
            return;
          }
          resolve();
        });
      });

      const files = await fs.readdir(tmpDir);
      const imgFile = files.find((f) => f.startsWith('page') && f.endsWith('.png'));
      if (!imgFile) throw new InternalServerErrorException('Preview render produced no output');
      return await fs.readFile(path.join(tmpDir, imgFile));
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
