import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { OrderEmailSettingsService } from './order-email-settings.service';

/**
 * Sends the completed order PDF (PO + delivery note merged) to a
 * configured list of recipients once an order is completed. Reuses
 * the same Gmail account + app password already set up for the IMAP
 * intake poller, over SMTP (smtp.gmail.com:465) — one dedicated inbox
 * for both directions rather than a second set of credentials.
 */
@Injectable()
export class OrderNotificationService {
  private readonly logger = new Logger('OrderNotificationService');

  constructor(private readonly settingsService: OrderEmailSettingsService) {}

  async sendCompletionEmail(filename: string, pdfBuffer: Buffer): Promise<void> {
    const settings = await this.settingsService.getWithSecret();
    if (!settings?.notifyOnCompleteEnabled || !settings.notifyEmails?.trim() || !settings.emailAddress || !settings.appPassword) {
      return;
    }

    const recipients = settings.notifyEmails
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
    if (recipients.length === 0) return;

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: settings.emailAddress, pass: settings.appPassword },
    });

    const attachmentName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;

    try {
      await transporter.sendMail({
        from: settings.emailAddress,
        to: recipients,
        subject: attachmentName,
        text: attachmentName,
        attachments: [{ filename: attachmentName, content: pdfBuffer, contentType: 'application/pdf' }],
      });
    } catch (err: any) {
      // Non-fatal: the order is already saved/complete regardless of
      // whether the notification email goes out.
      this.logger.error(`Failed to send completion email for "${attachmentName}": ${err?.message}`);
    }
  }
}
