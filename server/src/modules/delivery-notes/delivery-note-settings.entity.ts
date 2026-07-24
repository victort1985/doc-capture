import {
  Column, CreateDateColumn, Entity, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../organizations/entities/organization.entity';
import { StorageConnection } from '../storage/entities/storage-connection.entity';

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

  /** The number to use for the NEXT delivery note created, then
   * incremented — a real persistent counter, not derived from
   * COUNT(*) of existing rows. See QuoteSettings.nextSequence for why
   * COUNT(*) is unsafe: it silently reissues an already-used number
   * the moment any note gets deleted (manually, or by the demo-mode
   * nightly cleanup). */
  @Column({ type: 'integer', default: 1 })
  nextSequence: number;

  /** Fixed text to print at the bottom of every note (terms & conditions) */
  @Column({ type: 'text', nullable: true })
  termsText?: string;

  /** 'classic' | 'modern' | 'minimalist' — see document-pdf.util.ts's DocTemplate. */
  @Column({ type: 'varchar', default: 'classic' })
  template: string;

  /** Auto-emails the generated PDF to the client's email (if set) via
   * the org's shared "primary email" (DocumentEmailSettings) as soon
   * as the document is created. */
  @Column({ default: false })
  autoSendEmail: boolean;

  /** Where generated delivery-note PDFs are saved for this organization. */
  @ManyToOne(() => StorageConnection, { nullable: true, onDelete: 'SET NULL' })
  storageConnection?: StorageConnection;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
