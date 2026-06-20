import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { City } from '../../locations/entities/city.entity';
import { Location } from '../../locations/entities/location.entity';
import { StorageConnection } from '../../storage/entities/storage-connection.entity';
import { User } from '../../users/entities/user.entity';

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

  @Column({ type: 'enum', enum: ContactCategory })
  category: ContactCategory;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
