import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RegisteredDevice } from './entities/registered-device.entity';
import { LicenseService } from './license.service';

@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(RegisteredDevice) private readonly repo: Repository<RegisteredDevice>,
    private readonly licenseService: LicenseService,
  ) {}

  /** Called on every mobile login. A known, non-revoked device is
   * just updated (last-seen, last-user) — no limit check needed since
   * it already holds a slot. A brand-new device only gets a slot if
   * under the license's maxDevices; otherwise login is refused with a
   * clear reason rather than a generic error. */
  async registerOrTouch(deviceId: string, userId: number, platform?: string): Promise<void> {
    if (!deviceId) return; // older app builds without device registration yet — don't hard-fail them

    const existing = await this.repo.findOne({ where: { deviceId } });
    if (existing) {
      if (existing.revoked) {
        throw new ForbiddenException('This device has been deactivated by your administrator. Contact them to re-enable it.');
      }
      existing.lastUser = { id: userId } as any;
      existing.platform = platform ?? existing.platform;
      await this.repo.save(existing);
      return;
    }

    const [activeCount, maxDevices] = await Promise.all([
      this.repo.count({ where: { revoked: false } }),
      this.licenseService.getMaxDevices(),
    ]);
    if (activeCount >= maxDevices) {
      throw new ForbiddenException(
        `Device limit reached (${maxDevices} devices on your current plan). Ask your administrator to free up a slot or upgrade your plan.`,
      );
    }

    await this.repo.save(this.repo.create({ deviceId, platform, lastUser: { id: userId } as any }));
  }

  findAll(): Promise<RegisteredDevice[]> {
    return this.repo.find({ relations: ['lastUser'], order: { lastSeenAt: 'DESC' } });
  }

  async revoke(id: number): Promise<void> {
    await this.repo.update(id, { revoked: true });
  }

  async unrevoke(id: number): Promise<void> {
    await this.repo.update(id, { revoked: false });
  }

  async remove(id: number): Promise<void> {
    await this.repo.delete(id);
  }
}
