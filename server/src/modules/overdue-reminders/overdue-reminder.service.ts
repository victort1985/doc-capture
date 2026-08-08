import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import * as nodemailer from 'nodemailer';
import { OverdueReminderSettings } from './entities/overdue-reminder-settings.entity';
import { OverdueReminderLog } from './entities/overdue-reminder-log.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { Payment } from '../payments/entities/payment.entity';
import { CreditNote } from '../credit-notes/entities/credit-note.entity';
import { DocumentEmailSettingsService } from '../document-email/document-email-settings.service';

const DEFAULT_THRESHOLDS = [7, 14, 30];

@Injectable()
export class OverdueReminderService {
  private readonly logger = new Logger(OverdueReminderService.name);

  constructor(
    @InjectRepository(OverdueReminderSettings) private readonly settingsRepo: Repository<OverdueReminderSettings>,
    @InjectRepository(OverdueReminderLog) private readonly logsRepo: Repository<OverdueReminderLog>,
    @InjectRepository(Invoice) private readonly invoicesRepo: Repository<Invoice>,
    @InjectRepository(Payment) private readonly paymentsRepo: Repository<Payment>,
    @InjectRepository(CreditNote) private readonly creditNotesRepo: Repository<CreditNote>,
    private readonly emailSettingsService: DocumentEmailSettingsService,
  ) {}

  async getSettings(organizationId: number | null): Promise<OverdueReminderSettings> {
    const existing = await this.settingsRepo.findOne({ where: organizationId != null ? { organization: { id: organizationId } } : {} });
    if (existing) return existing;
    return this.settingsRepo.create({ enabled: false, thresholdDays: DEFAULT_THRESHOLDS });
  }

  async updateSettings(organizationId: number | null, enabled: boolean, thresholdDays: number[], messageTemplate?: string): Promise<OverdueReminderSettings> {
    let settings = await this.settingsRepo.findOne({ where: organizationId != null ? { organization: { id: organizationId } } : {} });
    if (!settings) {
      settings = this.settingsRepo.create({ organization: organizationId != null ? ({ id: organizationId } as any) : undefined });
    }
    settings.enabled = enabled;
    settings.thresholdDays = [...thresholdDays].sort((a, b) => a - b);
    settings.messageTemplate = messageTemplate;
    return this.settingsRepo.save(settings);
  }

  /** Same "outstanding" definition as financial-reports' own aging
   * report (a payment sharing chainId, OR credit notes covering the
   * full total, excuses an invoice) — deliberately re-implemented
   * here rather than calling into that controller's private method,
   * since reaching into another module's controller internals is
   * worse than a few duplicated lines of a query that's unlikely to
   * change independently of the underlying data model itself. */
  private async getOutstandingInvoices(organizationId: number | null): Promise<Invoice[]> {
    const orgFilter = organizationId != null ? { organization: { id: organizationId } } : {};
    const invoices = await this.invoicesRepo.find({ where: orgFilter as any, relations: ['organization'] });

    const chainIds = invoices.map((i) => i.chainId).filter((id): id is string => !!id);
    const paidChainIdSet = chainIds.length
      ? new Set((await this.paymentsRepo.createQueryBuilder('p').select('DISTINCT p.chainId', 'chainId').where('p.chainId IN (:...ids)', { ids: chainIds }).getRawMany<{ chainId: string }>()).map((r) => r.chainId))
      : new Set<string>();

    const invoiceIds = invoices.map((i) => i.id);
    const creditedTotalByInvoiceId = new Map<number, number>();
    if (invoiceIds.length) {
      const rows = await this.creditNotesRepo.createQueryBuilder('cn').select('cn.invoiceId', 'invoiceId').addSelect('SUM(cn.total)', 'total').where('cn.invoiceId IN (:...ids)', { ids: invoiceIds }).groupBy('cn.invoiceId').getRawMany<{ invoiceId: number; total: string }>();
      for (const row of rows) creditedTotalByInvoiceId.set(row.invoiceId, Number(row.total));
    }

    return invoices.filter((inv) => {
      if (inv.chainId && paidChainIdSet.has(inv.chainId)) return false;
      const credited = creditedTotalByInvoiceId.get(inv.id) ?? 0;
      if (credited >= Number(inv.total)) return false;
      return true;
    });
  }

  private daysOverdue(invoice: Invoice): number {
    const issued = invoice.date ? new Date(invoice.date) : new Date(invoice.createdAt);
    return Math.floor((Date.now() - issued.getTime()) / (1000 * 60 * 60 * 24));
  }

