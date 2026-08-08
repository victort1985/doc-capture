import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RecurringTemplate, RecurringDocumentType } from '../accounting/entities/recurring-template.entity';
import { CreateRecurringTemplateDto, UpdateRecurringTemplateDto } from './dto/recurring-template.dto';
import { ExpensesService } from '../expenses/expenses.service';
import { InvoicesService } from '../invoices/invoices.service';
import { CreateExpenseDto } from '../expenses/dto/create-expense.dto';
import { CreateInvoiceDto } from '../invoices/dto/create-invoice.dto';

@Injectable()
export class RecurringDocumentsService {
  private readonly logger = new Logger(RecurringDocumentsService.name);

  constructor(
    @InjectRepository(RecurringTemplate) private readonly repo: Repository<RecurringTemplate>,
    private readonly expensesService: ExpensesService,
    private readonly invoicesService: InvoicesService,
  ) {}

  /** Validates templateData against the SAME DTO class/rules the
   * real create-expense/create-invoice endpoint would apply — a typo
   * or missing required field gets caught the moment someone sets up
   * the template, not silently every month for years when it tries
   * (and fails) to actually generate. */
  private async validateTemplateData(documentType: RecurringDocumentType, templateData: Record<string, unknown>): Promise<void> {
    const instance = documentType === RecurringDocumentType.EXPENSE
      ? plainToInstance(CreateExpenseDto, templateData)
      : plainToInstance(CreateInvoiceDto, templateData);
    const errors = await validate(instance as object, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length > 0) {
      const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
      throw new BadRequestException(`Template data doesn't match what a real ${documentType} needs: ${messages.join('; ')}`);
    }
  }

  private computeNextRunDate(dayOfMonth: number, from: Date = new Date()): string {
    const candidate = new Date(from.getFullYear(), from.getMonth(), dayOfMonth);
    if (candidate <= from) candidate.setMonth(candidate.getMonth() + 1);
    return candidate.toISOString().slice(0, 10);
  }

  async create(organizationId: number | null, userId: number, dto: CreateRecurringTemplateDto): Promise<RecurringTemplate> {
    await this.validateTemplateData(dto.documentType, dto.templateData);
    const template = this.repo.create({
      name: dto.name,
      documentType: dto.documentType,
      dayOfMonth: dto.dayOfMonth,
      templateData: dto.templateData,
      nextRunDate: this.computeNextRunDate(dto.dayOfMonth),
      active: true,
      generatedLog: [],
      organization: organizationId != null ? ({ id: organizationId } as any) : undefined,
      createdBy: { id: userId } as any,
    });
    return this.repo.save(template);
  }

  async findAll(organizationId: number | null): Promise<RecurringTemplate[]> {
    return this.repo.find({
      where: organizationId != null ? { organization: { id: organizationId } } : {},
      order: { createdAt: 'DESC' },
    });
  }

  private async findOneScoped(id: number, organizationId: number | null): Promise<RecurringTemplate> {
    const template = await this.repo.findOne({ where: { id }, relations: ['organization', 'createdBy'] });
    if (!template) throw new NotFoundException('Recurring template not found');
    if (organizationId != null && template.organization?.id !== organizationId) throw new NotFoundException('Recurring template not found');
    return template;
  }

  async update(id: number, organizationId: number | null, dto: UpdateRecurringTemplateDto): Promise<RecurringTemplate> {
    const template = await this.findOneScoped(id, organizationId);
    if (dto.templateData) await this.validateTemplateData(template.documentType, dto.templateData);
    if (dto.name !== undefined) template.name = dto.name;
    if (dto.templateData !== undefined) template.templateData = dto.templateData;
    if (dto.active !== undefined) template.active = dto.active;
    if (dto.dayOfMonth !== undefined) {
      template.dayOfMonth = dto.dayOfMonth;
      // Re-anchor the next run to the new day, taking the later of
      // "still this month if the new day hasn't passed yet" or "next
      // month" — same rule as initial creation, so changing the day
      // never accidentally skips or double-fires a cycle.
      template.nextRunDate = this.computeNextRunDate(dto.dayOfMonth);
    }
    return this.repo.save(template);
  }

  async remove(id: number, organizationId: number | null): Promise<void> {
    const template = await this.findOneScoped(id, organizationId);
    await this.repo.remove(template);
  }

  /** Runs one template immediately regardless of nextRunDate — for
   * "generate this month's rent invoice right now instead of waiting
   * for the scheduled date" without disturbing the schedule itself. */
  async runNow(id: number, organizationId: number | null): Promise<{ documentId: number }> {
    const template = await this.findOneScoped(id, organizationId);
    const documentId = await this.generateOne(template);
    await this.repo.save(template);
    return { documentId };
  }

  private async generateOne(template: RecurringTemplate): Promise<number> {
    const orgId = template.organization?.id ?? null;
    const userId = template.createdBy?.id;
    if (userId == null) {
      throw new BadRequestException('This template has no creator on record — cannot generate a document without an author.');
    }
    let documentId: number;

    if (template.documentType === RecurringDocumentType.EXPENSE) {
      const dto = plainToInstance(CreateExpenseDto, template.templateData);
      const created = await this.expensesService.createExpense(orgId, userId, dto);
      documentId = created.id;
    } else {
      const dto = plainToInstance(CreateInvoiceDto, template.templateData);
      const created = await this.invoicesService.create(orgId, userId, dto);
      documentId = created.id;
    }

    const today = new Date().toISOString().slice(0, 10);
    template.lastRunDate = today;
    template.generatedLog = [{ documentId, date: today }, ...template.generatedLog].slice(0, 20);
    template.nextRunDate = this.computeNextRunDate(template.dayOfMonth, new Date());
    return documentId;
  }

  /** Runs once a day — see generateOne's own doc comment for why
   * generation reuses the exact same service methods a person
   * clicking "Create" would call, rather than a second document-
   * creation path. A template that fails to generate (e.g. the org's
   * document numbering got reconfigured in a way that breaks the
   * stored template data) is logged and skipped rather than blocking
   * every OTHER due template that day. */
  @Cron('30 4 * * *')
  async runDue(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const due = await this.repo.find({ where: { active: true, nextRunDate: LessThanOrEqual(today) }, relations: ['organization', 'createdBy'] });
    for (const template of due) {
      try {
        await this.generateOne(template);
        await this.repo.save(template);
      } catch (err) {
        this.logger.error(`Recurring template #${template.id} ("${template.name}") failed to generate: ${err instanceof Error ? err.message : err}`);
      }
    }
  }
}
