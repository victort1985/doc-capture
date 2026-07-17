import {
  Column, CreateDateColumn, Entity, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { StorageConnection } from '../../storage/entities/storage-connection.entity';

/**
 * Per-organization quote template settings. The company header itself
 * (name, address, logo, etc.) is NOT duplicated here — it's pulled
 * live from DeliveryNoteSettings for the same organization, so there's
 * one place to keep it current. What's specific to quotes: the
 * numbering series and where generated documents get saved.
 *
 * numberPrefix/startingNumber are a one-time decision: once
 * numberLocked is true, QuoteSettingsController rejects any further
 * change to either field, even from an admin. Locking itself requires
 * re-entering the acting admin's password (see lock-numbering
 * endpoint) — this is deliberately harder to do by accident than a
 * normal settings save, because unlike almost everything else in the
 * admin panel, it can't be undone.
 */
@Entity('quote_settings')
export class QuoteSettings {
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

  /** Fixed text printed at the bottom of every quote (terms & conditions). */
  @Column({ type: 'text', nullable: true })
  footerText?: string | null;

  @ManyToOne(() => StorageConnection, { nullable: true, onDelete: 'SET NULL' })
  storageConnection?: StorageConnection;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
