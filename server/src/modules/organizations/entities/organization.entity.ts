import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum BusinessType {
  OSEK_PATUR = 'osek_patur',       // עוסק פטור
  OSEK_MURSHE = 'osek_murshe',     // עוסק מורשה
  CHEVRA = 'chevra',               // חברה בע"מ
  SHUTAFUT = 'shutafut',           // שותפות
  AMUTA = 'amuta',                 // עמותה
}

/**
 * Multi-tenant boundary: an org-scoped admin (user.organization set) only
 * sees data belonging to their own organization. The super-admin (any
 * admin with organization === null — naturally true for the bootstrap
 * admin created when the server was first set up, since nothing assigns
 * it an org) sees and manages everything across all organizations.
 *
 * Logo is stored directly as bytes in Postgres rather than going through
 * the StorageAdapter system the rest of the app uses for documents/
 * photos — organizations don't have a natural "their own storage
 * connection" the way a user or call does, and a logo is small
 * (an app background image, not a scanned document), so a bytea column
 * is the simplest correct choice here rather than inventing an
 * org-level storage-connection concept just for this.
 */
@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column({ type: 'bytea', nullable: true, select: false })
  logoData?: Buffer;

  @Column({ nullable: true })
  logoMimetype?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * Demo/sandbox mode — for organizations used to show the product to
   * prospective customers rather than run a real business. When true:
   *  - every generated PDF gets a large translucent "sample, not for
   *    use" watermark (see document-pdf.util.ts)
   *  - a nightly job (demo-cleanup.cron.ts) deletes almost all
   *    transactional data older than demoRetentionDays: calls, orders,
   *    quotes, invoices, delivery notes, phone book contacts,
   *    locations/cities/regions, warehouse items/categories/
   *    transactions, vehicles/fuel refuels
   *  - explicitly NOT deleted: the organization itself, its logo,
   *    calendar sync settings, order-intake email settings, and the
   *    document-sending email settings — these are the "keep the demo
   *    usable" baseline, and only a super-admin can change them for a
   *    demo org (enforced per-controller, not by a single shared guard,
   *    since each settings type has its own controller)
   *  - any user created for this org afterwards defaults into the
   *    built-in "Users" group rather than getting admin-level access
   */
  @Column({ default: false })
  isDemoMode: boolean;

  @Column({ default: 10 })
  demoRetentionDays: number;

  /** Israeli business entity type (requirement #2 of the tax
   * compliance checklist) — drives VAT/reporting rules downstream
   * (e.g. עוסק פטור is VAT-exempt by definition, matching
   * InvoiceSettings.vatEnabled being off for that type by default at
   * onboarding, though the org can still override it — see
   * organizations.controller.ts). */
  @Column({ type: 'enum', enum: BusinessType, nullable: true })
  businessType?: BusinessType | null;

  /** ח.פ. (חברה) / עוסק מורשה number / ת.ז. for an עוסק פטור — Israeli
   * business/tax registration number. Format varies by businessType
   * (companies: 9 digits starting 51/52/etc; osek: often the owner's
   * ת.ז.), not validated here beyond non-empty since the exact rules
   * differ enough by type that a single regex would reject valid
   * numbers as often as it'd catch typos. */
  @Column({ type: 'varchar', nullable: true })
  taxId?: string | null;

  /** Business registered address — used on generated documents where
   * relevant and as the business-info source for the Tax Authority
   * "Uniform Structure" export's TXT.INI header (fields 1019-1022;
   * see tax-authority-export/structural-records.ts). All optional:
   * the export still works without them (those fields simply stay
   * blank), but a real registration submission should have them
   * filled in. */
  @Column({ type: 'varchar', nullable: true })
  street?: string | null;

  @Column({ type: 'varchar', nullable: true })
  houseNumber?: string | null;

  @Column({ type: 'varchar', nullable: true })
  city?: string | null;

  @Column({ type: 'varchar', nullable: true })
  zip?: string | null;

  /** מספר חברה ברשם החברות — only meaningful for businessType=CHEVRA,
   * left blank otherwise. Feeds the same TXT.INI header (field 1015). */
  @Column({ type: 'varchar', nullable: true })
  companyRegistrationNumber?: string | null;

  /** מספר תיק ניכויים — only relevant for businesses that withhold tax
   * at source (e.g. employers). Feeds the same TXT.INI header
   * (field 1016). */
  @Column({ type: 'varchar', nullable: true })
  deductionsFileNumber?: string | null;
}
