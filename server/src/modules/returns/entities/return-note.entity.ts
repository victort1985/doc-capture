import {
  Column, CreateDateColumn, Entity, Index, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../users/entities/user.entity';

/**
 * A return (תעודת החזרה) — documents goods/equipment coming back from
 * a client, referencing the delivery note that sent them out.
 * Distinct from a credit note: a return is about physical goods
 * movement (like a delivery note itself), a credit note is about
 * money. The two are often used together (return the goods, then
 * credit-note the invoice) but aren't the same document.
 */
@Entity('return_notes')
export class ReturnNote {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  returnNumber?: string;

  @Column({ type: 'date', nullable: true })
  date?: string;

  @Column()
  clientName: string;

  @Column({ nullable: true })
  clientEmail?: string;

  /** The delivery note these goods were originally sent out on. */
  @Column()
  @Index()
  deliveryNoteId: number;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'jsonb', default: [] })
  items: { name: string; quantity: number; notes?: string }[];

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
