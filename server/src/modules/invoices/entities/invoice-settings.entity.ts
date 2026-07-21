import {
  Column, CreateDateColumn, Entity, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { StorageConnection } from '../../storage/entities/storage-connection.entity';

/**
 * Per-organization invoice template settings. The company header itself
 * (name, address, logo, etc.) is NOT duplicated here — it's pulled
 * live from DeliveryNoteSettings for the same organization, so there's
 * one place to keep it current. What's specific to invoices: the
 * numbering series and where generated documents get saved.
 *
 * numberPrefix/startingNumber are a one-time decision: once
 * numberLocked is true, InvoiceSettingsController rejects any further
 * change to either field, even from an admin. Locking itself requires
 * re-entering the acting admin's password (see lock-numbering
 * endpoint) — this is deliberately harder to do by accident than a
 * normal settings save, because unlike almost everything else in the
 * admin panel, it can't be undone.
 */
@Entity('invoice_settings')
export class InvoiceSettings {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  @Column({ type: 'varchar', nullable: true })
  numberPrefix?: string | null;

  @Column({ type: 'integer', nullable: true })
  startingNumber?: number | null;

  @Column({ default: false })
  numberLocked: boolean;

  /** The number to use for the NEXT invoice created, then incremented —
   * see QuoteSettings.nextSequence for why this replaces COUNT(*). */
  @Column({ type: 'integer', default: 1 })
  nextSequence: number;

  /** Fixed text printed at the bottom of every invoice (terms & conditions). */
  @Column({ type: 'text', nullable: true })
  footerText?: string | null;

  /** 'classic' | 'modern' | 'minimalist' — see document-pdf.util.ts's DocTemplate. */
  @Column({ type: 'varchar', default: 'classic' })
  template: string;

  /** Auto-emails the generated PDF to the client's email (if set) via
   * the org's shared "primary email" (DocumentEmailSettings) as soon
   * as the document is created. */
  @Column({ default: false })
  autoSendEmail: boolean;

  @ManyToOne(() => StorageConnection, { nullable: true, onDelete: 'SET NULL' })
  storageConnection?: StorageConnection;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
