import {
  Column, CreateDateColumn, Entity, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../organizations/entities/organization.entity';

/**
 * Per-organization delivery note template settings.
 * One row per organization. Stores company identity (header info,
 * logo) and document series configuration (starting number, prefix).
 * The mobile client fetches this when opening the form so the header
 * is pre-filled and the logo appears in generated PDFs.
 */
@Entity('delivery_note_settings')
export class DeliveryNoteSettings {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  // ── Company identity ────────────────────────────────────────────────────

  @Column({ nullable: true })
  companyName?: string; // e.g. "אם.סי. אילת מיוזיק בע"מ"

  @Column({ nullable: true })
  companySubtitle?: string; // e.g. "THE MUSICAL CONNECTION"

  @Column({ nullable: true })
  companyAddress?: string; // e.g. "נחל חיון 3/3, אילת, מיקוד 8813501"

  @Column({ nullable: true })
  companyPhone?: string;

  @Column({ nullable: true })
  companyFax?: string;

  @Column({ nullable: true })
  companyMobile?: string;

  @Column({ nullable: true })
  companyPoBox?: string;

  @Column({ nullable: true })
  companyTaxId?: string; // ע.מ. / ח.פ.

  // ── Logo ────────────────────────────────────────────────────────────────

  /** Raw logo image stored as base64 data URI (small size for PDF embedding) */
  @Column({ type: 'text', nullable: true })
  logoBase64?: string;

  @Column({ nullable: true })
  logoMimetype?: string;

  // ── Document numbering ──────────────────────────────────────────────────

  @Column({ default: 'DN' })
  notePrefix?: string; // prefix before the number, e.g. "" or "DN-"

  @Column({ default: 10000 })
  startingNumber: number; // first note number for this org

  /** Fixed text to print at the bottom of every note (terms & conditions) */
  @Column({ type: 'text', nullable: true })
  termsText?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
