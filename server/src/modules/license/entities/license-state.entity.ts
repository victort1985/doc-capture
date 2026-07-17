import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Exactly one row ever exists — this install's own license state. */
@Entity('license_state')
export class LicenseState {
  @PrimaryGeneratedColumn()
  id: number;

  /** Encrypted at rest via encryptString() — see LicenseService. */
  @Column({ type: 'text', nullable: true })
  encryptedKey?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  lastVerifiedAt?: Date | null;

  /** Set the moment the license server explicitly says "revoked" —
   * distinct from simply not having checked in recently. Bypasses the
   * grace-period timeline (see license.constants.ts). */
  @Column({ default: false })
  revoked: boolean;

  @Column({ type: 'varchar', nullable: true })
  customerName?: string | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
