import ExcelJS from 'exceljs';
import { Voucher, TallyData } from '../types';
import { VOUCHER_TEMPLATES } from '../constants/templates';

export async function downloadVoucherExcel(
  voucherType: string,
  vouchers: Voucher[],
  tallyData: TallyData | null
) {
  try {
    const baseType = Object.keys(VOUCHER_TEMPLATES).find(t => 
      voucherType.toLowerCase().includes(t.toLowerCase())
    ) || 'Payment';
    const template = VOUCHER_TEMPLATES[baseType as keyof typeof VOUCHER_TEMPLATES];

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Data');
    
    const headers = template.fields;
    worksheet.addRow(headers);
    
    // Style headers
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    const dataToExport = vouchers.length > 0 ? vouchers : [{
      date: new Date().toISOString().split('T')[0],
      amount: 0,
      narration: 'Sample Entry',
      voucherNumber: '',
      secondLedger: ''
    }];

    const cleanDate = (val: any) => {
      if (!val) return '';
      let str = String(val).trim();
      
      // Remove common prefixes case-insensitively
      str = str.replace(/^(dated|date|on|at|as on)[:\s]*/i, '').trim();
      
      // Extract date pattern: DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY or YYYY-MM-DD
      const match = str.match(/(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})/);
      if (match) {
        return match[0]; // Return only the matched date part
      }
      return str;
    };

    dataToExport.forEach((v: any) => {
      if (v.inventoryEntries && v.inventoryEntries.length > 0) {
        // Export each inventory entry as a separate row
        v.inventoryEntries.forEach((ie: any) => {
          const row = headers.map(h => {
            if (h === 'Date') return cleanDate(v.date);
            if (h === 'Voucher Number') return v.voucherNumber || '';
            if (h === 'Supplier Invoice Number') return v.reference || '';
            if (h === 'Supplier Invoice Date') return cleanDate(v.referenceDate);
            if (h === 'Customer' || h === 'Supplier') return v.secondLedger || '';
            if (h === 'Buyer Name') return v.buyerName || '';
            if (h === 'Customer GSTIN' || h === 'Supplier GSTIN') return v.gstin || '';
            if (h === 'State of Customer') return v.stateOfCustomer || '';
            if (h === 'Place of Supply') return v.placeOfSupply || '';
            if (h === 'Seller GSTIN') return v.sellerGSTIN || '';
            if (h === 'Sales Ledger' || h === 'Purchase Ledger') return v.ledgerName || '';
            if (h === 'Stock Item') return ie.stockItemName;
            if (h === 'Godown Name') return ie.godownName || '';
            if (h === 'HSN') return ie.hsn || '';
            if (h === 'GST Rate') return ie.gstRate || '';
            if (h === 'Quantity') return ie.quantity;
            if (h === 'Rate') return ie.rate;
            if (h === 'Amount') return ie.amount;
            
            // Additional and GST Ledgers (Voucher level)
            if (h === 'CGST Ledger') return v.ledgerEntries?.find((le: any) => String(le.ledgerName || '').toLowerCase().includes('cgst'))?.ledgerName || '';
            if (h === 'CGST Amount') return v.ledgerEntries?.find((le: any) => String(le.ledgerName || '').toLowerCase().includes('cgst'))?.amount || '';
            if (h === 'SGST Ledger') return v.ledgerEntries?.find((le: any) => String(le.ledgerName || '').toLowerCase().includes('sgst'))?.ledgerName || '';
            if (h === 'SGST Amount') return v.ledgerEntries?.find((le: any) => String(le.ledgerName || '').toLowerCase().includes('sgst'))?.amount || '';
            if (h === 'IGST Ledger') return v.ledgerEntries?.find((le: any) => String(le.ledgerName || '').toLowerCase().includes('igst'))?.ledgerName || '';
            if (h === 'IGST Amount') return v.ledgerEntries?.find((le: any) => String(le.ledgerName || '').toLowerCase().includes('igst'))?.amount || '';
            
            const otherLedgers = v.ledgerEntries?.filter((le: any) => !String(le.ledgerName || '').toLowerCase().match(/cgst|sgst|igst/)) || [];
            if (h === 'Additional Ledger 1') return otherLedgers[0]?.ledgerName || '';
            if (h === 'AL1 Amount') return otherLedgers[0]?.amount || '';
            if (h === 'AL1 Type') return otherLedgers[0] ? (otherLedgers[0].isDebit ? 'Dr' : 'Cr') : '';
            if (h === 'Additional Ledger 2') return otherLedgers[1]?.ledgerName || '';
            if (h === 'AL2 Amount') return otherLedgers[1]?.amount || '';
            if (h === 'AL2 Type') return otherLedgers[1] ? (otherLedgers[1].isDebit ? 'Dr' : 'Cr') : '';
            if (h === 'Additional Ledger 3') return otherLedgers[2]?.ledgerName || '';
            if (h === 'AL3 Amount') return otherLedgers[2]?.amount || '';
            if (h === 'AL3 Type') return otherLedgers[2] ? (otherLedgers[2].isDebit ? 'Dr' : 'Cr') : '';
            
            if (h === 'Narration') return v.narration;
            return '';
          });
          worksheet.addRow(row);
        });
      } else {
        const row = headers.map(h => {
          if (h === 'Date') return cleanDate(v.date);
          if (h === 'Amount') return v.amount;
          if (h === 'Debit') return v.isDebit ? v.amount : '';
          if (h === 'Credit') return !v.isDebit ? v.amount : '';
          if (h === 'Narration') return v.narration;
          if (h === 'Narration 2') return v.narration2 || '';
          if (h === 'Voucher Number') return v.voucherNumber || '';
          if (h === 'Supplier Invoice Number') return v.reference || '';
          if (h === 'Supplier Invoice Date') return cleanDate(v.referenceDate);
          if (h === 'Bank/Cash Account') return v.ledgerName || '';
          if (['Paid To', 'Received From', 'Customer', 'Supplier', 'Debit Ledger', 'Credit Ledger', 'To Account', 'From Account', 'Ledger Name', 'Sales Ledger', 'Purchase Ledger', 'Customer GSTIN', 'Supplier GSTIN', 'Buyer Name', 'State of Customer', 'Place of Supply', 'Seller GSTIN'].includes(h)) {
            // For Purchase, Supplier is secondLedger, Purchase Ledger is ledgerName
            if (h === 'Supplier' || h === 'Customer') return v.secondLedger || '';
            if (h === 'Buyer Name') return v.buyerName || '';
            if (h === 'Supplier GSTIN' || h === 'Customer GSTIN') return v.gstin || '';
            if (h === 'State of Customer') return v.stateOfCustomer || '';
            if (h === 'Place of Supply') return v.placeOfSupply || '';
            if (h === 'Seller GSTIN') return v.sellerGSTIN || '';
            if (h === 'Purchase Ledger' || h === 'Sales Ledger') return v.ledgerName || '';
            return v.secondLedger || v.ledgerName || '';
          }
          return '';
        });
        worksheet.addRow(row);
      }
    });

    // Auto-width
    headers.forEach((_, i) => {
      worksheet.getColumn(i + 1).width = 25;
    });

    // Dropdowns
    const ledgers = tallyData?.ledgers?.map(l => l.name) || [];
    if (ledgers.length > 0) {
      const listSheet = workbook.addWorksheet('Lists');
      listSheet.state = 'veryHidden';
      ledgers.slice(0, 1000).forEach((l, i) => listSheet.getCell(`A${i+1}`).value = l);
      
      headers.forEach((h, i) => {
        if (['Bank/Cash Account', 'Paid To', 'Received From', 'Customer', 'Supplier', 'Debit Ledger', 'Credit Ledger', 'To Account', 'From Account', 'Ledger Name', 'Sales Ledger', 'Purchase Ledger'].includes(h)) {
          const colLetter = String.fromCharCode(65 + i);
          const range = `Lists!$A$1:$A$${Math.min(1000, ledgers.length)}`;
          for (let r = 2; r <= Math.max(dataToExport.length + 100, 500); r++) {
            worksheet.getCell(`${colLetter}${r}`).dataValidation = {
              type: 'list',
              allowBlank: true,
              formulae: [range]
            };
          }
        }
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Tally_${voucherType}_Export_${new Date().getTime()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Excel Export Error:", err);
    throw err;
  }
}

export async function downloadMappingReport(vouchers: Voucher[]) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Ledger Mapping');
  
  worksheet.columns = [
    { header: 'Excel Party Name', key: 'excelName', width: 35 },
    { header: 'Tally Ledger Name', key: 'tallyName', width: 35 },
    { header: 'GSTIN', key: 'gstin', width: 25 },
    { header: 'Match Status', key: 'status', width: 20 }
  ];
  
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };
  
  // Get unique mappings
  const mappingMap = new Map<string, { excelName: string, tallyName: string, gstin: string }>();
  vouchers.forEach(v => {
    if (v.excelPartyName || v.secondLedger) {
      const key = `${v.excelPartyName || ''}_${v.secondLedger || ''}`;
      if (!mappingMap.has(key)) {
        mappingMap.set(key, {
          excelName: v.excelPartyName || '',
          tallyName: v.secondLedger || '',
          gstin: v.gstin || ''
        });
      }
    }
  });
  
  mappingMap.forEach(m => {
    const isGstinMatched = m.excelName && m.tallyName && m.excelName.toLowerCase().trim() !== m.tallyName.toLowerCase().trim();
    worksheet.addRow({
      excelName: m.excelName,
      tallyName: m.tallyName,
      gstin: m.gstin,
      status: isGstinMatched ? 'Matched via GSTIN' : (m.excelName === m.tallyName ? 'Exact Match' : 'New Ledger')
    });
  });
  
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Ledger_Mapping_Report_${new Date().getTime()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
