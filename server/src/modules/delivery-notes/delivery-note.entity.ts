import {
  Column, CreateDateColumn, Entity, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../organizations/entities/organization.entity';
import { User } from '../users/entities/user.entity';

export enum DeliveryNoteStatus {
  DRAFT = 'draft',
  SIGNED = 'signed',
  CANCELLED = 'cancelled',
}

export interface NoteItem {
  quantity: number;
  name: string;
  notes?: string;
}

/**
 * Digital copy of the MC Music תעודת משלוח/ו/אי
 * (Delivery/Return Note — Rental/Work Agreement).
 * Each signed note is stored as a PDF under
 * delivery-notes/{clientSlug}/note_{noteNumber}.pdf on the configured
 * storage adapter, and the base64 signatures are stored in the DB row
 * so the PDF can be regenerated without re-signing.
 */
@Entity('delivery_notes')
export class DeliveryNote {
  @PrimaryGeneratedColumn()
  id: number;

  /** Sequential per-organization note number (like the 11632 in the scan) */
  @Column({ nullable: true })
  noteNumber?: string;

  @Column({ type: 'date', nullable: true })
  date?: string;

  /** Client / company name — drives the folder structure */
  @Column({ nullable: true })
  clientName?: string;

  @Column({ nullable: true })
  clientAddress?: string;

  /** Person who received the equipment */
  @Column({ nullable: true })
  deliveredTo?: string;

  @Column({ nullable: true })
  recipientRole?: string;

  @Column({ nullable: true })
  recipientIdNumber?: string;

  /** Equipment rows */
  @Column({ type: 'jsonb', default: [] })
  items: NoteItem[];

  /** Free-text notes / terms override */
  @Column({ type: 'text', nullable: true })
  remarks?: string;

  /** Base64 PNG of lessor signature */
  @Column({ type: 'text', nullable: true })
  lessorSignature?: string;

  /** Base64 PNG of lessee (client) signature */
  @Column({ type: 'text', nullable: true })
  lesseeSignature?: string;

  @Column({ nullable: true })
  lesseeIdNumber?: string;

  @Column({ type: 'enum', enum: DeliveryNoteStatus, default: DeliveryNoteStatus.DRAFT })
  status: DeliveryNoteStatus;

  /** Path of the generated PDF on the storage adapter */
  @Column({ nullable: true })
  pdfPath?: string;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  createdBy?: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
