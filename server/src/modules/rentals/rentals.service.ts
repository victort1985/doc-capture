import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rental, RentalStatus } from './entities/rental.entity';
import { CreateRentalDto } from './dto/create-rental.dto';
import { WarehouseService } from '../warehouse/warehouse.service';
import { TransactionType } from '../warehouse/entities/warehouse-transaction.entity';

@Injectable()
export class RentalsService {
  constructor(
    @InjectRepository(Rental) private readonly repo: Repository<Rental>,
    private readonly warehouseService: WarehouseService,
  ) {}

  async list(organizationId: number | null, status?: RentalStatus): Promise<Rental[]> {
    return this.repo.find({
      where: { ...(organizationId != null ? { organization: { id: organizationId } } : {}), ...(status ? { status } : {}) },
      relations: ['warehouseItem', 'contact'],
      order: { dueDate: 'ASC' },
    });
  }

  /** Everything currently out (not yet returned) — the shape the Home
   * tab's attention notifications and the color-coded list both work
   * from, so a rental's urgency is always judged against "is it still
   * out and getting close to/past its due date", never against a
   * returned one that just happens to have an old dueDate. */
  async listActive(organizationId: number | null): Promise<Rental[]> {
    return this.list(organizationId, RentalStatus.ACTIVE);
  }

  async create(organizationId: number | null, userId: number, dto: CreateRentalDto): Promise<Rental> {
    const quantity = dto.quantity ?? 1;

    const item = await this.warehouseService.getItemById(dto.warehouseItemId, organizationId);
    if (!item) throw new NotFoundException('Warehouse item not found');
    if (item.quantity < quantity) {
      throw new BadRequestException(`Only ${item.quantity} of "${item.name}" in stock — cannot rent out ${quantity}.`);
    }

    const count = await this.repo.count({ where: organizationId != null ? { organization: { id: organizationId } } : {} });
    const rentalNumber = `R-${String(count + 1).padStart(5, '0')}`;

    const rental = this.repo.create({
      rentalNumber,
      warehouseItem: { id: dto.warehouseItemId } as any,
      quantity,
      contact: dto.contactId ? ({ id: dto.contactId } as any) : undefined,
      clientName: dto.clientName,
      clientPhone: dto.clientPhone,
      description: dto.description,
      startDate: dto.startDate ?? new Date().toISOString().slice(0, 10),
      dueDate: dto.dueDate,
      status: RentalStatus.ACTIVE,
      organization: organizationId != null ? ({ id: organizationId } as any) : undefined,
      createdBy: { id: userId } as any,
    });
    const saved = await this.repo.save(rental);

    // Same mechanism a delivery note already uses to reduce stock —
    // the rented quantity becomes unavailable for the duration.
    await this.warehouseService.addTransaction(
      dto.warehouseItemId, TransactionType.OUT, quantity, `Rental ${rentalNumber}`, undefined, userId, organizationId,
    );

    return saved;
  }

  async markReturned(id: number, organizationId: number | null, userId: number): Promise<Rental> {
    const rental = await this.repo.findOne({ where: { id }, relations: ['organization', 'warehouseItem'] });
    if (!rental) throw new NotFoundException('Rental not found');
    if (organizationId != null && rental.organization?.id !== organizationId) throw new NotFoundException('Rental not found');
    if (rental.status === RentalStatus.RETURNED) throw new BadRequestException('This rental is already marked returned');

    rental.status = RentalStatus.RETURNED;
    rental.returnedAt = new Date();
    const saved = await this.repo.save(rental);

    await this.warehouseService.addTransaction(
      rental.warehouseItem.id, TransactionType.IN, rental.quantity, `Returned from rental ${rental.rentalNumber}`, undefined, userId, organizationId,
    );

    return saved;
  }
}
