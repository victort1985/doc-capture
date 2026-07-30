import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { numericTransformer } from '../../../common/transformers/numeric.transformer';

/**
 * Org-wide document theme — colors + logo/company-info placement,
 * layered on top of whichever of the 9 templates each document type
 * (quotes/invoices/delivery-notes/etc) is separately set to use. One
 * row per org: a brand's colors and logo position should be the same
 * whether the customer is looking at a quote or an invoice, so this
 * lives here rather than duplicated into all 8 document-settings
 * tables.
 */
@Entity('template_design_settings')
export class TemplateDesignSettings {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  @Column({ type: 'varchar', nullable: true })
  primaryColor?: string | null;

  @Column({ type: 'varchar', nullable: true })
  accentColor?: string | null;

  @Column({ type: 'varchar', nullable: true })
  textColor?: string | null;

  /** All three top-left-origin percentages — see
   * TemplateDesignConfig in document-pdf.util.ts for exactly how
   * these convert to pdf-lib's bottom-left point coordinates. */
  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true, transformer: numericTransformer })
  logoXPercent?: number | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true, transformer: numericTransformer })
  logoYPercent?: number | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true, transformer: numericTransformer })
  logoHeightPercent?: number | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true, transformer: numericTransformer })
  companyInfoXPercent?: number | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true, transformer: numericTransformer })
  companyInfoYPercent?: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
