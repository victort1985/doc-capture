import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { City } from '../../locations/entities/city.entity';
import { Location } from '../../locations/entities/location.entity';
import { StorageConnection } from '../../storage/entities/storage-connection.entity';
import { User } from '../../users/entities/user.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { PriceTier } from '../../price-list/entities/price-tier.entity';

export enum ContactCategory {
  CLIENT = 'client',
  TECHNICIAN = 'technician',
  SUPPLIER = 'supplier',
}

/**
 * Phone book contact (spec items 5–6). Editing is admin-only (enforced at
 * the controller level); any authenticated user can read/search.
 *
 * Each contact is also written out as a real file in a `PhoneBook/`
 * directory on the storage backend (not just kept in Postgres) — matches
 * the rest of this app's convention of treating the configured storage
 * connection as the actual record-of-truth artifact store, with Postgres
 * as the fast-query index on top. See PhoneBookService.create().
 */
@Entity('phonebook_contacts')
export class PhoneBookContact {
  @PrimaryGeneratedColumn()
  id: number;

  /** A short, memorable number a person can type to instantly pull up
   * this contact's data elsewhere in the app (quotes, rentals, etc) —
   * distinct from the internal `id` (which exists on every table and
   * isn't meant to be something a person memorizes or types by hand).
   * Assignable manually at creation, or left blank to auto-assign the
   * smallest number not already in use by another contact in this
   * organization — not just max+1, so a gap left by a deleted contact
   * gets reused rather than numbers only ever growing. See
   * PhoneBookService.assignSmallestFreeIdentifier(). */
  @Column({ type: 'integer', nullable: true })
  @Index()
  clientIdentifier?: number | null;

  @Column({ type: 'enum', enum: ContactCategory })
  category: ContactCategory;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  /** Only meaningful for CLIENT-category contacts — which pricing
   * tier this client belongs to, so quotes/invoices built for them
   * can suggest tier-specific prices instead of the standard catalog
   * price. Null means "standard pricing," not "no tier configured
   * yet" vs "explicitly standard" — there's no meaningful difference
   * between those two for how prices actually get looked up. */
  @ManyToOne(() => PriceTier, { nullable: true, onDelete: 'SET NULL' })
  priceTier?: PriceTier | null;

  @ManyToOne(() => City, { nullable: true, onDelete: 'SET NULL' })
  city?: City;

  // "Организация" — reuses the same shared Locations directory as the
  // "Место" field on calls/inventory (confirmed: one directory, two uses).
  @ManyToOne(() => Location, { nullable: true, onDelete: 'SET NULL' })
  organization?: Location;

  @Column({ nullable: true })
  position?: string;

  @Column()
  phone: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  /** ח.פ. / עוסק מורשה number / ת.ז. — same field, same reasoning as
   * Organization.taxId, just on the other side of the relationship
   * (this contact AS a client or supplier, not our own org). Only
   * meaningful for CLIENT/SUPPLIER category contacts, left blank for
   * TECHNICIAN. */
  @Column({ type: 'varchar', nullable: true })
  taxId?: string | null;

  /** Payment terms in days (e.g. 30 = net-30) — how long after
   * invoicing this client is expected to pay, or how long we have to
   * pay this supplier. Used by the "age of debt" report (requirement
   * #13, "возраст долгов"). */
  @Column({ type: 'integer', nullable: true })
  paymentTermsDays?: number | null;

  /** Maximum outstanding balance before new invoices/orders should be
   * flagged — not enforced automatically anywhere yet (no credit-check
   * gate on invoice creation), just recorded so a future report/gate
   * has something to check against. */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  creditLimit?: number | null;

  @Column({ nullable: true })
  photoRelativePath?: string;

  @ManyToOne(() => StorageConnection, { nullable: true, onDelete: 'SET NULL' })
  photoStorageConnection?: StorageConnection;

  // The data-file mirror written to PhoneBook/ on the storage backend —
  // named per the admin-configurable pattern (Templates, appliesTo=phonebook).
  @Column({ nullable: true })
  dataRelativePath?: string;

  @ManyToOne(() => StorageConnection, { nullable: true, onDelete: 'SET NULL' })
  dataStorageConnection?: StorageConnection;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  createdBy?: User;

  // Multi-tenant boundary — see User.organization. Named `tenant` here
  // (not `organization`) since that name is already taken by the
  // business field above (the contact's actual employer/workplace,
  // which is a Location, not an Organization — confusingly similar
  // names for two different concepts). Auto-set from the creating
  // user's organization; null only for contacts created before this
  // feature existed (visible only to the super-admin until reassigned).
  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  tenant?: Organization;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
