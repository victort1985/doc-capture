import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { WarehouseCategory } from './warehouse-category.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { Location } from '../../locations/entities/location.entity';
import { numericTransformer } from '../../../common/transformers/numeric.transformer';

@Entity('warehouse_items')
export class WarehouseItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ unique: true })
  barcode: string; // generated or manually assigned

  @ManyToOne(() => WarehouseCategory, { nullable: true, onDelete: 'SET NULL' })
  category?: WarehouseCategory;

  @Column({ default: 0 })
  quantity: number; // current stock

  /** Optional explicit "reorder when stock hits this" threshold — a
   * person who knows their own supplier lead times can set this
   * directly. Left unset, purchasing recommendations fall back to a
   * consumption-rate estimate instead (see
   * PurchasingRecommendationsService — "will run out in N days at the
   * recent usage rate" rather than a fixed number nobody configured).
   * Zero and null are treated the same (no explicit threshold). */
  @Column({ type: 'int', nullable: true })
  reorderPoint?: number | null;

  /** Plain text, not a foreign key — matches how supplierName is
   * stored everywhere else in this app (SupplierInvoice etc., no
   * dedicated Supplier entity exists). Purely informational, shown on
   * a purchasing recommendation so "reorder this" also suggests who
   * from, without requiring supplier master data this app doesn't
   * otherwise track. */
  @Column({ type: 'varchar', nullable: true })
  preferredSupplierName?: string | null;

  @Column({ nullable: true })
  unit?: string; // шт, кг, м…

  /** Sale/reference price for this item — separate from any cost-price
   * bookkeeping, used to pre-fill quote/invoice/delivery-note line
   * items when picking a warehouse item as a document line (see the
   * Prices catalog for the equivalent on services). */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: numericTransformer })
  price?: number;

  @Column({ nullable: true })
  location?: string; // shelf/rack label within the location's warehouse

  /** Which location's independent warehouse this item physically belongs
   * to. Each location has its own separate stock — there is no shared
   * "general" warehouse across locations. Nullable only for items created
   * before this field existed; the client should require a location going
   * forward. */
  @ManyToOne(() => Location, { nullable: true, onDelete: 'SET NULL' })
  warehouseLocation?: Location;

  @Column({ nullable: true })
  notes?: string;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  /** 'none' | 'in_repair' | 'returned' */
  @Column({ default: 'none' })
  repairStatus: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
