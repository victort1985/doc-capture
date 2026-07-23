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
 * Tracks progress via a UID watermark (lastProcessedUid) rather than
 * the \Seen flag: \Seen just reflects whether a human read the email,
 * which can happen independently of this poller and would otherwise
 * cause messages to be silently skipped forever. This also avoids
 * mutating flags in what's someone's real mailbox.
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
    let maxUid = settings.lastProcessedUid;
    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      try {
        if (settings.lastProcessedUid === 0 && client.mailbox && typeof client.mailbox !== 'boolean') {
          // First-ever run: don't process the whole mailbox history,
          // just start watching from here on.
          maxUid = Math.max(0, (client.mailbox.uidNext ?? 1) - 1);
        } else {
        // All messages after the last one we've already processed —
        // not seen:false, since a message can get marked \Seen by
        // something other than this poller (see entity doc comment).
        const range = `${settings.lastProcessedUid + 1}:*`;
        const uids = await client.search({ uid: range }, { uid: true });
        for (const uid of Array.isArray(uids) ? uids : []) {
          if (uid <= settings.lastProcessedUid) continue; // '*' can repeat the last existing UID when the range's start is beyond it
          try {
            await this.processMessage(client, uid);
          } catch (err: any) {
            this.logger.error(`Failed processing message uid=${uid}: ${err?.message}`);
          } finally {
            maxUid = Math.max(maxUid, uid);
            processedCount++;
          }
        }
        }
      } finally {
        lock.release();
      }
      await client.logout();
      await this.settingsService.recordCheckResult(null, maxUid);
    } catch (err: any) {
      // imapflow's Error.message is often just "Command failed" with
      // the actually useful detail (e.g. the real SMTP/IMAP server
      // response, or an auth failure reason) tucked into one of these
      // other properties instead - log whichever are present.
      const detail = err?.responseText || err?.response || err?.authenticationFailure || err?.code;
      const fullMessage = detail ? `${err?.message}: ${detail}` : err?.message;
      this.logger.error(`Gmail poll failed: ${fullMessage}`);
      await this.settingsService.recordCheckResult(fullMessage ?? 'Unknown error', maxUid);
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
