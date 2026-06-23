import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServiceCall } from '../calls/entities/service-call.entity';
import { CallWorkingSession } from '../calls/entities/call-working-session.entity';
import { FuelRefuel } from '../fleet/entities/fuel-refuel.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type ReqUser = { id: number; organizationId: number | null; role: string; isGlobal: boolean };

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(
    @InjectRepository(ServiceCall) private callsRepo: Repository<ServiceCall>,
    @InjectRepository(CallWorkingSession) private sessionsRepo: Repository<CallWorkingSession>,
    @InjectRepository(FuelRefuel) private refuelsRepo: Repository<FuelRefuel>,
  ) {}

  private range(period: string): { from: Date; to: Date } {
    const to = new Date(); to.setHours(23, 59, 59, 999);
    const from = new Date(); from.setHours(0, 0, 0, 0);
    switch (period) {
      case 'day': break;
      case 'week': from.setDate(from.getDate() - 6); break;
      case 'month': from.setDate(1); break;
      case 'year': from.setMonth(0, 1); break;
      case 'all': from.setFullYear(2000); break;
    }
    return { from, to };
  }

  @Get('work')
  async workReport(
    @CurrentUser() user: ReqUser,
    @Query('period') period = 'month',
    @Query('userId') userId?: string,
  ) {
    const { from, to } = this.range(period);
    const privileged = user.organizationId == null || user.isGlobal || user.role === 'admin';
    const orgCond = privileged ? '' : 'AND (c."organizationId" = $3 OR c."organizationId" IS NULL)';
    const params: any[] = [from, to];
    if (!privileged) params.push(user.organizationId);

    const byUser = await this.sessionsRepo.query(`
      SELECT
        u.id AS "userId", u.username,
        COUNT(DISTINCT s."callId")::int AS "callsWorked",
        SUM(EXTRACT(EPOCH FROM (COALESCE(s."endedAt", NOW()) - s."startedAt")))::int AS "totalSeconds",
        COUNT(CASE WHEN c.status = 'closed' THEN 1 END)::int AS "callsClosed"
      FROM call_working_sessions s
      JOIN users u ON u.id = s."userId"
      JOIN service_calls c ON c.id = s."callId"
      WHERE s."startedAt" >= $1 AND s."startedAt" <= $2
        ${userId ? `AND u.id = ${parseInt(userId)}` : ''}
        ${orgCond}
      GROUP BY u.id, u.username
      ORDER BY "totalSeconds" DESC
    `, params);

    const byDay = await this.callsRepo.query(`
      SELECT DATE_TRUNC('day', c."createdAt") AS day, COUNT(*)::int AS count
      FROM service_calls c
      WHERE c."createdAt" >= $1 AND c."createdAt" <= $2 ${orgCond}
      GROUP BY 1 ORDER BY 1
    `, params);

    const totals = await this.callsRepo.query(`
      SELECT c.status, COUNT(*)::int AS count
      FROM service_calls c
      WHERE c."createdAt" >= $1 AND c."createdAt" <= $2 ${orgCond}
      GROUP BY c.status
    `, params);

    return {
      period, from, to,
      totals: Object.fromEntries(totals.map((r: any) => [r.status, r.count])),
      byUser,
      byDay,
    };
  }

  @Get('fuel')
  async fuelReport(
    @CurrentUser() user: ReqUser,
    @Query('period') period = 'month',
    @Query('vehicleId') vehicleId?: string,
    @Query('userId') userId?: string,
  ) {
    const { from, to } = this.range(period);
    const params: any[] = [from, to];
    const conditions: string[] = ['r.date >= $1', 'r.date <= $2'];
    if (vehicleId) conditions.push(`v.id = ${parseInt(vehicleId)}`);
    if (userId) conditions.push(`r."registeredById" = ${parseInt(userId)}`);
    const where = conditions.join(' AND ');

    const rows = await this.refuelsRepo.query(`
      SELECT
        r.id, r.date, r.liters, r.cost, r.odometer, r.station,
        v.id AS "vehicleId", v.make, v.model, v."licensePlate",
        u.username AS "registeredBy"
      FROM fuel_refuels r
      JOIN vehicles v ON v.id = r."vehicleId"
      LEFT JOIN users u ON u.id = r."registeredById"
      WHERE ${where}
      ORDER BY r.date DESC
    `, params);

    const summary = await this.refuelsRepo.query(`
      SELECT
        v.id AS "vehicleId", v.make, v.model, v."licensePlate",
        COUNT(r.id)::int AS "refuelCount",
        SUM(r.liters)::numeric AS "totalLiters",
        SUM(r.cost)::numeric AS "totalCost"
      FROM fuel_refuels r
      JOIN vehicles v ON v.id = r."vehicleId"
      WHERE ${where}
      GROUP BY v.id, v.make, v.model, v."licensePlate"
      ORDER BY "totalLiters" DESC
    `, params);

    return { period, from, to, rows, summary };
  }
}
