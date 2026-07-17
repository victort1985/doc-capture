import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import * as crypto from 'crypto';
import { LicenseState } from './entities/license-state.entity';
import { encryptString, decryptString } from '../../common/crypto/encryption.util';
import {
  LICENSE_PUBLIC_KEY_PEM, LICENSE_SERVER_URL, LICENSE_WARNING_HOURS,
  LICENSE_ADMIN_LOCK_HOURS, LICENSE_FULL_LOCK_HOURS, LICENSE_CHECK_INTERVAL_CRON,
} from './license.constants';

export type LicenseTier = 'NOT_ACTIVATED' | 'OK' | 'WARNING' | 'ADMIN_LOCKED' | 'FULL_LOCKED';

export interface LicenseStatus {
  state: LicenseTier;
  customerName: string | null;
  lastVerifiedAt: string | null;
  hoursSinceCheck: number | null;
  /** ISO timestamp of the next threshold this install will cross if no successful check happens before then. */
  nextDeadline: string | null;
}

const publicKey = crypto.createPublicKey(LICENSE_PUBLIC_KEY_PEM);

@Injectable()
export class LicenseService {
  private readonly logger = new Logger('LicenseService');

  constructor(@InjectRepository(LicenseState) private readonly repo: Repository<LicenseState>) {}

  private async getOrCreateRow(): Promise<LicenseState> {
    let row = await this.repo.findOne({ where: {} });
    if (!row) row = await this.repo.save(this.repo.create({}));
    return row;
  }

  /** Calls the license server and verifies its Ed25519 signature
   * before trusting anything in the response — without this, anyone
   * who can intercept/spoof the HTTP response (bad DNS, compromised
   * network) could just answer "valid:true" themselves. */
  private async callLicenseServer(key: string): Promise<{ valid: boolean; reason?: string; customerName?: string; checkedAt: string }> {
    const res = await fetch(`${LICENSE_SERVER_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
      signal: AbortSignal.timeout(15000),
    });
    const { payloadJson, signature } = await res.json();
    const verified = crypto.verify(null, Buffer.from(payloadJson), publicKey, Buffer.from(signature, 'base64'));
    if (!verified) throw new Error('License server response failed signature verification — possible spoofing, refusing to trust it.');
    return JSON.parse(payloadJson);
  }

  async activate(key: string): Promise<LicenseStatus> {
    if (!/^[0-9a-f]{64}$/i.test(key)) {
      throw new BadRequestException('License key must be 64 hex characters.');
    }
    const result = await this.callLicenseServer(key);
    if (!result.valid) {
      throw new BadRequestException(`License key rejected (${result.reason ?? 'unknown reason'}).`);
    }
    const row = await this.getOrCreateRow();
    row.encryptedKey = encryptString(key);
    row.lastVerifiedAt = new Date(result.checkedAt);
    row.revoked = false;
    row.customerName = result.customerName ?? null;
    await this.repo.save(row);
    this.logger.log(`License activated for "${result.customerName}"`);
    return this.getStatus();
  }

  /** Background re-check — see LICENSE_CHECK_INTERVAL_CRON. Failures
   * (network down, license server unreachable) are logged but don't
   * themselves flip anything to revoked — the grace-period timeline in
   * getStatus() is what handles "hasn't checked in for a while";
   * only an explicit revoked:true response sets the hard flag. */
  @Cron(LICENSE_CHECK_INTERVAL_CRON)
  async verify(): Promise<void> {
    const row = await this.getOrCreateRow();
    const key = decryptString(row.encryptedKey);
    if (!key) return; // never activated yet — nothing to check

    try {
      const result = await this.callLicenseServer(key);
      if (result.valid) {
        row.lastVerifiedAt = new Date(result.checkedAt);
        row.revoked = false;
        if (result.customerName) row.customerName = result.customerName;
        await this.repo.save(row);
      } else if (result.reason === 'revoked' || result.reason === 'not_found') {
        row.revoked = true;
        await this.repo.save(row);
        this.logger.warn(`License is no longer valid (${result.reason}) — locking down per the grace-period timeline.`);
      }
    } catch (err: any) {
      this.logger.warn(`License check failed (will retry next cycle): ${err?.message}`);
    }
  }

  async getStatus(): Promise<LicenseStatus> {
    const row = await this.getOrCreateRow();

    if (!row.encryptedKey) {
      return { state: 'NOT_ACTIVATED', customerName: null, lastVerifiedAt: null, hoursSinceCheck: null, nextDeadline: null };
    }
    if (row.revoked) {
      return { state: 'FULL_LOCKED', customerName: row.customerName ?? null, lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null, hoursSinceCheck: null, nextDeadline: null };
    }

    const hoursSince = row.lastVerifiedAt ? (Date.now() - row.lastVerifiedAt.getTime()) / 3_600_000 : Infinity;
    const lastVerifiedMs = row.lastVerifiedAt?.getTime() ?? Date.now();

    let state: LicenseTier;
    let nextDeadline: Date | null;
    if (hoursSince < LICENSE_WARNING_HOURS) {
      state = 'OK';
      nextDeadline = new Date(lastVerifiedMs + LICENSE_WARNING_HOURS * 3_600_000);
    } else if (hoursSince < LICENSE_ADMIN_LOCK_HOURS) {
      state = 'WARNING';
      nextDeadline = new Date(lastVerifiedMs + LICENSE_ADMIN_LOCK_HOURS * 3_600_000);
    } else if (hoursSince < LICENSE_FULL_LOCK_HOURS) {
      state = 'ADMIN_LOCKED';
      nextDeadline = new Date(lastVerifiedMs + LICENSE_FULL_LOCK_HOURS * 3_600_000);
    } else {
      state = 'FULL_LOCKED';
      nextDeadline = null;
    }

    return {
      state,
      customerName: row.customerName ?? null,
      lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
      hoursSinceCheck: Number.isFinite(hoursSince) ? Math.round(hoursSince * 10) / 10 : null,
      nextDeadline: nextDeadline?.toISOString() ?? null,
    };
  }
}
