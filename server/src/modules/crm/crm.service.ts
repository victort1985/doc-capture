import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Deal, DealStage } from './entities/deal.entity';
import { DealInteraction, InteractionType } from './entities/deal-interaction.entity';
import { CreateDealDto, UpdateDealDto } from './dto/crm.dto';

const DEAL_RELATIONS = ['createdBy', 'assignedTo', 'organization'];

@Injectable()
export class CrmService {
  constructor(
    @InjectRepository(Deal) private readonly dealsRepo: Repository<Deal>,
    @InjectRepository(DealInteraction) private readonly interactionsRepo: Repository<DealInteraction>,
  ) {}

  /** Same merged-view reasoning as CallsService.findAll (this
   * module's own architectural reference) — a user linked to multiple
   * organizations sees every one of those organizations' deals
   * together, not filtered down to whichever one is currently active
   * for document creation. */
  findAll(requester?: { organizationId: number | null; allowedOrganizationIds?: number[] }): Promise<Deal[]> {
    const orgIds =
      requester?.organizationId != null
        ? [requester.organizationId, ...(requester.allowedOrganizationIds ?? [])]
        : null;
    return this.dealsRepo.find({
      relations: DEAL_RELATIONS,
      where: orgIds != null ? [{ organization: { id: In(orgIds) } }, { organization: IsNull() }] : {},
      order: { updatedAt: 'DESC' },
    });
  }

  async findOne(id: number, requester?: { organizationId: number | null; allowedOrganizationIds?: number[] }): Promise<Deal> {
    const deal = await this.dealsRepo.findOne({ where: { id }, relations: DEAL_RELATIONS });
    if (!deal) throw new NotFoundException('Deal not found');
    this.assertAccessible(deal, requester);
    return deal;
  }

  /** Same fetch-with-relations-then-compare pattern used throughout
   * this codebase for cross-org isolation (see the earlier security
   * audit this whole app went through) — never trust a bare id
   * without checking who it actually belongs to first. A deal with no
   * organization at all (shouldn't normally happen, but matches
   * ServiceCall's own "treat as shared" fallback) is accessible to
   * everyone. */
  private assertAccessible(deal: Deal, requester?: { organizationId: number | null; allowedOrganizationIds?: number[] }): void {
    if (requester?.organizationId == null) return; // super-admin, or no requester context passed at all
    if (deal.organization == null) return;
    const allowed = [requester.organizationId, ...(requester.allowedOrganizationIds ?? [])];
    if (!allowed.includes(deal.organization.id)) throw new NotFoundException('Deal not found');
  }

  async create(organizationId: number | null, userId: number, dto: CreateDealDto): Promise<Deal> {
    const deal = this.dealsRepo.create({
      clientName: dto.clientName,
      clientPhone: dto.clientPhone,
      clientEmail: dto.clientEmail,
      stage: dto.stage ?? DealStage.LEAD,
      estimatedValue: dto.estimatedValue,
      description: dto.description,
      assignedTo: dto.assignedToId ? ({ id: dto.assignedToId } as any) : ({ id: userId } as any),
      createdBy: { id: userId } as any,
      organization: organizationId != null ? ({ id: organizationId } as any) : undefined,
    });
    const saved = await this.dealsRepo.save(deal);
    return this.findOne(saved.id);
  }

  async update(id: number, requester: { organizationId: number | null; allowedOrganizationIds?: number[] }, dto: UpdateDealDto): Promise<Deal> {
    const deal = await this.findOne(id, requester);
    if (dto.clientName !== undefined) deal.clientName = dto.clientName;
    if (dto.clientPhone !== undefined) deal.clientPhone = dto.clientPhone;
    if (dto.clientEmail !== undefined) deal.clientEmail = dto.clientEmail;
    if (dto.stage !== undefined) deal.stage = dto.stage;
    if (dto.estimatedValue !== undefined) deal.estimatedValue = dto.estimatedValue;
    if (dto.description !== undefined) deal.description = dto.description;
    if (dto.assignedToId !== undefined) deal.assignedTo = { id: dto.assignedToId } as any;
    await this.dealsRepo.save(deal);
    return this.findOne(id, requester);
  }

  /** Deliberately no delete — matches the rest of this app's own
   * document-retention stance (see the earlier fix blocking deletion
   * on Invoices/Payments/Delivery Notes/Orders/Quotes for Israeli
   * bookkeeping-law reasons). A CRM deal isn't a bookkeeping document,
   * but "lost" already exists as a stage precisely so a deal that
   * didn't work out gets recorded as such rather than erased —
   * losing the history of why a prospect didn't convert is losing
   * genuinely useful information, not tidying up. */
  async markStage(id: number, requester: { organizationId: number | null; allowedOrganizationIds?: number[] }, stage: DealStage): Promise<Deal> {
    return this.update(id, requester, { stage });
  }

  async addInteraction(dealId: number, requester: { organizationId: number | null; allowedOrganizationIds?: number[] }, userId: number, type: InteractionType, text: string): Promise<DealInteraction> {
    const deal = await this.findOne(dealId, requester); // throws if not accessible
    const interaction = this.interactionsRepo.create({ deal, author: { id: userId } as any, type, text });
    const saved = await this.interactionsRepo.save(interaction);
    return this.interactionsRepo.findOne({ where: { id: saved.id }, relations: ['author'] }) as Promise<DealInteraction>;
  }

  async getInteractions(dealId: number, requester: { organizationId: number | null; allowedOrganizationIds?: number[] }): Promise<DealInteraction[]> {
    await this.findOne(dealId, requester); // throws if not accessible
    return this.interactionsRepo.find({ where: { deal: { id: dealId } }, relations: ['author'], order: { createdAt: 'DESC' } });
  }

  /** Simple pipeline summary — deal count and total estimated value
   * per stage, for a Kanban-style overview without a separate report
   * endpoint to keep in sync. */
  async pipelineSummary(requester?: { organizationId: number | null; allowedOrganizationIds?: number[] }): Promise<{ stage: DealStage; count: number; totalValue: number }[]> {
    const deals = await this.findAll(requester);
    const byStage = new Map<DealStage, { count: number; totalValue: number }>();
    for (const stage of Object.values(DealStage)) byStage.set(stage, { count: 0, totalValue: 0 });
    for (const deal of deals) {
      const entry = byStage.get(deal.stage)!;
      entry.count += 1;
      entry.totalValue += Number(deal.estimatedValue ?? 0);
    }
    return Array.from(byStage.entries()).map(([stage, v]) => ({ stage, count: v.count, totalValue: Math.round(v.totalValue * 100) / 100 }));
  }
}
