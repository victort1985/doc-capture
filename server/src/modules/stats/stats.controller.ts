import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServiceCall } from '../calls/entities/service-call.entity';
import { CallWorkingSession } from '../calls/entities/call-working-session.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type RequestUser = { organizationId: number | null };

@Controller('stats')
@UseGuards(JwtAuthGuard)
export class StatsController {
  constructor(
    @InjectRepository(ServiceCall) private readonly callsRepo: Repository<ServiceCall>,
    @InjectRepository(CallWorkingSession) private readonly sessionsRepo: Repository<CallWorkingSession>,
  ) {}

  @Get('calls')
  async callStats(
    @CurrentUser() user: RequestUser,
    @Query('period') period: 'day' | 'week' | 'month' | 'year' | 'all' = 'month',
  ) {
    const { from, to } = this.periodRange(period);

    // Total counts by status
    const totals = await this.callsRepo.query(`
      SELECT c.status, COUNT(*) as count
      FROM service_calls c
      WHERE c."createdAt" >= $1 AND c."createdAt" <= $2
        ${user.organizationId != null ? 'AND (c."organizationId" = $3 OR c."organizationId" IS NULL)' : ''}
      GROUP BY c.status
    `, user.organizationId != null ? [from, to, user.organizationId] : [from, to]);

    // By user — how many calls each user worked on + total time
    const byUser = await this.sessionsRepo.query(`
      SELECT
        u.username,
        u.id as "userId",
        COUNT(DISTINCT s."callId")            AS calls_worked,
        SUM(EXTRACT(EPOCH FROM (COALESCE(s."endedAt", NOW()) - s."startedAt")))::int AS total_seconds
      FROM call_working_sessions s
      JOIN users u ON u.id = s."userId"
      JOIN service_calls c ON c.id = s."callId"
      WHERE s."startedAt" >= $1 AND s."startedAt" <= $2
        ${user.organizationId != null ? 'AND (c."organizationId" = $3 OR c."organizationId" IS NULL)' : ''}
      GROUP BY u.id, u.username
      ORDER BY total_seconds DESC
    `, user.organizationId != null ? [from, to, user.organizationId] : [from, to]);

    // Calls per day (for the chart)
    const byDay = await this.callsRepo.query(`
      SELECT DATE_TRUNC('day', c."createdAt") AS day, COUNT(*) AS count
      FROM service_calls c
      WHERE c."createdAt" >= $1 AND c."createdAt" <= $2
        ${user.organizationId != null ? 'AND (c."organizationId" = $3 OR c."organizationId" IS NULL)' : ''}
      GROUP BY 1
      ORDER BY 1
    `, user.organizationId != null ? [from, to, user.organizationId] : [from, to]);

    // Average resolution time (open → closed)
    const avgRes = await this.callsRepo.query(`
      SELECT AVG(EXTRACT(EPOCH FROM ("closedAt" - "createdAt")))::int AS avg_seconds
      FROM service_calls
      WHERE status = 'closed'
        AND "createdAt" >= $1 AND "createdAt" <= $2
        ${user.organizationId != null ? 'AND ("organizationId" = $3 OR "organizationId" IS NULL)' : ''}
    `, user.organizationId != null ? [from, to, user.organizationId] : [from, to]);

    return {
      period,
      from,
      to,
      totals: Object.fromEntries((totals as any[]).map((r: any) => [r.status, parseInt(r.count)])),
      byUser: (byUser as any[]).map((r: any) => ({
        userId: r.userId,
        username: r.username,
        callsWorked: parseInt(r.calls_worked),
        totalSeconds: parseInt(r.total_seconds ?? '0'),
      })),
      byDay: (byDay as any[]).map((r: any) => ({
        day: r.day,
        count: parseInt(r.count),
      })),
      avgResolutionSeconds: parseInt(avgRes[0]?.avg_seconds ?? '0') || null,
    };
  }

  private periodRange(period: string): { from: Date; to: Date } {
    const now = new Date();
    const to = new Date(now);
    to.setHours(23, 59, 59, 999);
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    switch (period) {
      case 'day':   break;
      case 'week':  from.setDate(from.getDate() - 6); break;
      case 'month': from.setDate(1); break;
      case 'year':  from.setMonth(0, 1); break;
      case 'all':   from.setFullYear(2000); break;
    }
    return { from, to };
  }
}
