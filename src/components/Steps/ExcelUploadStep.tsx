import React from 'react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { FileSpreadsheet, Upload, Loader2, Brain, AlertCircle, Download, ArrowRight } from 'lucide-react';
import { TallyData, Voucher } from '../../types';
import { VOUCHER_TEMPLATES } from '../../constants/templates';

interface ExcelUploadStepProps {
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onBack: () => void;
  voucherType: string;
  tallyData: TallyData | null;
  vouchers?: Voucher[];
  duplicates?: Voucher[];
  onDownloadDuplicates?: () => void;
  onContinue?: () => void;
  isProcessing?: boolean;
  progress?: number;
}

export const ExcelUploadStep = ({ 
  onUpload, 
  fileRef, 
  onBack, 
  voucherType, 
  tallyData, 
  vouchers = [],
  duplicates = [],
  onDownloadDuplicates,
  onContinue,
  isProcessing,
  progress = 0
}: ExcelUploadStepProps) => {
  const template = React.useMemo(() => {
    const baseType = Object.keys(VOUCHER_TEMPLATES).find(t => 
      voucherType.toLowerCase().includes(t.toLowerCase())
    ) || 'Payment';
    return VOUCHER_TEMPLATES[baseType as keyof typeof VOUCHER_TEMPLATES];
  }, [voucherType]);

  const downloadTemplate = async () => {
    try {
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

      dataToExport.forEach((v: any) => {
        const row = headers.map(h => {
          if (h === 'Date') return v.date;
          if (h === 'Amount') return v.amount;
          if (h === 'Narration') return v.narration;
          if (h === 'Narration 2') return v.narration2 || '';
          if (h === 'Voucher Number') return v.voucherNumber || '';
          if (['Paid To', 'Received From', 'Customer', 'Supplier', 'Debit Ledger', 'Credit Ledger', 'To Account', 'From Account', 'Ledger Name'].includes(h)) {
            return v.secondLedger || '';
          }
          return '';
        });
        worksheet.addRow(row);
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
          if (['Paid To', 'Received From', 'Customer', 'Supplier', 'Debit Ledger', 'Credit Ledger', 'To Account', 'From Account', 'Ledger Name'].includes(h)) {
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
    }
  };

  return (
    <div className={`w-full ${vouchers.length > 0 ? 'max-w-[95%]' : 'max-w-2xl'} mx-auto bg-card text-card-foreground rounded-lg border shadow-sm p-6 space-y-6 transition-all duration-300`}>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-semibold leading-none tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            Upload Excel Data
          </h3>
          <button 
            onClick={onBack}
            className="text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            Back
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          Upload your Excel file for <b>{voucherType}</b>.
        </p>
      </div>

      {vouchers.length === 0 && duplicates.length > 0 && !isProcessing && (
        <div className="p-4 bg-destructive/5 border border-destructive/10 rounded-xl flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
          <p className="text-xs text-destructive font-medium">
            All entries in the statement were identified as duplicates and skipped. No new entries to process.
          </p>
        </div>
      )}

      {vouchers.length > 0 && (
        <div className="p-4 bg-primary/5 border border-primary/10 rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-primary" />
              <span className="text-sm font-bold text-primary">Bank Statement Data Loaded</span>
            </div>
            {isProcessing ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-background px-2 py-1 rounded-full border">
                <Loader2 className="w-3 h-3 animate-spin" />
                Mapping: {progress}%
              </div>
            ) : (
              <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">AI Ready</span>
            )}
          </div>

          <div className="h-1.5 w-full bg-primary/10 rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-500" 
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="border rounded-lg overflow-hidden bg-background shadow-sm">
            <div className="max-h-[250px] overflow-y-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-muted/50 sticky top-0 backdrop-blur-sm">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Date</th>
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Narration</th>
                    <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Amount</th>
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Ledger</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {vouchers.slice(0, 20).map((v, i) => (
                    <tr key={i} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{v.date}</td>
                      <td className="px-3 py-2">
                        <div className="truncate max-w-[150px] font-medium" title={v.narration}>
                          {v.narration}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold">
                        {v.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2">
                        {v.secondLedger ? (
                          <span className="text-primary font-bold">{v.secondLedger}</span>
                        ) : (
                          <span className="text-muted-foreground italic animate-pulse">Mapping...</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {vouchers.length > 20 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-2 text-center text-muted-foreground bg-muted/10 italic">
                        + {vouchers.length - 20} more entries available in Review
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button 
              onClick={downloadTemplate}
              data-excel-download-btn
              className="flex items-center justify-center gap-2 rounded-xl text-sm font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/80 h-11 transition-all shadow-sm"
            >
              <Download className="w-4 h-4" /> Download Excel
            </button>
            <button 
              onClick={onContinue}
              disabled={isProcessing}
              className="flex items-center justify-center gap-2 rounded-xl text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 h-11 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
            >
              Proceed to Review <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {vouchers.length === 0 && (
        <div 
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-muted-foreground/25 rounded-2xl p-12 flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-muted/50 transition-all group"
        >
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
            <Upload className="w-8 h-8 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="font-bold text-lg">Upload Excel Template</p>
            <p className="text-sm text-muted-foreground mt-1">If you have manually filled the template, upload it here.</p>
          </div>
          <input 
            type="file" 
            ref={fileRef} 
            onChange={onUpload} 
            className="hidden" 
            accept=".xlsx, .xls"
          />
        </div>
      )}

      {duplicates.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <span className="text-sm font-bold text-amber-900">{duplicates.length} Duplicates Skipped</span>
                <p className="text-[10px] text-amber-700 leading-none mt-0.5">Already exist in Tally</p>
              </div>
            </div>
            <button 
              onClick={onDownloadDuplicates}
              className="flex items-center gap-2 text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 px-4 py-2 rounded-xl transition-all shadow-sm"
            >
              <Download className="w-3.5 h-3.5" /> Report
            </button>
          </div>
        </div>
      )}
      <button 
        className="w-full text-xs text-primary hover:underline"
        onClick={downloadTemplate}
      >
        Download {voucherType} Excel Template
      </button>
    </div>
  );
};
