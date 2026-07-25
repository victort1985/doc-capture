import {
  Column, CreateDateColumn, Entity, Index, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../users/entities/user.entity';
import { numericTransformer } from '../../../common/transformers/numeric.transformer';

/**
 * A debit note — the inverse of a credit note (זיכוי): increases what
 * a client owes on an already-issued invoice (e.g. an undercharge
 * discovered after the fact), rather than reducing it. Same
 * immutability rules as CreditNote — never edited or deleted once
 * issued, referencing the original invoice rather than modifying it.
 */
@Entity('debit_notes')
export class DebitNote {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  debitNoteNumber?: string;

  @Column({ type: 'date', nullable: true })
  date?: string;

  @Column()
  clientName: string;

  @Column({ nullable: true })
  clientEmail?: string;

  @Column()
  @Index()
  invoiceId: number;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'jsonb', default: [] })
  items: { description: string; quantity: number; unitPrice: number }[];

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numericTransformer })
  total: number;

  @Column({ type: 'varchar', nullable: true })
  storagePath?: string | null;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  chainId?: string | null;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  @ManyToOne(() => User, { nullable: true })
  createdBy?: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
