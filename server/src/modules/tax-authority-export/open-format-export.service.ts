import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Invoice } from '../invoices/entities/invoice.entity';
import { LedgerEntry } from '../accounting/entities/ledger-entry.entity';
import { Account } from '../accounting/entities/account.entity';
import { WarehouseItem } from '../warehouse/entities/warehouse-item.entity';
import { WarehouseTransaction, TransactionType } from '../warehouse/entities/warehouse-transaction.entity';
import { TaxAuthoritySettings } from '../invoice-israel/entities/tax-authority-settings.entity';
import { Organization } from '../organizations/entities/organization.entity';
import {
  buildIniHeaderRecord, buildIniSummaryRecord, buildOpeningRecord, buildClosingRecord,
} from './structural-records';
import { mapInvoiceToRecords, mapLedgerEntryToRecords, mapAccountToRecord, mapWarehouseItemToRecord } from './entity-mapping';
import { packageExport, type PackagedExport } from './packaging.service';

export interface GenerateExportOptions {
  organizationId: number;
  from: Date;
  to: Date;
}

/** A 15-digit random identifier — must be identical across every
 * record that carries it (header, opening, closing — spec
 * clarification 2) and unique to this one export. */
function generatePrimaryId(): string {
  const raw = BigInt('0x' + randomBytes(7).toString('hex')).toString();
  return raw.padStart(15, '0').slice(0, 15);
}

@Injectable()
export class OpenFormatExportService {
  constructor(
    @InjectRepository(Invoice) private readonly invoicesRepo: Repository<Invoice>,
    @InjectRepository(LedgerEntry) private readonly ledgerRepo: Repository<LedgerEntry>,
    @InjectRepository(Account) private readonly accountsRepo: Repository<Account>,
    @InjectRepository(WarehouseItem) private readonly itemsRepo: Repository<WarehouseItem>,
    @InjectRepository(WarehouseTransaction) private readonly txRepo: Repository<WarehouseTransaction>,
    @InjectRepository(TaxAuthoritySettings) private readonly settingsRepo: Repository<TaxAuthoritySettings>,
    @InjectRepository(Organization) private readonly orgsRepo: Repository<Organization>,
  ) {}

  async generate(options: GenerateExportOptions): Promise<PackagedExport> {
    const settings = await this.settingsRepo.findOne({ where: { organization: { id: options.organizationId } } });
    if (!settings?.vatNumber) {
      throw new NotFoundException(
        'No VAT number configured — set one under the Invoice Israel integration settings first (this export reuses the same business VAT number).',
      );
    }
    const vatId = settings.vatNumber;
    const org = await this.orgsRepo.findOne({ where: { id: options.organizationId } });
    if (!org) throw new NotFoundException('Organization not found');

    const primaryId = generatePrimaryId();
    const processStart = new Date();

    let recordNumber = 1; // the opening record (100A) claims #1
    const dataRecords: string[] = [];
    const typeCounts: Record<string, number> = {};
    const bump = (code: string) => { typeCounts[code] = (typeCounts[code] ?? 0) + 1; };

    const invoices = await this.invoicesRepo
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.organization', 'organization')
      .where('organization.id = :orgId', { orgId: options.organizationId })
      .andWhere('invoice.createdAt >= :from AND invoice.createdAt <= :to', { from: options.from, to: options.to })
      .getMany();
    for (const invoice of invoices) {
      recordNumber++;
      const headerRecordNumber = recordNumber;
      const lineStart = recordNumber + 1;
      recordNumber += invoice.items.length;
      const { header, lines } = mapInvoiceToRecords(invoice, vatId, headerRecordNumber, lineStart);
      dataRecords.push(header);
      bump('100C');
      for (const line of lines) { dataRecords.push(line); bump('110D'); }
    }

    const ledgerEntries = await this.ledgerRepo
      .createQueryBuilder('entry')
      .leftJoinAndSelect('entry.debitAccount', 'debitAccount')
      .leftJoinAndSelect('entry.creditAccount', 'creditAccount')
      .leftJoinAndSelect('entry.organization', 'organization')
      .where('organization.id = :orgId', { orgId: options.organizationId })
      .andWhere('entry.date >= :from AND entry.date <= :to', { from: options.from, to: options.to })
      .getMany();
    for (const entry of ledgerEntries) {
      const legs = mapLedgerEntryToRecords(entry, vatId, recordNumber + 1);
      recordNumber += legs.length;
      for (const leg of legs) { dataRecords.push(leg); bump('100B'); }
    }

    const accountIds = new Set<number>();
    for (const entry of ledgerEntries) { accountIds.add(entry.debitAccount.id); accountIds.add(entry.creditAccount.id); }
    if (accountIds.size > 0) {
      const accounts = await this.accountsRepo.findByIds(Array.from(accountIds));
      for (const account of accounts) {
        const totalDebit = ledgerEntries.filter((e) => e.debitAccount.id === account.id).reduce((s, e) => s + e.amount, 0);
        const totalCredit = ledgerEntries.filter((e) => e.creditAccount.id === account.id).reduce((s, e) => s + e.amount, 0);
        recordNumber++;
        dataRecords.push(mapAccountToRecord(account, vatId, recordNumber, 0, totalDebit, totalCredit));
        bump('110B');
      }
    }

    const items = await this.itemsRepo.find({ where: { organization: { id: options.organizationId } } });
    for (const item of items) {
      const txs = await this.txRepo.find({ where: { item: { id: item.id } }, relations: ['item'] });
      const inRange = txs.filter((t) => t.createdAt >= options.from && t.createdAt <= options.to);
      const entriesInRange = inRange.filter((t) => t.type === TransactionType.IN).reduce((s, t) => s + t.quantity, 0);
      const exitsInRange = inRange.filter((t) => t.type === TransactionType.OUT).reduce((s, t) => s + t.quantity, 0);
      const openingBalance = Math.max(0, item.quantity - entriesInRange + exitsInRange);
      recordNumber++;
      dataRecords.push(mapWarehouseItemToRecord(item, vatId, recordNumber, openingBalance, entriesInRange, exitsInRange));
      bump('100M');
    }

    const totalRecords = 2 + dataRecords.length; // +2 for the opening/closing records themselves
    const opening = buildOpeningRecord(1, vatId, primaryId);
    const closing = buildClosingRecord(totalRecords, vatId, primaryId, totalRecords);
    const bkmvdataContent = opening + dataRecords.join('') + closing;

    const iniSummaries = Object.entries(typeCounts).map(([code, count]) => buildIniSummaryRecord(code, count));
    const iniHeader = buildIniHeaderRecord(
      { vatId, businessName: org.name, hasBranches: false },
      {
        registrationNumber: settings.softwareRegistrationNumber ?? '',
        name: 'Vixor ERP',
        edition: '1.0',
        vendorVatId: vatId, // Vixor doesn't yet have its own separate vendor-VAT setting distinct from the org's own — see follow-up note
        vendorName: 'Victor Tykhonov',
      },
      { from: options.from, to: options.to },
      totalRecords,
      primaryId,
      processStart,
    );
    const iniContent = iniHeader + iniSummaries.join('');

    return packageExport(iniContent, bkmvdataContent, vatId, processStart);
  }
}
