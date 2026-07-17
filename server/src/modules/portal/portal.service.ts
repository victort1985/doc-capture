import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Location } from '../locations/entities/location.entity';
import { ServiceCall } from '../calls/entities/service-call.entity';

@Injectable()
export class PortalService {
  constructor(
    @InjectRepository(Location) private readonly locationsRepo: Repository<Location>,
    @InjectRepository(ServiceCall) private readonly callsRepo: Repository<ServiceCall>,
  ) {}

  /** Everything the public portal page shows for one location — no
   * auth, the token itself is the credential (same pattern as
   * Quote.approvalToken). Deliberately minimal: status/dates only, no
   * internal notes or attachments, since this is client-facing. */
  async getByToken(token: string) {
    const location = await this.locationsRepo.findOne({ where: { portalToken: token } });
    if (!location) throw new NotFoundException('Portal not found');

    const calls = await this.callsRepo.find({
      where: { location: { id: location.id } },
      order: { createdAt: 'DESC' },
      take: 50,
      select: ['id', 'place', 'status', 'urgency', 'createdAt', 'statusChangedAt'],
    });

    return {
      locationName: location.name,
      calls: calls.map((c) => ({
        id: c.id,
        status: c.status,
        urgency: c.urgency,
        createdAt: c.createdAt,
        statusChangedAt: c.statusChangedAt ?? null,
      })),
    };
  }
}
