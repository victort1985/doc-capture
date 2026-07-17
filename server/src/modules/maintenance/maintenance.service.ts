import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { MaintenanceContract } from './entities/maintenance-contract.entity';
import { CreateMaintenanceContractDto } from './dto/create-maintenance-contract.dto';
import { CallsService } from '../calls/calls.service';
import { CallUrgency } from '../calls/entities/service-call.entity';

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger('MaintenanceService');

  constructor(
    @InjectRepository(MaintenanceContract) private readonly repo: Repository<MaintenanceContract>,
    private readonly callsService: CallsService,
  ) {}

  async findAll(organizationId: number | null): Promise<MaintenanceContract[]> {
    return this.repo.find({
      where: organizationId != null ? { organization: { id: organizationId } } : {},
      relations: ['location'],
      order: { nextRunDate: 'ASC' },
    });
  }

  async create(organizationId: number | null, userId: number, dto: CreateMaintenanceContractDto): Promise<MaintenanceContract> {
    const contract = this.repo.create({
      title: dto.title,
      location: { id: dto.locationId } as any,
      frequency: dto.frequency,
      nextRunDate: dto.nextRunDate,
      description: dto.description,
      urgency: dto.urgency ?? CallUrgency.NOT_URGENT,
      contactPhone: dto.contactPhone,
      active: dto.active ?? true,
      createdBy: { id: userId } as any,
      organization: organizationId != null ? ({ id: organizationId } as any) : undefined,
    });
    return this.repo.save(contract);
  }

  async setActive(id: number, organizationId: number | null, active: boolean): Promise<MaintenanceContract> {
    const contract = await this.findOne(id, organizationId);
    contract.active = active;
    return this.repo.save(contract);
  }

  private async findOne(id: number, organizationId: number | null): Promise<MaintenanceContract> {
    const contract = await this.repo.findOne({ where: { id }, relations: ['organization'] });
    if (!contract) throw new NotFoundException('Maintenance contract not found');
    if (organizationId != null && contract.organization?.id !== organizationId) {
      throw new NotFoundException('Maintenance contract not found');
    }
    return contract;
  }

  async remove(id: number, organizationId: number | null): Promise<void> {
    const contract = await this.findOne(id, organizationId);
    await this.repo.remove(contract);
  }

  /** Once a day: for every active contract due today or earlier
   * (covers the server having been down when it was due), create the
   * real ServiceCall and roll nextRunDate forward by the frequency.
   * Runs at 06:00 server time — well before a technician's day
   * starts, after any midnight-adjacent date-rollover edge cases. */
  @Cron('0 6 * * *')
  async runDueContracts(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const due = await this.repo.find({
      where: { active: true, nextRunDate: LessThanOrEqual(today) },
      relations: ['location', 'location.organization', 'createdBy'],
    });

    for (const contract of due) {
      try {
        await this.callsService.create(contract.createdBy.id, contract.location.organization?.id ?? null, {
          place: contract.location.name,
          locationId: contract.location.id,
          urgency: contract.urgency,
          contactName: contract.contactName,
          contactPosition: 'Scheduled maintenance',
          contactPhone: contract.contactPhone || '—',
          description: `[${contract.title}] ${contract.description}`,
        });
        contract.nextRunDate = MaintenanceContract.advance(contract.nextRunDate, contract.frequency);
        contract.lastRunAt = new Date();
        await this.repo.save(contract);
        this.logger.log(`Created scheduled call for contract #${contract.id} (${contract.title}); next run ${contract.nextRunDate}`);
      } catch (err: any) {
        this.logger.error(`Failed to run maintenance contract #${contract.id}: ${err?.message}`);
      }
    }
  }
}
