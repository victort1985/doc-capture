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

  @Column({ nullable: true })
  emailAddress?: string | null;

  /** A Gmail "app password" (myaccount.google.com/apppasswords), not
   * the account's real login password — stored as-is like other
   * connection secrets in this codebase (see StorageConnection). */
  @Column({ nullable: true, select: false })
  appPassword?: string | null;

  @Column({ default: 'imap.gmail.com' })
  imapHost: string;

  @Column({ default: 993 })
  imapPort: number;

  @Column({ nullable: true })
  lastCheckedAt?: Date | null;

  @Column({ nullable: true })
  lastError?: string | null;
}
