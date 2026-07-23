import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../users/entities/user.entity';

export enum OrderSource {
  EMAIL = 'email',
  MANUAL = 'manual',
}

/**
 * A purchase order captured either automatically from the dedicated
 * order-intake Gmail inbox (a supplier emails a PO as a PDF) or
 * uploaded manually from the app. The stored file starts as just the
 * PO itself; once the matching delivery note/invoice is added
 * (addInvoicePage), it becomes page 2 and the order is complete.
 *
 * The generated filename encodes the 3 fields extracted from the PO
 * document (see OrderPdfParserService) plus completion state:
 * "{date} - {organization} - רכש {poNumberLast4} - תמ {invoiceNumber|0000}[ - {invoiceDescription}]"
 * — see OrdersService.generateName().
 */
@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  /** Optionally links this (supplier-side) purchase order into a
   * customer-facing order-processing chain (quote/delivery-note/
   * invoice) — see order-chain module. Most Orders won't have one. */
  @Column({ type: 'uuid', nullable: true })
  @Index()
  chainId?: string | null;

  @Column({ type: 'date' })
  orderDate: string;

  @Column()
  organization: string;

  /** Last 4 digits of the PO number (e.g. "PO2603001844" -> "1844"). */
  @Column({ length: 4 })
  poNumberLast4: string;

  /** Null/unset until a delivery note is attached — filename uses
   * "0000" as a placeholder in that state. */
  @Column({ type: 'varchar', nullable: true })
  invoiceNumber?: string | null;

  /** Free-text note entered alongside the invoice number when
   * completing the order (e.g. what the delivery note covers) —
   * appended to the generated filename after the invoice number. */
  @Column({ type: 'varchar', nullable: true })
  invoiceDescription?: string | null;

  @Column({ type: 'enum', enum: OrderSource, default: OrderSource.MANUAL })
  source: OrderSource;

  /** Where the current (possibly 2-page, once completed) PDF lives —
   * an app-managed storage path, not a user-facing name. */
  @Column()
  storagePath: string;

  /** The subject line of the source email, kept for troubleshooting
   * when automatic field extraction gets something wrong — null for
   * manually-uploaded orders. */
  @Column({ type: 'varchar', nullable: true })
  sourceEmailSubject?: string | null;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  tenant?: Organization | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  createdBy?: User | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