  private renderMessage(template: string | null | undefined, invoice: Invoice, daysOverdue: number): string {
    const fallback = `Hi ${invoice.clientName},\n\nThis is a friendly reminder that invoice ${invoice.invoiceNumber ?? `#${invoice.id}`} for ${invoice.total} ${invoice.currency} has been outstanding for ${daysOverdue} days. Please arrange payment at your earliest convenience.\n\nThank you.`;
    if (!template?.trim()) return fallback;
    return template
      .replace(/\{\{clientName\}\}/g, invoice.clientName)
      .replace(/\{\{invoiceNumber\}\}/g, invoice.invoiceNumber ?? `#${invoice.id}`)
      .replace(/\{\{total\}\}/g, `${invoice.total} ${invoice.currency}`)
      .replace(/\{\{daysOverdue\}\}/g, String(daysOverdue));
  }

  /** Sends one reminder — plain text, no attachment (a repeated PDF
   * every reminder would be noise; the client already has the
   * original invoice) — via the same Gmail app-password transport
   * DocumentSendingService already uses for actual document emails,
   * so there's only one place email credentials are configured across
   * the whole app. Non-fatal: a failed send is logged and recorded as
   * such, never thrown, so one bad email address doesn't stop every
   * other invoice's reminder that same run. */
  private async sendReminder(invoice: Invoice, daysOverdue: number, template: string | null | undefined): Promise<boolean> {
    if (!invoice.clientEmail?.trim()) {
      this.logger.warn(`Skipped overdue reminder for invoice #${invoice.id} — no client email on file.`);
      return false;
    }
    const settings = await this.emailSettingsService.getWithSecret();
    if (!settings?.emailAddress || !settings.appPassword) {
      this.logger.warn(`Skipped overdue reminder for invoice #${invoice.id} — sending email isn't fully configured.`);
      return false;
    }
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 465, secure: true,
      auth: { user: settings.emailAddress, pass: settings.appPassword },
    });
    try {
      await transporter.sendMail({
        from: settings.emailAddress,
        to: invoice.clientEmail.trim(),
        subject: `Payment reminder — invoice ${invoice.invoiceNumber ?? `#${invoice.id}`}`,
        text: this.renderMessage(template, invoice, daysOverdue),
      });
      this.logger.log(`Sent overdue reminder for invoice #${invoice.id} (${daysOverdue}d overdue) to ${invoice.clientEmail}.`);
      return true;
    } catch (err: any) {
      this.logger.error(`Failed to send overdue reminder for invoice #${invoice.id}: ${err?.message ?? err}`);
      return false;
    }
  }

  /** Runs once a day. For each organization with reminders enabled,
   * finds every outstanding invoice, and for each threshold already
   * crossed that hasn't been sent yet for that exact invoice+
   * threshold pair (OverdueReminderLog's own unique index enforces
   * this at the DB level too, as a second line of defense against a
   * race sending the same reminder twice), sends one and logs it. An
   * invoice overdue by 20 days with thresholds [7,14,30] gets exactly
   * two reminders total (7 and 14), not one for every day past each
   * threshold. */
  @Cron('0 6 * * *')
  async checkAndSend(): Promise<void> {
    const allSettings = await this.settingsRepo.find({ where: { enabled: true }, relations: ['organization'] });
    for (const settings of allSettings) {
      const orgId = settings.organization?.id ?? null;
      const outstanding = await this.getOutstandingInvoices(orgId);
      for (const invoice of outstanding) {
        const overdueDays = this.daysOverdue(invoice);
        const crossedThresholds = settings.thresholdDays.filter((t) => overdueDays >= t);
        for (const threshold of crossedThresholds) {
          const alreadySent = await this.logsRepo.findOne({ where: { invoice: { id: invoice.id }, thresholdDays: threshold } });
          if (alreadySent) continue;
          const sent = await this.sendReminder(invoice, overdueDays, settings.messageTemplate);
          await this.logsRepo.save(this.logsRepo.create({ invoice, thresholdDays: threshold, sentSuccessfully: sent }));
        }
      }
    }
  }

  async getLog(organizationId: number | null): Promise<OverdueReminderLog[]> {
    const qb = this.logsRepo.createQueryBuilder('log')
      .leftJoinAndSelect('log.invoice', 'invoice')
      .leftJoin('invoice.organization', 'organization')
      .orderBy('log.sentAt', 'DESC')
      .take(100);
    if (organizationId != null) qb.andWhere('organization.id = :orgId', { orgId: organizationId });
    return qb.getMany();
  }
}
