import {
  Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Organization } from '../../organizations/entities/organization.entity';

export enum DealStage {
  LEAD = 'lead',
  CONTACTED = 'contacted',
  NEGOTIATION = 'negotiation',
  WON = 'won',
  LOST = 'lost',
}

/**
 * A CRM pipeline record — the same underlying shape as ServiceCall
 * (see calls/entities/service-call.entity.ts, this module's own
 * architectural reference), reused here for tracking a prospective
 * or ongoing client relationship through its stages rather than a
 * service-call lifecycle. Interaction history (calls made, meetings,
 * emails, notes) lives in DealInteraction the same way CallNote holds
 * a service call's own history — one row per real-world touch point,
 * not a single free-text field that loses who-said-what-when.
 */
@Entity('crm_deals')
export class Deal {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  clientName: string;

  @Column({ nullable: true })
  clientPhone?: string;

  @Column({ nullable: true })
  clientEmail?: string;

  @Column({ type: 'enum', enum: DealStage, default: DealStage.LEAD })
  @Index()
  stage: DealStage;

  /** What this deal is worth if won — an estimate the person entering
   * it provides, not derived from anything (a deal doesn't become a
   * real invoice/quote automatically; converting one into an actual
   * quote is a manual step, matching how the rest of this app treats
   * document-to-document conversion — see QuotesPage's own
   * convertToInvoice for the equivalent pattern elsewhere). */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  estimatedValue?: number | null;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  /** Who owns working this deal — defaults to whoever created it, but
   * reassignable, unlike ServiceCall's own createdBy which never
   * changes hands. A separate concept from createdBy for exactly that
   * reason: "who logged this" and "whose job is it to close it" are
   * two different questions once a deal gets handed off. */
  @ManyToOne(() => User, { nullable: true })
  assignedTo?: User;

  @ManyToOne(() => User)
  createdBy: User;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  @Index()
  organization?: Organization;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
