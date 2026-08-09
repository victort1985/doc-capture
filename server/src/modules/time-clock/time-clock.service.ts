import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { TimeClockEntry } from './entities/time-clock-entry.entity';

export interface TimesheetRow {
  userId: number;
  username: string;
  totalHours: number;
  shiftCount: number;
}

@Injectable()
export class TimeClockService {
  constructor(
    @InjectRepository(TimeClockEntry) private readonly repo: Repository<TimeClockEntry>,
  ) {}

  /** Starts a new shift — rejects if this person already has an open
   * one (clockOut still null), since clocking in twice without ever
   * clocking out would silently double-count hours worked and lose
   * track of which shift is actually the current one. A person who
   * genuinely forgot to clock out needs to close that shift first
   * (or have an admin fix it) rather than the system quietly starting
   * a second, overlapping one. */
  async clockIn(userId: number, organizationId: number | null, costCenterId?: number): Promise<TimeClockEntry> {
    const openShift = await this.repo.findOne({ where: { user: { id: userId }, clockOut: IsNull() } });
    if (openShift) {
      throw new BadRequestException(`Already clocked in since ${openShift.clockIn.toISOString()} — clock out first.`);
    }
    const entry = this.repo.create({
      user: { id: userId } as any,
      clockIn: new Date(),
      costCenter: costCenterId ? ({ id: costCenterId } as any) : undefined,
      organization: organizationId != null ? ({ id: organizationId } as any) : undefined,
    });
    return this.repo.save(entry);
  }

  /** Closes this person's own currently-open shift, if any. */
  async clockOut(userId: number, notes?: string): Promise<TimeClockEntry> {
    const openShift = await this.repo.findOne({ where: { user: { id: userId }, clockOut: IsNull() } });
    if (!openShift) throw new BadRequestException('No open shift to clock out of.');
    openShift.clockOut = new Date();
    if (notes) openShift.notes = notes;
    return this.repo.save(openShift);
  }

  async getMyOpenShift(userId: number): Promise<TimeClockEntry | null> {
    return this.repo.findOne({ where: { user: { id: userId }, clockOut: IsNull() } });
  }

  async getEntries(organizationId: number | null, from: string, to: string, userId?: number): Promise<TimeClockEntry[]> {
    const qb = this.repo.createQueryBuilder('e')
      .leftJoinAndSelect('e.user', 'user')
      .leftJoinAndSelect('e.costCenter', 'costCenter')
      .where('e."clockIn" >= :from AND e."clockIn" <= :to', { from: `${from} 00:00:00`, to: `${to} 23:59:59` })
      .orderBy('e."clockIn"', 'DESC');
    if (organizationId != null) qb.andWhere('e."organizationId" = :orgId', { orgId: organizationId });
    if (userId != null) qb.andWhere('user.id = :userId', { userId });
    return qb.getMany();
  }

  /** Total hours worked per employee for a period — genuinely open
   * shifts (someone still clocked in right now) are excluded from the
   * total rather than counted using the current moment as an implicit
   * clock-out, since that would make the same report return a
   * different total every time it's refreshed while someone's shift
   * is still running. */
  async getTimesheet(organizationId: number | null, from: string, to: string): Promise<TimesheetRow[]> {
    const entries = await this.getEntries(organizationId, from, to);
    const byUser = new Map<number, TimesheetRow>();
    for (const e of entries) {
      if (!e.clockOut) continue;
      const hours = (e.clockOut.getTime() - e.clockIn.getTime()) / (1000 * 60 * 60);
      const existing = byUser.get(e.user.id) ?? { userId: e.user.id, username: e.user.username, totalHours: 0, shiftCount: 0 };
      existing.totalHours += hours;
      existing.shiftCount += 1;
      byUser.set(e.user.id, existing);
    }
    return Array.from(byUser.values())
      .map((r) => ({ ...r, totalHours: Math.round(r.totalHours * 100) / 100 }))
      .sort((a, b) => b.totalHours - a.totalHours);
  }

  /** Manual correction for a shift someone forgot to clock out of, or
   * mis-timed — admin only (enforced at the controller level via
   * @Roles), never something the employee themselves can silently
   * backdate their own hours through. */
  async adjustEntry(id: number, organizationId: number | null, clockIn?: string, clockOut?: string | null): Promise<TimeClockEntry> {
    const entry = await this.repo.findOne({ where: { id }, relations: ['organization'] });
    if (!entry) throw new NotFoundException('Time clock entry not found');
    if (organizationId != null && entry.organization?.id !== organizationId) throw new NotFoundException('Time clock entry not found');
    if (clockIn) entry.clockIn = new Date(clockIn);
    if (clockOut !== undefined) entry.clockOut = clockOut ? new Date(clockOut) : null;
    if (entry.clockOut && entry.clockOut <= entry.clockIn) {
      throw new BadRequestException('Clock-out must be after clock-in.');
    }
    return this.repo.save(entry);
  }

  async removeEntry(id: number, organizationId: number | null): Promise<void> {
    const entry = await this.repo.findOne({ where: { id }, relations: ['organization'] });
    if (!entry) throw new NotFoundException('Time clock entry not found');
    if (organizationId != null && entry.organization?.id !== organizationId) throw new NotFoundException('Time clock entry not found');
    await this.repo.remove(entry);
  }
}
