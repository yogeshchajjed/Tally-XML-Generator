export const VOUCHER_TEMPLATES = {
  Payment: {
    nature: 'Accounting',
    fields: ['Date', 'Voucher Number', 'Amount', 'Narration', 'Narration 2', 'Paid To'],
    description: 'Used for cash or bank payments.'
  },
  Receipt: {
    nature: 'Accounting',
    fields: ['Date', 'Voucher Number', 'Amount', 'Narration', 'Narration 2', 'Received From'],
    description: 'Used for cash or bank receipts.'
  },
  Sales: {
    nature: 'Inventory',
    fields: ['Date', 'Voucher Number', 'Customer', 'Stock Item', 'Quantity', 'Rate', 'Amount', 'Narration'],
    description: 'Used for recording sales with inventory.'
  },
  Purchase: {
    nature: 'Inventory',
    fields: ['Date', 'Voucher Number', 'Supplier', 'Stock Item', 'Quantity', 'Rate', 'Amount', 'Narration'],
    description: 'Used for recording purchases with inventory.'
  },
  Contra: {
    nature: 'Accounting',
    fields: ['Date', 'Voucher Number', 'Amount', 'Narration', 'From Account', 'To Account'],
    description: 'Used for bank-to-bank or cash-to-bank transfers.'
  },
  Journal: {
    nature: 'Accounting',
    fields: ['Date', 'Voucher Number', 'Ledger Name', 'Debit', 'Credit', 'Narration'],
    description: 'Used for adjustment entries. Use same Voucher Number for multiple Dr/Cr entries.'
  }
};
