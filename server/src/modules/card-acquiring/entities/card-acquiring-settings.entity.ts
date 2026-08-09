import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { encryptString, decryptString } from '../../../common/crypto/encryption.util';

export enum CardAcquiringProvider {
  NONE = 'none',
  STRIPE = 'stripe',
  TRANZILA = 'tranzila',
  CARDCOM = 'cardcom',
}

/**
 * STRUCTURAL SCAFFOLDING ONLY — no card is ever actually charged
 * through this. This exists so that when a real payment gateway
 * account (Stripe, Tranzila, or CardCom — the three most common for
 * Israeli businesses) is actually set up, wiring it in is "implement
 * one provider-specific charge() method" rather than also designing
 * the settings storage, encryption, and admin UI from scratch. See
 * CardAcquiringService.charge's own doc comment for why it always
 * throws right now regardless of what's configured here — this
 * entity storing a provider/key is NOT the same as that provider
 * actually being integrated.
 */
@Entity('card_acquiring_settings')
export class CardAcquiringSettings {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  @Column({ type: 'enum', enum: CardAcquiringProvider, default: CardAcquiringProvider.NONE })
  provider: CardAcquiringProvider;

  /** Same AES-256-GCM-at-rest pattern as DocumentEmailSettings.
   * appPassword — see that entity's own doc comment for why
   * encryption (not just select:false) matters here. Meaningless
   * until a real provider integration exists to actually use it. */
  @Column({
    type: 'varchar', nullable: true, select: false,
    transformer: {
      to: (value?: string | null) => (value ? encryptString(value) : value),
      from: (value?: string | null) => (value ? decryptString(value) ?? value : value),
    },
  })
  apiKey?: string | null;
}
