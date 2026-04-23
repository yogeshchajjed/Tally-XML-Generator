export interface Ledger {
  name: string;
  parent: string;
}

export interface StockItem {
  name: string;
  parent: string;
  uom: string;
}

export interface InventoryEntry {
  stockItemName: string;
  hsn?: string;
  gstRate?: number;
  quantity: number;
  rate: number;
  amount: number;
}

export interface LedgerEntry {
  ledgerName: string;
  amount: number;
  isDebit: boolean;
}

export interface Voucher {
  date: string;
  voucherType: string;
  voucherNumber?: string;
  ledgerName: string;
  amount: number;
  narration: string;
  narration2?: string;
  isDebit: boolean;
  secondLedger?: string;
  partyAmount?: number;
  gstin?: string;
  reference?: string;
  referenceDate?: string;
  inventoryEntries?: InventoryEntry[];
  ledgerEntries?: LedgerEntry[];
}

export interface TallyData {
  voucherTypes: string[];
  ledgers: Ledger[];
  stockItems: StockItem[];
  transactions: Voucher[];
}
