import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * One bank branch (סניף). Unlike ISRAELI_BANKS (a small, ~20-entry
 * list reliable enough to compile by hand from cross-referenced
 * sources), the full branch registry is roughly 1,400 rows — far too
 * large to safely hand-transcribe from web search results without a
 * real risk of introducing typos into financial routing data.
 * Populated instead via CSV import (BankBranchesService.importCsv) —
 * Bank of Israel and several accounting-focused sites publish this
 * as a downloadable spreadsheet; see the Bank Data settings page for
 * where to get one.
 */
@Entity('bank_branches')
@Unique(['bankCode', 'branchNumber'])
export class BankBranch {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  bankCode: string; // matches ISRAELI_BANKS[].code

  @Column()
  branchNumber: string;

  @Column({ nullable: true })
  branchName?: string;

  @Column({ nullable: true })
  city?: string;

  @Column({ nullable: true })
  address?: string;
}
