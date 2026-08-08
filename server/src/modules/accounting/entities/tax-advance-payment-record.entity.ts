import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { numericTransformer } from '../../../common/transformers/numeric.transformer';

/**
 * One confirmed payment against a specific מקדמות period. Deliberately
 * only exists once someone marks a period paid — the period itself
 * and its calculated amount-due are computed fresh from real revenue
 * every time (see TaxAdvancePaymentService.getPeriods), never
 * pre-generated rows sitting around waiting to be filled in, which
 * would risk showing a stale calculated amount if revenue for that
 * period gets corrected after the fact (a late-recorded invoice, a
 * credit note, etc.).
 */
@Entity('tax_advance_payment_records')
@Index(['organization', 'periodFrom'])
export class TaxAdvancePaymentRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  periodFrom: string;

  @Column({ type: 'date' })
  periodTo: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  paidAmount: number;

  @Column({ type: 'date' })
  paidDate: string;

  @Column({ type: 'varchar', nullable: true })
  reference?: string | null;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  @CreateDateColumn()
  createdAt: Date;
}
