import {
  Column, CreateDateColumn, Entity, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { StorageConnection } from '../../storage/entities/storage-connection.entity';

@Entity('credit_note_settings')
export class CreditNoteSettings {
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

  /** See QuoteSettings.nextSequence — same persistent-counter approach,
   * for the same reason: a credit note's number, once issued, must
   * never repeat, which COUNT(*) cannot guarantee. */
  @Column({ type: 'integer', default: 1 })
  nextSequence: number;

  @Column({ type: 'text', nullable: true })
  footerText?: string | null;

  @Column({ type: 'varchar', default: 'classic' })
  template: string;

  @Column({ default: false })
  autoSendEmail: boolean;

  @ManyToOne(() => StorageConnection, { nullable: true, onDelete: 'SET NULL' })
  storageConnection?: StorageConnection;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
