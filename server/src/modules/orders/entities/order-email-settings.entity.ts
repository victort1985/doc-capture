import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Credentials for the one dedicated Gmail inbox that receives supplier
 * purchase orders — a single global row (not per-tenant, per-user), set
 * up once from the admin panel. IMAP + a Gmail "app password" (not the
 * account's real password) rather than full OAuth: this is one fixed
 * inbox the business controls directly, not per-user delegated access
 * the way Calendar/Contacts needed OAuth for.
 */
@Entity('order_email_settings')
export class OrderEmailSettings {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ default: false })
  enabled: boolean;

  @Column({ type: 'varchar', nullable: true })
  emailAddress?: string | null;

  /** A Gmail "app password" (myaccount.google.com/apppasswords), not
   * the account's real login password — stored as-is like other
   * connection secrets in this codebase (see StorageConnection). */
  @Column({ type: 'varchar', nullable: true, select: false })
  appPassword?: string | null;

  @Column({ default: 'imap.gmail.com' })
  imapHost: string;

  @Column({ default: 993 })
  imapPort: number;

  @Column({ type: 'timestamp', nullable: true })
  lastCheckedAt?: Date | null;

  @Column({ type: 'varchar', nullable: true })
  lastError?: string | null;

  /** Highest IMAP UID already processed. Using UID watermark instead of
   * the \Seen flag: \Seen reflects whether a human has read the email
   * (which can happen independently, e.g. someone opens it in Gmail's
   * own app before the poller runs), not whether the poller itself has
   * handled it — relying on \Seen meant such messages were silently
   * skipped forever. This also avoids mutating flags in what's someone's
   * real mailbox. */
  @Column({ type: 'integer', default: 0 })
  lastProcessedUid: number;

  /** When true, completing an order (adding the invoice/delivery note
   * page) sends the final PDF to notifyEmails automatically. Reuses
   * this same Gmail account + app password over SMTP — one dedicated
   * inbox handles both receiving POs and sending completed ones. */
  @Column({ default: false })
  notifyOnCompleteEnabled: boolean;

  /** Comma-separated recipient addresses for the completion email. */
  @Column({ type: 'varchar', nullable: true })
  notifyEmails?: string | null;
}
