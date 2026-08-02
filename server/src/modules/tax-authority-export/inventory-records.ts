import { alphaField, numField, unsignedRateField, assembleRecord } from './fixed-width-fields.util';

export interface InventoryItemInput {
  recordNumberInFile: number;
  vatId: string;
  universalSku?: string;
  supplierSku?: string;
  internalSku: string; // unique
  itemName: string;
  sortCode?: string;
  sortDescription?: string;
  unitDescription: string; // a real unit name when meaningful, otherwise the literal word "יחידה" per the spec
  openingBalance: number; // always non-negative — see the spec's own worked example (opening balance 5, entries 195, exits 120)
  totalEntries: number; // excludes the opening balance itself
  totalExits: number; // excludes the opening balance itself
  costPriceOutsideBondedWarehouse?: number;
  costPriceInBondedWarehouse?: number;
}

/** 100M — one row per inventory item (spec section 4.8). Unlike the
 * ledger's debit/credit amounts, these quantity/cost fields are all
 * plain unsigned numbers (no leading + or - character on the wire —
 * confirmed against the spec's own worked example, where opening
 * balance/entries/exits are shown as bare digit strings like "00195"
 * with no sign). Total length 298. */
export function buildInventoryItemRecord(input: InventoryItemInput): string {
  const fields = [
    alphaField('100M', 4), // 1450
    numField(input.recordNumberInFile, 9), // 1451
    numField(parseInt(input.vatId, 10), 9), // 1452
    alphaField(input.universalSku ?? '', 20), // 1453
    alphaField(input.supplierSku ?? '', 20), // 1454
    alphaField(input.internalSku, 20), // 1455
    alphaField(input.itemName, 50), // 1456
    alphaField(input.sortCode ?? '', 10), // 1457
    alphaField(input.sortDescription ?? '', 30), // 1458
    alphaField(input.unitDescription, 20), // 1459
    unsignedRateField(input.openingBalance, 12, 3), // 1460
    unsignedRateField(input.totalEntries, 12, 3), // 1461
    unsignedRateField(input.totalExits, 12, 3), // 1462
    unsignedRateField(input.costPriceOutsideBondedWarehouse ?? 0, 10, 2), // 1463
    unsignedRateField(input.costPriceInBondedWarehouse ?? 0, 10, 2), // 1464
    alphaField('', 50), // 1465 — future
  ];
  return assembleRecord(fields, 298);
}
