import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vehicle } from './entities/vehicle.entity';
import { FuelRefuel } from './entities/fuel-refuel.entity';
import { VehicleDocument } from './entities/vehicle-document.entity';
import { StorageService } from '../storage/storage.service';
import { encryptBuffer, decryptBuffer } from '../../common/crypto/encryption.util';
import * as path from 'path';

@Injectable()
export class FleetService {
  constructor(
    @InjectRepository(Vehicle) private readonly vehiclesRepo: Repository<Vehicle>,
    @InjectRepository(FuelRefuel) private readonly refuelsRepo: Repository<FuelRefuel>,
    @InjectRepository(VehicleDocument) private readonly docsRepo: Repository<VehicleDocument>,
    private readonly storageService: StorageService,
  ) {}

  // ── Vehicles ──────────────────────────────────────────────────────

  findAllVehicles(organizationId: number | null, isPrivileged = false): Promise<Vehicle[]> {
    return this.vehiclesRepo.find({
      where: (organizationId != null && !isPrivileged) ? { organization: { id: organizationId } } : {},
      relations: ['organization', 'assignedUser'],
      order: { make: 'ASC', model: 'ASC' },
    });
  }

  async findVehicle(id: number, organizationId: number | null, isPrivileged = false): Promise<Vehicle> {
    const v = await this.vehiclesRepo.findOne({ where: { id }, relations: ['organization', 'assignedUser'] });
    if (!v) throw new NotFoundException('Vehicle not found');
    if (!isPrivileged && organizationId != null && v.organization?.id !== organizationId) throw new NotFoundException('Vehicle not found');
    return v;
  }

  async createVehicle(dto: Partial<Vehicle> & { assignedUserId?: number }, organizationId: number | null): Promise<Vehicle> {
    const vehicle = this.vehiclesRepo.create({
      ...dto,
      organization: organizationId ? ({ id: organizationId } as any) : undefined,
      assignedUser: dto.assignedUserId ? ({ id: dto.assignedUserId } as any) : undefined,
    });
    return this.vehiclesRepo.save(vehicle);
  }

  async updateVehicle(id: number, organizationId: number | null, dto: Partial<Vehicle> & { assignedUserId?: number }, isPrivileged = false): Promise<Vehicle> {
    const v = await this.findVehicle(id, organizationId, isPrivileged);
    Object.assign(v, {
      ...dto,
      assignedUser: dto.assignedUserId !== undefined ? (dto.assignedUserId ? ({ id: dto.assignedUserId } as any) : null) : v.assignedUser,
    });
    return this.vehiclesRepo.save(v);
  }

  async removeVehicle(id: number, organizationId: number | null, isPrivileged = false): Promise<void> {
    const v = await this.findVehicle(id, organizationId, isPrivileged);
    await this.vehiclesRepo.remove(v);
  }

  /** Vehicles with upcoming or overdue inspection/test (within next 30 days or past due). */
  async reminders(organizationId: number | null, isPrivileged = false): Promise<{ vehicle: Vehicle; type: string; dueDate: string }[]> {
    const vehicles = await this.findAllVehicles(organizationId, isPrivileged);
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

  // ── Vehicle documents ──────────────────────────────────────────────

  async addDocument(
    vehicleId: number,
    userId: number,
    file: { originalname: string; buffer: Buffer; mimetype: string },
    description?: string,
  ): Promise<VehicleDocument> {
    const settings = await this.storageService.getClientSettings(userId);
    const connectionId = settings?.documentStorageConnection?.id;
    const ext = path.extname(file.originalname) || '.pdf';
    const filename = `${Date.now()}${ext}`;
    const relativePath = `vehicles/${vehicleId}/${filename}`;

    const doc = this.docsRepo.create({
      vehicle: { id: vehicleId } as any,
      originalName: file.originalname,
      relativePath,
      mimetype: file.mimetype,
      description,
      uploadedBy: { id: userId } as any,
    });

    if (connectionId) {
      const { adapter, encryptAtRest } = await this.storageService.getAdapterWithMeta(connectionId);
      const toWrite = encryptAtRest ? encryptBuffer(file.buffer) : file.buffer;
      await adapter.write(relativePath, toWrite);
      doc.encrypted = encryptAtRest;
    }

    return this.docsRepo.save(doc);
  }

  findDocuments(vehicleId: number): Promise<VehicleDocument[]> {
    return this.docsRepo.find({
      where: { vehicle: { id: vehicleId } },
      relations: ['uploadedBy'],
      order: { createdAt: 'DESC' },
    });
  }

  async downloadDocument(id: number): Promise<{ buffer: Buffer; originalName: string; mimetype: string }> {
    const doc = await this.docsRepo.findOne({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');
    const settings = await this.storageService.getClientSettings(0);
    const connectionId = settings?.documentStorageConnection?.id;
    if (!connectionId) throw new NotFoundException('Storage not configured');
    const { adapter } = await this.storageService.getAdapterWithMeta(connectionId);
    let bytes = await adapter.read(doc.relativePath);
    if (doc.encrypted) bytes = decryptBuffer(bytes);
    return { buffer: bytes, originalName: doc.originalName, mimetype: doc.mimetype ?? 'application/octet-stream' };
  }

  async removeDocument(id: number): Promise<void> {
    const doc = await this.docsRepo.findOne({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');
    await this.docsRepo.remove(doc);
  }
}
