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
  quantity: number;
  rate: number;
  amount: number;
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
  inventoryEntries?: InventoryEntry[];
}

export interface TallyData {
  voucherTypes: string[];
  ledgers: Ledger[];
  stockItems: StockItem[];
  transactions: Voucher[];
}
