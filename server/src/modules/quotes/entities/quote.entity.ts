import {
  Column, CreateDateColumn, Entity, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../users/entities/user.entity';
import { randomBytes } from 'crypto';
import { numericTransformer } from '../../../common/transformers/numeric.transformer';

export enum QuoteStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  APPROVED = 'approved',
  DECLINED = 'declined',
}

export interface QuoteItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

/**
 * A pre-sale estimate a client can approve without paying anything —
 * "office.quotes" gate. Deliberately has no payment step: approving a
 * quote just records the client's yes/no, same spirit as a signed
 * delivery note. Distinct from Order.invoiceNumber, which despite the
 * English name is a delivery-note number (תעודת משלוח), not a
 * monetary document — see Invoice below for that.
 */
@Entity('quotes')
export class Quote {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  quoteNumber?: string;

  @Column({ type: 'date', nullable: true })
  date?: string;

  @Column()
  clientName: string;

  @Column({ nullable: true })
  clientEmail?: string;

  @Column({ type: 'jsonb', default: [] })
  items: QuoteItem[];

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numericTransformer })
  total: number;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'enum', enum: QuoteStatus, default: QuoteStatus.DRAFT })
  status: QuoteStatus;

  /** Random token embedded in the client-facing approval link — not
   * the row id, so a client can't enumerate/guess other quotes. */
  @Column({ unique: true })
  approvalToken: string;

  @Column({ type: 'timestamp', nullable: true })
  respondedAt?: Date;

  /** Relative path (within the configured storage connection) to the
   * generated PDF, set once at creation. Null if no storage
   * connection is configured for the org yet. */
  @Column({ type: 'varchar', nullable: true })
  storagePath?: string | null;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  @ManyToOne(() => User, { nullable: true })
  createdBy?: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  static generateToken(): string {
    return randomBytes(20).toString('hex');
  }
}
