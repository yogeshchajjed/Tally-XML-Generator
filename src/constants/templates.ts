export const VOUCHER_TEMPLATES = {
  Payment: {
    nature: 'Accounting',
    fields: ['Date', 'Voucher Number', 'Bank/Cash Account', 'Amount', 'Narration', 'Narration 2', 'Paid To'],
    description: 'Used for cash or bank payments.'
  },
  Receipt: {
    nature: 'Accounting',
    fields: ['Date', 'Voucher Number', 'Bank/Cash Account', 'Amount', 'Narration', 'Narration 2', 'Received From'],
    description: 'Used for cash or bank receipts.'
  },
  Sales: {
    nature: 'Inventory',
    fields: [
      'Date', 'Voucher Number', 'Customer', 'Buyer Name', 'Customer GSTIN', 
      'State of Customer', 'Place of Supply', 'Seller GSTIN', 'Sales Ledger', 
      'Stock Item', 'Godown Name', 'HSN', 'GST Rate', 'Quantity', 'Rate', 'Amount', 
      'CGST Ledger', 'CGST Amount', 'SGST Ledger', 'SGST Amount', 'IGST Ledger', 'IGST Amount',
      'Additional Ledger 1', 'AL1 Amount', 'AL1 Type',
      'Additional Ledger 2', 'AL2 Amount', 'AL2 Type',
      'Additional Ledger 3', 'AL3 Amount', 'AL3 Type',
      'Narration'
    ],
    description: 'Used for recording sales with inventory. Include GST and extra ledgers if needed.'
  },
  Purchase: {
    nature: 'Inventory',
    fields: [
      'Date', 'Voucher Number', 'Supplier', 'Supplier GSTIN', 'Purchase Ledger', 
      'Supplier Invoice Number', 'Supplier Invoice Date', 
      'Stock Item', 'HSN', 'GST Rate', 'Quantity', 'Rate', 'Amount', 
      'CGST Ledger', 'CGST Amount', 'SGST Ledger', 'SGST Amount', 'IGST Ledger', 'IGST Amount',
      'Additional Ledger 1', 'AL1 Amount', 'AL1 Type',
      'Additional Ledger 2', 'AL2 Amount', 'AL2 Type',
      'Additional Ledger 3', 'AL3 Amount', 'AL3 Type',
      'Narration'
    ],
    description: 'Used for recording purchases with inventory. Include GST and extra ledgers if needed.'
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
