import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServiceCall } from '../calls/entities/service-call.entity';
import { CallWorkingSession } from '../calls/entities/call-working-session.entity';
import { FuelRefuel } from '../fleet/entities/fuel-refuel.entity';
import { Order } from '../orders/entities/order.entity';
import { DeliveryNote } from '../delivery-notes/delivery-note.entity';
import { WarehouseTransaction } from '../warehouse/entities/warehouse-transaction.entity';
import { WarehouseTransfer } from '../warehouse/entities/warehouse-transfer.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type ReqUser = { id: number; organizationId: number | null; role: string; isGlobal: boolean };
type Dimension = 'none' | 'user' | 'location' | 'organization';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(
    @InjectRepository(ServiceCall) private callsRepo: Repository<ServiceCall>,
    @InjectRepository(CallWorkingSession) private sessionsRepo: Repository<CallWorkingSession>,
    @InjectRepository(FuelRefuel) private refuelsRepo: Repository<FuelRefuel>,
    @InjectRepository(Order) private ordersRepo: Repository<Order>,
    @InjectRepository(DeliveryNote) private notesRepo: Repository<DeliveryNote>,
    @InjectRepository(WarehouseTransaction) private whTxRepo: Repository<WarehouseTransaction>,
    @InjectRepository(WarehouseTransfer) private whTransferRepo: Repository<WarehouseTransfer>,
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

  @Get('warehouse')
  async warehouseReport(
    @CurrentUser() user: ReqUser,
    @Query('period') period = 'month',
    @Query('itemId') itemId?: string,
  ) {
    const { from, to } = this.range(period);
    const params: any[] = [from, to];
    const extra = itemId ? `AND t."itemId" = ${parseInt(itemId)}` : '';

    const rows = await this.callsRepo.query(`
      SELECT
        t.id, t.type, t.quantity, t.reason, t."createdAt",
        i.name AS "itemName", i.barcode,
        u.username AS "byUser"
      FROM warehouse_transactions t
      JOIN warehouse_items i ON i.id = t."itemId"
      LEFT JOIN users u ON u.id = t."registeredById"
      WHERE t."createdAt" >= $1 AND t."createdAt" <= $2 ${extra}
      ORDER BY t."createdAt" DESC
      LIMIT 500
    `, params).catch(() => []);

    const summary = await this.callsRepo.query(`
      SELECT
        i.id, i.name, i.barcode,
        SUM(CASE WHEN t.type='in' THEN t.quantity ELSE 0 END)::int AS "totalIn",
        SUM(CASE WHEN t.type='out' THEN t.quantity ELSE 0 END)::int AS "totalOut",
        COUNT(t.id)::int AS "txCount"
      FROM warehouse_transactions t
      JOIN warehouse_items i ON i.id = t."itemId"
      WHERE t."createdAt" >= $1 AND t."createdAt" <= $2 ${extra}
      GROUP BY i.id, i.name, i.barcode
      ORDER BY "txCount" DESC
    `, params).catch(() => []);

    return { period, from, to, rows, summary };
  }

  /**
   * Cross-domain "logistics operations" report. `dimension` selects how
   * to slice every domain: 'none' = one overall summary across
   * everything in range; 'user' | 'location' | 'organization' with no
   * `id` = a breakdown table (one row per entity of that type, ranked
   * by activity); with `id` = that one entity's summary. Not every
   * domain has a location — orders/delivery notes/fleet don't record
   * one (see entity comments), so those come back with
   * `supported: false` when dimension === 'location'.
   */
  @Get('overview')
  async overview(
    @CurrentUser() user: ReqUser,
    @Query('period') period = 'month',
    @Query('dimension') dimension: Dimension = 'none',
    @Query('id') id?: string,
  ) {
    const { from, to } = this.range(period);
    const privileged = user.organizationId == null || user.isGlobal || user.role === 'admin';
    const orgScope = privileged ? null : user.organizationId;
    const dimId = id ? parseInt(id, 10) : undefined;

    const [calls, orders, deliveryNotes, fleet, warehouse] = await Promise.all([
      this.callsOverview(from, to, dimension, dimId, orgScope),
      this.ordersOverview(from, to, dimension, dimId, orgScope),
      this.deliveryNotesOverview(from, to, dimension, dimId, orgScope),
      this.fleetOverview(from, to, dimension, dimId, orgScope),
      this.warehouseOverview(from, to, dimension, dimId, orgScope),
    ]);

    return { period, from, to, dimension, id: dimId ?? null, calls, orders, deliveryNotes, fleet, warehouse };
  }

  private async callsOverview(from: Date, to: Date, dimension: Dimension, dimId: number | undefined, orgScope: number | null) {
    const params: any[] = [from, to];
    const conds = ['c."createdAt" >= $1', 'c."createdAt" <= $2'];
    if (orgScope) { params.push(orgScope); conds.push(`c."organizationId" = $${params.length}`); }
    if (dimId && dimension === 'user') { params.push(dimId); conds.push(`c."createdById" = $${params.length}`); }
    if (dimId && dimension === 'location') { params.push(dimId); conds.push(`c."locationId" = $${params.length}`); }
    if (dimId && dimension === 'organization') { params.push(dimId); conds.push(`c."organizationId" = $${params.length}`); }
    const where = conds.join(' AND ');

    const metrics = `
      COUNT(*)::int AS total,
      COUNT(CASE WHEN c.status = 'open' THEN 1 END)::int AS open,
      COUNT(CASE WHEN c.status = 'in_progress' THEN 1 END)::int AS "inProgress",
      COUNT(CASE WHEN c.status = 'closed' THEN 1 END)::int AS closed,
      COUNT(CASE WHEN c.urgency = 'urgent' THEN 1 END)::int AS urgent,
      ROUND(AVG(CASE WHEN c.status = 'closed' THEN EXTRACT(EPOCH FROM (c."statusChangedAt" - c."createdAt")) / 3600 END)::numeric, 1) AS "avgResolutionHours"
    `;

    const [summary] = await this.callsRepo.query(`SELECT ${metrics} FROM service_calls c WHERE ${where}`, params);

    let breakdown: any[] | null = null;
    if (dimension !== 'none' && !dimId) {
      const { groupCol, join, nameCol } = this.dimJoin(dimension, 'c');
      breakdown = await this.callsRepo.query(`
        SELECT ${groupCol} AS id, ${nameCol} AS name, ${metrics}
        FROM service_calls c ${join}
        WHERE ${where}
        GROUP BY ${groupCol}, ${nameCol}
        ORDER BY total DESC
      `, params);
    }

    return { supported: true, summary, breakdown };
  }

  private async ordersOverview(from: Date, to: Date, dimension: Dimension, dimId: number | undefined, orgScope: number | null) {
    if (dimension === 'location') return { supported: false, summary: null, breakdown: null };

    const params: any[] = [from, to];
    const conds = ['o."createdAt" >= $1', 'o."createdAt" <= $2'];
    if (orgScope) { params.push(orgScope); conds.push(`o."tenantId" = $${params.length}`); }
    if (dimId && dimension === 'user') { params.push(dimId); conds.push(`o."createdById" = $${params.length}`); }
    if (dimId && dimension === 'organization') { params.push(dimId); conds.push(`o."tenantId" = $${params.length}`); }
    const where = conds.join(' AND ');

    const metrics = `
      COUNT(*)::int AS total,
      COUNT(CASE WHEN o."invoiceNumber" IS NOT NULL THEN 1 END)::int AS completed,
      COUNT(CASE WHEN o."invoiceNumber" IS NULL THEN 1 END)::int AS pending,
      ROUND(AVG(CASE WHEN o."invoiceNumber" IS NOT NULL THEN EXTRACT(EPOCH FROM (o."updatedAt" - o."createdAt")) / 3600 END)::numeric, 1) AS "avgCompletionHours"
    `;

    const [summary] = await this.ordersRepo.query(`SELECT ${metrics} FROM orders o WHERE ${where}`, params);

    let breakdown: any[] | null = null;
    if (dimension !== 'none' && !dimId) {
      const groupCol = dimension === 'user' ? 'o."createdById"' : 'o."tenantId"';
      const join = dimension === 'user' ? 'JOIN users d ON d.id = o."createdById"' : 'JOIN organizations d ON d.id = o."tenantId"';
      const nameCol = dimension === 'user' ? 'd.username' : 'd.name';
      breakdown = await this.ordersRepo.query(`
        SELECT ${groupCol} AS id, ${nameCol} AS name, ${metrics}
        FROM orders o ${join}
        WHERE ${where}
        GROUP BY ${groupCol}, ${nameCol}
        ORDER BY total DESC
      `, params);
    }

    return { supported: true, summary, breakdown };
  }

  private async deliveryNotesOverview(from: Date, to: Date, dimension: Dimension, dimId: number | undefined, orgScope: number | null) {
    if (dimension === 'location') return { supported: false, summary: null, breakdown: null };

    const params: any[] = [from, to];
    const conds = ['n."createdAt" >= $1', 'n."createdAt" <= $2'];
    if (orgScope) { params.push(orgScope); conds.push(`n."organizationId" = $${params.length}`); }
    if (dimId && dimension === 'user') { params.push(dimId); conds.push(`n."createdById" = $${params.length}`); }
    if (dimId && dimension === 'organization') { params.push(dimId); conds.push(`n."organizationId" = $${params.length}`); }
    const where = conds.join(' AND ');

    const metrics = `
      COUNT(*)::int AS total,
      COUNT(CASE WHEN n.status = 'signed' THEN 1 END)::int AS signed,
      COUNT(CASE WHEN n.status = 'draft' THEN 1 END)::int AS draft,
      COUNT(CASE WHEN n.status = 'cancelled' THEN 1 END)::int AS cancelled
    `;

    const [summary] = await this.notesRepo.query(`SELECT ${metrics} FROM delivery_notes n WHERE ${where}`, params);

    let breakdown: any[] | null = null;
    if (dimension !== 'none' && !dimId) {
      const groupCol = dimension === 'user' ? 'n."createdById"' : 'n."organizationId"';
      const join = dimension === 'user' ? 'JOIN users d ON d.id = n."createdById"' : 'JOIN organizations d ON d.id = n."organizationId"';
      const nameCol = dimension === 'user' ? 'd.username' : 'd.name';
      breakdown = await this.notesRepo.query(`
        SELECT ${groupCol} AS id, ${nameCol} AS name, ${metrics}
        FROM delivery_notes n ${join}
        WHERE ${where}
        GROUP BY ${groupCol}, ${nameCol}
        ORDER BY total DESC
      `, params);
    }

    return { supported: true, summary, breakdown };
  }

  private async fleetOverview(from: Date, to: Date, dimension: Dimension, dimId: number | undefined, orgScope: number | null) {
    if (dimension === 'location') return { supported: false, summary: null, breakdown: null };

    const params: any[] = [from, to];
    const conds = ['r.date >= $1', 'r.date <= $2'];
    if (orgScope) { params.push(orgScope); conds.push(`v."organizationId" = $${params.length}`); }
    if (dimId && dimension === 'user') { params.push(dimId); conds.push(`r."registeredById" = $${params.length}`); }
    if (dimId && dimension === 'organization') { params.push(dimId); conds.push(`v."organizationId" = $${params.length}`); }
    const where = conds.join(' AND ');

    const metrics = `
      COUNT(r.id)::int AS "refuelCount",
      SUM(r.liters)::numeric(10,1) AS "totalLiters",
      SUM(r.cost)::numeric(10,2) AS "totalCost"
    `;

    const [summary] = await this.refuelsRepo.query(`
      SELECT ${metrics} FROM fuel_refuels r JOIN vehicles v ON v.id = r."vehicleId" WHERE ${where}
    `, params);

    let breakdown: any[] | null = null;
    if (dimension !== 'none' && !dimId) {
      const groupCol = dimension === 'user' ? 'r."registeredById"' : 'v."organizationId"';
      const join = dimension === 'user' ? 'JOIN users d ON d.id = r."registeredById"' : 'JOIN organizations d ON d.id = v."organizationId"';
      const nameCol = dimension === 'user' ? 'd.username' : 'd.name';
      breakdown = await this.refuelsRepo.query(`
        SELECT ${groupCol} AS id, ${nameCol} AS name, ${metrics}
        FROM fuel_refuels r JOIN vehicles v ON v.id = r."vehicleId" ${join}
        WHERE ${where}
        GROUP BY ${groupCol}, ${nameCol}
        ORDER BY "totalCost" DESC
      `, params);
    }

    return { supported: true, summary, breakdown };
  }

  /** Warehouse movements (in/out transactions) + cross-location transfers combined. */
  private async warehouseOverview(from: Date, to: Date, dimension: Dimension, dimId: number | undefined, orgScope: number | null) {
    const txParams: any[] = [from, to];
    const txConds = ['t."createdAt" >= $1', 't."createdAt" <= $2'];
    if (orgScope) { txParams.push(orgScope); txConds.push(`i."organizationId" = $${txParams.length}`); }
    if (dimId && dimension === 'user') { txParams.push(dimId); txConds.push(`t."registeredById" = $${txParams.length}`); }
    if (dimId && dimension === 'location') { txParams.push(dimId); txConds.push(`i."locationId" = $${txParams.length}`); }
    if (dimId && dimension === 'organization') { txParams.push(dimId); txConds.push(`i."organizationId" = $${txParams.length}`); }
    const txWhere = txConds.join(' AND ');

    const txMetrics = `
      COUNT(t.id)::int AS "txCount",
      SUM(CASE WHEN t.type = 'in' THEN t.quantity ELSE 0 END)::int AS "totalIn",
      SUM(CASE WHEN t.type = 'out' THEN t.quantity ELSE 0 END)::int AS "totalOut"
    `;

    const [txSummary] = await this.whTxRepo.query(`
      SELECT ${txMetrics} FROM warehouse_transactions t JOIN warehouse_items i ON i.id = t."itemId" WHERE ${txWhere}
    `, txParams);

    // Transfers: location dimension matches either endpoint; user/org join directly.
    const trParams: any[] = [from, to];
    const trConds = ['x."createdAt" >= $1', 'x."createdAt" <= $2'];
    if (orgScope) { trParams.push(orgScope); trConds.push(`x."organizationId" = $${trParams.length}`); }
    if (dimId && dimension === 'user') { trParams.push(dimId); trConds.push(`x."createdById" = $${trParams.length}`); }
    if (dimId && dimension === 'location') { trParams.push(dimId); trConds.push(`(x."fromLocationId" = $${trParams.length} OR x."toLocationId" = $${trParams.length})`); }
    if (dimId && dimension === 'organization') { trParams.push(dimId); trConds.push(`x."organizationId" = $${trParams.length}`); }
    const trWhere = trConds.join(' AND ');

    const [{ transferCount }] = await this.whTransferRepo.query(`
      SELECT COUNT(*)::int AS "transferCount" FROM warehouse_transfers x WHERE ${trWhere}
    `, trParams);

    const summary = { ...txSummary, transferCount };

    let breakdown: any[] | null = null;
    if (dimension !== 'none' && !dimId) {
      if (dimension === 'user') {
        breakdown = await this.whTxRepo.query(`
          SELECT t."registeredById" AS id, d.username AS name, ${txMetrics}
          FROM warehouse_transactions t
          JOIN warehouse_items i ON i.id = t."itemId"
          JOIN users d ON d.id = t."registeredById"
          WHERE ${txWhere}
          GROUP BY t."registeredById", d.username
          ORDER BY "txCount" DESC
        `, txParams);
      } else if (dimension === 'location') {
        breakdown = await this.whTxRepo.query(`
          SELECT i."locationId" AS id, d.name AS name, ${txMetrics}
          FROM warehouse_transactions t
          JOIN warehouse_items i ON i.id = t."itemId"
          JOIN locations d ON d.id = i."locationId"
          WHERE ${txWhere}
          GROUP BY i."locationId", d.name
          ORDER BY "txCount" DESC
        `, txParams);
      } else {
        breakdown = await this.whTxRepo.query(`
          SELECT i."organizationId" AS id, d.name AS name, ${txMetrics}
          FROM warehouse_transactions t
          JOIN warehouse_items i ON i.id = t."itemId"
          JOIN organizations d ON d.id = i."organizationId"
          WHERE ${txWhere}
          GROUP BY i."organizationId", d.name
          ORDER BY "txCount" DESC
        `, txParams);
      }
    }

    return { supported: true, summary, breakdown };
  }

  /** Shared GROUP BY/JOIN builder for the simple case (calls) where the
   * dimension column lives directly on the fact table. */
  private dimJoin(dimension: Dimension, alias: string): { groupCol: string; join: string; nameCol: string } {
    if (dimension === 'user') {
      return { groupCol: `${alias}."createdById"`, join: `JOIN users d ON d.id = ${alias}."createdById"`, nameCol: 'd.username' };
    }
    if (dimension === 'location') {
      return { groupCol: `${alias}."locationId"`, join: `JOIN locations d ON d.id = ${alias}."locationId"`, nameCol: 'd.name' };
    }
    return { groupCol: `${alias}."organizationId"`, join: `JOIN organizations d ON d.id = ${alias}."organizationId"`, nameCol: 'd.name' };
  }
}
