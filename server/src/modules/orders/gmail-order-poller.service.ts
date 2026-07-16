import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { OrderEmailSettingsService } from './order-email-settings.service';
import { OrdersService } from './orders.service';
import { OrderPdfParserService } from './order-pdf-parser.service';

/**
 * Polls the one dedicated order-intake Gmail inbox for new supplier
 * purchase orders. Plain IMAP + an app password (not OAuth) since this
 * is one fixed inbox the business controls directly, unlike Calendar/
 * Contacts where each user's own Google account needed delegated
 * access.
 *
 * Only ever reads unseen messages and marks each one \Seen once
 * processed (successfully or not) so a message already looked at never
 * gets re-imported as a duplicate order on the next poll -- a message
 * whose PDF fails to parse still gets marked seen, since retrying
 * automatically wouldn't get a different result and would otherwise
 * loop forever; OrderEmailSettings.lastError records what happened for
 * the admin to check.
 */
@Injectable()
export class GmailOrderPollerService {
  private readonly logger = new Logger('GmailOrderPollerService');

  constructor(
    private readonly settingsService: OrderEmailSettingsService,
    private readonly ordersService: OrdersService,
    private readonly parserService: OrderPdfParserService,
  ) {}

  @Cron('*/5 * * * *')
  async poll(): Promise<void> {
    const settings = await this.settingsService.getWithSecret();
    if (!settings?.enabled || !settings.emailAddress || !settings.appPassword) {
      this.logger.debug('Poll skipped: not enabled or not fully configured');
      return;
    }

    const client = new ImapFlow({
      host: settings.imapHost,
      port: settings.imapPort,
      secure: true,
      auth: { user: settings.emailAddress, pass: settings.appPassword },
      logger: false,
    });

    let processedCount = 0;
    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      try {
        const uids = await client.search({ seen: false }, { uid: true });
        for (const uid of Array.isArray(uids) ? uids : []) {
          try {
            await this.processMessage(client, uid);
          } catch (err: any) {
            this.logger.error(`Failed processing message uid=${uid}: ${err?.message}`);
          } finally {
            // Mark seen regardless of outcome -- see class doc comment
            // for why a failed parse still shouldn't be retried forever.
            await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
            processedCount++;
          }
        }
      } finally {
        lock.release();
      }
      await client.logout();
      await this.settingsService.recordCheckResult(null);
    } catch (err: any) {
      this.logger.error(`Gmail poll failed: ${err?.message}`);
      await this.settingsService.recordCheckResult(err?.message ?? 'Unknown error');
    }

    this.logger.log(`Poll complete: ${processedCount} message(s) checked`);
  }

  private async processMessage(client: ImapFlow, uid: number): Promise<void> {
    const { content } = (await client.download(String(uid), undefined, { uid: true })) as { content: NodeJS.ReadableStream };
    const chunks: Buffer[] = [];
    for await (const chunk of content) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks);

    const parsedEmail = await simpleParser(raw);
    const pdfAttachments = (parsedEmail.attachments ?? []).filter(
      (a) => a.contentType === 'application/pdf' || a.filename?.toLowerCase().endsWith('.pdf'),
    );
    if (pdfAttachments.length === 0) return;

    for (const attachment of pdfAttachments) {
      const fields = await this.parserService.parse(attachment.content as Buffer);
      if (!fields) {
        this.logger.warn(`Could not extract order fields from attachment "${attachment.filename}" (subject: "${parsedEmail.subject}")`);
        continue;
      }
      await this.ordersService.createFromEmail(attachment.content as Buffer, fields, parsedEmail.subject ?? '');
    }
  }
}
