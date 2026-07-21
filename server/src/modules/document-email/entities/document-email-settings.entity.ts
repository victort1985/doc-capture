import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * The "primary email" quotes/invoices/delivery-note settings each
 * point to when they want to auto-send the generated PDF to the
 * client — one shared Gmail account (same "app password" pattern as
 * OrderEmailSettings) instead of separate credentials per document
 * type, since in practice a business sends all of these from the same
 * address. A single global row per tenant, same as OrderEmailSettings.
 */
@Entity('document_email_settings')
export class DocumentEmailSettings {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', nullable: true })
  emailAddress?: string | null;

  /** Gmail "app password" (myaccount.google.com/apppasswords) — same
   * handling as every other stored connection secret in this codebase. */
  @Column({ type: 'varchar', nullable: true, select: false })
  appPassword?: string | null;
}
