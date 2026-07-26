import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { encryptString, decryptString } from '../../../common/crypto/encryption.util';
import { numericTransformer } from '../../../common/transformers/numeric.transformer';

/**
 * Israel Tax Authority "Invoice Israel" (חשבונית ישראל) integration —
 * requirement #6. Reference: "מודל חשבוניות ישראל — תיאור ה-API's",
 * edition 2.0/7.2024 (https://www.gov.il/BlobFolder/generalpage/
 * hor-software-other/he/vat_software-houses-180724.pdf) and the login
 * guide at secapp.taxes.gov.il/OpenAPIUserGuide/OpenAPIUserGuide.pdf.
 *
 * One row per organization — the VAT number (number_vat) issuing
 * invoices is org-specific, so the OAuth2 app/credentials are too.
 * Everything here has to be set up by hand once, through the ITA's
 * own developer portal (https://openapi-portal.taxes.gov.il) — sign
 * up, submit signed registration documents, wait for ITA approval,
 * create an "app" to get clientId/clientSecret, subscribe that app to
 * the Invoices product. None of that can be automated from here.
 */
@Entity('tax_authority_settings')
export class TaxAuthoritySettings {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  /** Off by default — an org has to deliberately turn this on once
   * they've actually completed ITA registration, not have every
   * invoice silently start trying (and failing) to call an
   * unconfigured integration. */
  @Column({ default: false })
  enabled: boolean;

  /** sandbox until an org has been through ITA's production approval
   * (separate from sandbox signup — see the login guide's "Signing up
   * an organization" section, production requires submitting signed
   * documents and waiting for confirmation). */
  @Column({ type: 'enum', enum: ['sandbox', 'production'], default: 'sandbox' })
  environment: 'sandbox' | 'production';

  /** number_vat in the API — the ח.פ./עוסק מורשה number of whoever is
   * ISSUING invoices, i.e. this organization. Deliberately separate
   * from Organization.taxId (that field is general-purpose business
   * info; this one specifically has to match what's registered with
   * the ITA for this integration, which should usually be the same
   * value but isn't guaranteed to be). */
  @Column({ type: 'varchar', nullable: true })
  vatNumber?: string | null;

  /** accounting_software_number — the software registry number this
   * app gets once/if it completes the SEPARATE registration process
   * (מרשם תוכנות, requirement #1). Until then, the API spec says to
   * send the issuer's own ID/VAT number instead. */
  @Column({ type: 'varchar', nullable: true })
  softwareRegistrationNumber?: string | null;

  /** Amount before VAT above which an invoice needs an allocation
   * number. The ORIGINAL 2024 schedule (25,000 → 20,000 → 15,000 →
   * 10,000 → 5,000 ₪, one step per year 2024-2028) was published in
   * the API spec itself, but subsequent regulation has moved FASTER
   * than that schedule — as of mid-2026 the threshold is already
   * 5,000 ₪, years ahead of the original 2028 target. This value
   * needs checking against the ITA's current published threshold
   * periodically, not trusted as a fixed constant — hence a setting,
   * not a hardcoded number in code. */
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 5000, transformer: numericTransformer })
  thresholdAmount: number;

  @Column({
    type: 'varchar',
    nullable: true,
    transformer: {
      to: (value?: string | null) => (value ? encryptString(value) : value),
      from: (value?: string | null) => (value ? decryptString(value) ?? value : value),
    },
  })
  clientId?: string | null;

  /** OAuth2 "scope" parameter — the ITA's login guide only shows this
   * as a literal placeholder ("scope=scope") in its example URL, not
   * a documented fixed value. It's most likely tied to whichever
   * specific product/app got subscribed to in the developer portal
   * (see "Subscribing applications to services" in the login guide),
   * which this app has no way to know in advance — so it's a plain
   * setting rather than a hardcoded guess that would silently break
   * the whole OAuth flow if wrong. Check the developer portal's app
   * page for the actual scope string once Victor has sandbox access. */
  @Column({ type: 'varchar', nullable: true })
  oauthScope?: string | null;

  @Column({
    type: 'varchar',
    nullable: true,
    select: false,
    transformer: {
      to: (value?: string | null) => (value ? encryptString(value) : value),
      from: (value?: string | null) => (value ? decryptString(value) ?? value : value),
    },
  })
  clientSecret?: string | null;

  @Column({
    type: 'text',
    nullable: true,
    select: false,
    transformer: {
      to: (value?: string | null) => (value ? encryptString(value) : value),
      from: (value?: string | null) => (value ? decryptString(value) ?? value : value),
    },
  })
  accessToken?: string | null;

  @Column({
    type: 'text',
    nullable: true,
    select: false,
    transformer: {
      to: (value?: string | null) => (value ? encryptString(value) : value),
      from: (value?: string | null) => (value ? decryptString(value) ?? value : value),
    },
  })
  refreshToken?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  accessTokenExpiresAt?: Date | null;

  /** Whichever the org's user chose the last time an invoice's
   * allocation request came back refused (see requirement #6's
   * "עיכוב חשבונית" section) — surfaced so the same choice can be
   * offered as a quick default, not applied automatically (each
   * refusal needs an explicit decision, this is just a UX
   * convenience). */
  @Column({ type: 'timestamp', nullable: true })
  lastConnectedAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
