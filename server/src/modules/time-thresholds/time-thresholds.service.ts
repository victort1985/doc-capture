import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TimeThresholdSettings } from './entities/time-threshold-settings.entity';
import { UpdateTimeThresholdsDto } from './dto/update-time-thresholds.dto';

@Injectable()
export class TimeThresholdsService {
  constructor(@InjectRepository(TimeThresholdSettings) private readonly repo: Repository<TimeThresholdSettings>) {}

  async findOrCreate(organizationId: number): Promise<TimeThresholdSettings> {
    let s = await this.repo.findOne({ where: { organization: { id: organizationId } } });
    if (!s) {
      s = await this.repo.save(this.repo.create({ organization: { id: organizationId } as any }));
    }
    return s;
  }

  async update(organizationId: number, dto: UpdateTimeThresholdsDto): Promise<TimeThresholdSettings> {
    const s = await this.findOrCreate(organizationId);
    if (dto.callsWarningHours !== undefined) s.callsWarningHours = dto.callsWarningHours;
    if (dto.callsDangerHours !== undefined) s.callsDangerHours = dto.callsDangerHours;
    if (dto.vehicleWarningDays !== undefined) s.vehicleWarningDays = dto.vehicleWarningDays;
    if (dto.vehicleDangerDays !== undefined) s.vehicleDangerDays = dto.vehicleDangerDays;
    if (dto.rentalWarningDays !== undefined) s.rentalWarningDays = dto.rentalWarningDays;
    if (dto.rentalDangerDays !== undefined) s.rentalDangerDays = dto.rentalDangerDays;
    return this.repo.save(s);
  }
}
