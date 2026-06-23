import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vehicle } from './entities/vehicle.entity';
import { FuelRefuel } from './entities/fuel-refuel.entity';

@Injectable()
export class FleetService {
  constructor(
    @InjectRepository(Vehicle) private readonly vehiclesRepo: Repository<Vehicle>,
    @InjectRepository(FuelRefuel) private readonly refuelsRepo: Repository<FuelRefuel>,
  ) {}

  // ── Vehicles ──────────────────────────────────────────────────────

  findAllVehicles(organizationId: number | null): Promise<Vehicle[]> {
    return this.vehiclesRepo.find({
      where: organizationId != null ? { organization: { id: organizationId } } : {},
      order: { make: 'ASC', model: 'ASC' },
    });
  }

  async findVehicle(id: number, organizationId: number | null): Promise<Vehicle> {
    const v = await this.vehiclesRepo.findOne({ where: { id }, relations: ['organization'] });
    if (!v) throw new NotFoundException('Vehicle not found');
    if (organizationId != null && v.organization?.id !== organizationId) throw new NotFoundException('Vehicle not found');
    return v;
  }

  async createVehicle(dto: Partial<Vehicle>, organizationId: number | null): Promise<Vehicle> {
    const vehicle = this.vehiclesRepo.create({
      ...dto,
      organization: organizationId ? ({ id: organizationId } as any) : undefined,
    });
    return this.vehiclesRepo.save(vehicle);
  }

  async updateVehicle(id: number, organizationId: number | null, dto: Partial<Vehicle>): Promise<Vehicle> {
    const v = await this.findVehicle(id, organizationId);
    Object.assign(v, dto);
    return this.vehiclesRepo.save(v);
  }

  async removeVehicle(id: number, organizationId: number | null): Promise<void> {
    const v = await this.findVehicle(id, organizationId);
    await this.vehiclesRepo.remove(v);
  }

  /** Vehicles with upcoming or overdue inspection/test (within next 30 days or past due). */
  async reminders(organizationId: number | null): Promise<{ vehicle: Vehicle; type: string; dueDate: string }[]> {
    const vehicles = await this.findAllVehicles(organizationId);
    const today = new Date().toISOString().slice(0, 10);
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

    const addYear = (d: string) => {
      const dt = new Date(d);
      dt.setFullYear(dt.getFullYear() + 1);
      return dt.toISOString().slice(0, 10);
    };

    const result: { vehicle: Vehicle; type: string; dueDate: string }[] = [];
    for (const v of vehicles) {
      if (v.lastInspectionDate) {
        const due = addYear(v.lastInspectionDate);
        if (due <= in30) result.push({ vehicle: v, type: 'inspection', dueDate: due });
      }
      if (v.lastTestDate) {
        const due = addYear(v.lastTestDate);
        if (due <= in30) result.push({ vehicle: v, type: 'test', dueDate: due });
      }
    }
    return result;
  }

  // ── Fuel refuels ──────────────────────────────────────────────────

  findRefuels(vehicleId: number): Promise<FuelRefuel[]> {
    return this.refuelsRepo.find({
      where: { vehicle: { id: vehicleId } },
      relations: ['registeredBy'],
      order: { date: 'DESC' },
    });
  }

  async createRefuel(vehicleId: number, userId: number, dto: Partial<FuelRefuel>): Promise<FuelRefuel> {
    return this.refuelsRepo.save(
      this.refuelsRepo.create({
        ...dto,
        vehicle: { id: vehicleId } as any,
        registeredBy: { id: userId } as any,
      }),
    );
  }

  async removeRefuel(id: number): Promise<void> {
    const r = await this.refuelsRepo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('Refuel not found');
    await this.refuelsRepo.remove(r);
  }
}
