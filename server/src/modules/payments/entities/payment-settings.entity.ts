import {
  Column, CreateDateColumn, Entity, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { StorageConnection } from '../../storage/entities/storage-connection.entity';

/**
 * Per-organization payment (receipt) template settings — same shape
 * and same numbering-lock behavior as InvoiceSettings, per the
 * request to model this on the existing invoice settings pattern.
 */
@Entity('payment_settings')
export class PaymentSettings {
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

  /** The number to use for the NEXT payment recorded, then incremented —
   * see QuoteSettings.nextSequence for why this replaces COUNT(*). */
  @Column({ type: 'integer', default: 1 })
  nextSequence: number;

  /** Fixed text printed at the bottom of every receipt. */
  @Column({ type: 'text', nullable: true })
  footerText?: string | null;

  /** 'classic' | 'modern' | 'minimalist' — see document-pdf.util.ts's DocTemplate. */
  @Column({ type: 'varchar', default: 'classic' })
  template: string;

  /** Auto-emails the generated receipt PDF to the client's email (if
   * set) via the org's shared "primary email" (DocumentEmailSettings)
   * as soon as the payment is recorded. */
  @Column({ default: false })
  autoSendEmail: boolean;

  @ManyToOne(() => StorageConnection, { nullable: true, onDelete: 'SET NULL' })
  storageConnection?: StorageConnection;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
