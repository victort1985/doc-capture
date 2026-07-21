import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { DocumentEmailSettingsService } from './document-email-settings.service';

@Injectable()
export class DocumentSendingService {
  private readonly logger = new Logger('DocumentSendingService');

  constructor(private readonly settingsService: DocumentEmailSettingsService) {}

  /** Non-fatal by design — a failed email should never block creating
   * or regenerating the document itself, same reasoning as
   * OrderNotificationService. Returns whether it actually sent. */
  async sendDocument(params: {
    clientEmail?: string | null;
    filename: string;
    pdfBuffer: Buffer;
    subject: string;
  }): Promise<boolean> {
    if (!params.clientEmail?.trim()) return false;

    const settings = await this.settingsService.getWithSecret();
    if (!settings?.emailAddress || !settings.appPassword) return false;

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: settings.emailAddress, pass: settings.appPassword },
    });

    const attachmentName = params.filename.endsWith('.pdf') ? params.filename : `${params.filename}.pdf`;

    try {
      await transporter.sendMail({
        from: settings.emailAddress,
        to: params.clientEmail.trim(),
        subject: params.subject,
        text: params.subject,
        attachments: [{ filename: attachmentName, content: params.pdfBuffer, contentType: 'application/pdf' }],
      });
      return true;
    } catch (err: any) {
      this.logger.error(`Failed to send "${attachmentName}" to ${params.clientEmail}: ${err?.message}`);
      return false;
    }
  }
}
