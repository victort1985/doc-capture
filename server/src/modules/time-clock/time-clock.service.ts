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

  /** Backfills a whole shift at once (start AND end already known) —
   * for an admin (or anyone granted payroll.manageTimeClockEntries)
   * entering a shift that was never clocked through the app at all,
   * rather than correcting an existing one. `date`/`startTime`/
   * `endTime` come from the admin panel's own wheel-style date/time
   * pickers as separate plain strings ("2026-08-14", "16:30") rather
   * than two full ISO timestamps, specifically so this method can
   * apply the overnight-shift rule itself rather than trusting the
   * client to have already worked out which calendar day the end
   * time belongs to.
   *
   * Overnight rule: if the end time-of-day is NOT after the start
   * time-of-day (e.g. start 16:30, end 00:58 — 00:58 is numerically
   * earlier than 16:30), the shift is treated as crossing midnight —
   * the end timestamp lands on the day AFTER `date`, not on `date`
   * itself. A shift that starts and ends within the same calendar day
   * (end time-of-day strictly after start time-of-day) stays on
   * `date` for both ends, matching ordinary same-day shifts entered
   * through this same form. */
  async createManualEntry(
    userId: number,
    organizationId: number | null,
    date: string,
    startTime: string,
    endTime: string,
    costCenterId?: number,
  ): Promise<TimeClockEntry> {
    const [year, month, day] = date.split('-').map(Number);
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    if ([year, month, day, startHour, startMinute, endHour, endMinute].some((n) => Number.isNaN(n))) {
      throw new BadRequestException('Invalid date/time.');
    }

    const clockIn = new Date(year, month - 1, day, startHour, startMinute, 0, 0);
    const endTimeOfDayMinutes = endHour * 60 + endMinute;
    const startTimeOfDayMinutes = startHour * 60 + startMinute;
    const crossesMidnight = endTimeOfDayMinutes <= startTimeOfDayMinutes;
    const clockOut = new Date(year, month - 1, day + (crossesMidnight ? 1 : 0), endHour, endMinute, 0, 0);

    if (clockOut <= clockIn) {
      // Only reachable if start and end are the exact same time-of-day
      // (0-length shift) even after applying the overnight rule —
      // every other case is handled by crossesMidnight above.
      throw new BadRequestException('End time must be after start time.');
    }

    const entry = this.repo.create({
      user: { id: userId } as any,
      clockIn,
      clockOut,
      costCenter: costCenterId ? ({ id: costCenterId } as any) : undefined,
      organization: organizationId != null ? ({ id: organizationId } as any) : undefined,
    });
    return this.repo.save(entry);
  }

  async removeEntry(id: number, organizationId: number | null): Promise<void> {
    const entry = await this.repo.findOne({ where: { id }, relations: ['organization'] });
    if (!entry) throw new NotFoundException('Time clock entry not found');
    if (organizationId != null && entry.organization?.id !== organizationId) throw new NotFoundException('Time clock entry not found');
    await this.repo.remove(entry);
  }
}
