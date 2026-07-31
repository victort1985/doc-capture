import {
  Column, CreateDateColumn, Entity, Index, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../users/entities/user.entity';
import { WarehouseItem } from '../../warehouse/entities/warehouse-item.entity';
import { PhoneBookContact } from '../../phonebook/entities/phonebook-contact.entity';

export enum RentalStatus {
  ACTIVE = 'active',
  RETURNED = 'returned',
}

/**
 * Any warehouse item lent out to a client for a set period — a
 * distinct concept from a sale (delivery note) or a repair: the item
 * is expected back, tracked against a due date, and shows up in the
 * same warning/danger color-coding system (see TimeThresholdSettings)
 * as calls and vehicle inspections once it's close to or past that
 * date.
 *
 * clientName/clientPhone are a snapshot taken at creation time, not
 * just a live join through `contact` — same reasoning as every other
 * document type in this app that references a phonebook contact
 * (quotes, invoices, etc): the rental record should still read
 * sensibly even if the contact is later edited or deleted.
 *
 * Creating a rental records an OUT warehouse transaction for the
 * rented quantity (see RentalsService.create — reuses
 * WarehouseService.addTransaction, the same mechanism a delivery note
 * already uses to reduce stock), and marking it returned records the
 * matching IN transaction. This is why quantity lives here as a
 * first-class column rather than nested inside some generic "items"
 * JSON blob the way quotes/invoices do — a rental is always exactly
 * one item/quantity pair, not a multi-line document.
 */
@Entity('rentals')
export class Rental {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  rentalNumber?: string;

  @ManyToOne(() => WarehouseItem, { onDelete: 'RESTRICT' })
  warehouseItem: WarehouseItem;

  @Column({ default: 1 })
  quantity: number;

  @ManyToOne(() => PhoneBookContact, { nullable: true, onDelete: 'SET NULL' })
  contact?: PhoneBookContact | null;

  @Column()
  clientName: string;

  @Column({ nullable: true })
  clientPhone?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date' })
  @Index()
  dueDate: string;

  @Column({ type: 'enum', enum: RentalStatus, default: RentalStatus.ACTIVE })
  @Index()
  status: RentalStatus;

  @Column({ type: 'timestamp', nullable: true })
  returnedAt?: Date | null;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  @Index()
  organization?: Organization;

  @ManyToOne(() => User, { nullable: true })
  createdBy?: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
