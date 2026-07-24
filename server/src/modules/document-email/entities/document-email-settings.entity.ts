import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { encryptString, decryptString } from '../../../common/crypto/encryption.util';

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

  /** Gmail "app password" (myaccount.google.com/apppasswords) —
   * encrypted at rest with the same AES-256-GCM transformer used for
   * StorageConnection.password, not just hidden via select:false
   * (which only keeps it out of normal query results — it was
   * previously stored as plaintext, readable directly from the
   * database if it were ever compromised). */
  @Column({
    type: 'varchar', nullable: true, select: false,
    transformer: {
      to: (value?: string | null) => (value ? encryptString(value) : value),
      from: (value?: string | null) => (value ? decryptString(value) ?? value : value),
    },
  })
  appPassword?: string | null;
}
