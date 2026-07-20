import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

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
}
