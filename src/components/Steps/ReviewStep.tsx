import React from 'react';
import { Loader2, Download, Brain, AlertCircle } from 'lucide-react';
import { Voucher, LedgerEntry } from '../../types';

interface VoucherRowProps {
  key?: React.Key;
  v: Voucher;
  index: number;
  onLedgerChange: (field: 'ledgerName' | 'secondLedger', val: string) => void;
  onAdditionalLedgerChange: (leIndex: number, field: keyof LedgerEntry, val: any) => void;
}

const VoucherRow = ({ v, index, onLedgerChange, onAdditionalLedgerChange }: VoucherRowProps) => {
  const isReceipt = v.voucherType.toLowerCase().includes('receipt');
  const isPayment = v.voucherType.toLowerCase().includes('payment');

  return (
    <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:bg-muted/30 transition-colors border-b last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-muted-foreground">{v.date}</span>
          {v.voucherNumber && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-mono">#{v.voucherNumber}</span>}
          <span className="text-sm font-bold text-primary">₹{(v.partyAmount || v.amount).toLocaleString()}</span>
          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-primary/10 text-primary">{v.voucherType}</span>
          {v.excelPartyName && v.secondLedger && String(v.excelPartyName).toLowerCase().trim() !== String(v.secondLedger).toLowerCase().trim() && (
            <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200" title={`Excel Name: ${v.excelPartyName}`}>
              Matched: {v.excelPartyName} → {v.secondLedger}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground truncate" title={v.narration}>{v.narration}</p>
        
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-green-600 uppercase tracking-wider flex justify-between">
              Debit (Dr)
              {isReceipt && <span className="text-[9px] lowercase font-normal italic opacity-60">(Bank/Cash)</span>}
            </span>
            <div className="flex flex-col gap-1">
              <div className="text-sm font-medium truncate bg-green-50/50 p-2 rounded border border-green-100 flex justify-between items-center">
                <div className="flex-1 min-w-0 mr-2">
                  <input 
                    list="ledger-list"
                    className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm placeholder:text-green-300 font-medium"
                    value={v.isDebit ? v.ledgerName : (v.secondLedger || '')} 
                    placeholder="Select Debit Ledger"
                    onChange={(e) => onLedgerChange(v.isDebit ? 'ledgerName' : 'secondLedger', e.target.value)}
                  />
                </div>
                <span className="text-green-600 font-bold">₹{v.amount.toLocaleString()}</span>
              </div>
              {v.ledgerEntries?.map((le, leIdx) => {
                if (!le.isDebit) return null;
                return (
                  <div key={`dr-le-${leIdx}`} className="text-xs text-green-700 bg-green-50/30 p-1.5 rounded border border-green-100/50 flex justify-between items-center group">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <button 
                        onClick={() => onAdditionalLedgerChange(leIdx, 'isDebit', false)}
                        className="text-[10px] font-bold bg-green-100 text-green-700 px-1 rounded cursor-pointer hover:bg-green-200 transition-colors shrink-0"
                        title="Change to Credit"
                      >
                        Dr
                      </button>
                      <input 
                        list="ledger-list"
                        className="bg-transparent border-none focus:ring-0 p-0 text-xs w-full font-medium"
                        value={le.ledgerName}
                        onChange={(e) => onAdditionalLedgerChange(leIdx, 'ledgerName', e.target.value)}
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <input 
                        type="number"
                        className="bg-transparent border-none focus:ring-0 p-0 text-xs w-16 text-right font-bold"
                        value={le.amount}
                        onChange={(e) => onAdditionalLedgerChange(leIdx, 'amount', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider flex justify-between">
              Credit (Cr)
              {isPayment && <span className="text-[9px] lowercase font-normal italic opacity-60">(Bank/Cash)</span>}
            </span>
            <div className="flex flex-col gap-1">
              <div className="text-sm font-medium truncate bg-red-50/50 p-2 rounded border border-red-100 flex justify-between items-center">
                <div className="flex-1 min-w-0 mr-2">
                  <input 
                    list="ledger-list"
                    className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm placeholder:text-red-300 font-medium"
                    value={!v.isDebit ? v.ledgerName : (v.secondLedger || '')} 
                    placeholder="Select Credit Ledger"
                    onChange={(e) => onLedgerChange(!v.isDebit ? 'ledgerName' : 'secondLedger', e.target.value)}
                  />
                </div>
                <span className="text-red-600 font-bold">₹{v.amount.toLocaleString()}</span>
              </div>
              {v.ledgerEntries?.map((le, leIdx) => {
                if (le.isDebit) return null;
                return (
                  <div key={`cr-le-${leIdx}`} className="text-xs text-red-700 bg-red-50/30 p-1.5 rounded border border-red-100/50 flex justify-between items-center group">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <button 
                        onClick={() => onAdditionalLedgerChange(leIdx, 'isDebit', true)}
                        className="text-[10px] font-bold bg-red-100 text-red-700 px-1 rounded cursor-pointer hover:bg-red-200 transition-colors shrink-0"
                        title="Change to Debit"
                      >
                        Cr
                      </button>
                      <input 
                        list="ledger-list"
                        className="bg-transparent border-none focus:ring-0 p-0 text-xs w-full font-medium"
                        value={le.ledgerName}
                        onChange={(e) => onAdditionalLedgerChange(leIdx, 'ledgerName', e.target.value)}
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <input 
                        type="number"
                        className="bg-transparent border-none focus:ring-0 p-0 text-xs w-16 text-right font-bold"
                        value={le.amount}
                        onChange={(e) => onAdditionalLedgerChange(leIdx, 'amount', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {v.inventoryEntries && v.inventoryEntries.length > 0 && (
          <div className="mt-3 bg-muted/20 p-2 rounded border border-muted/30">
            <span className="text-[9px] font-bold text-muted-foreground uppercase mb-1 block">Inventory Items</span>
            <div className="flex flex-wrap gap-1.5">
              {v.inventoryEntries.map((ie, i) => (
                <div key={`${index}-ie-${i}`} className="text-[10px] bg-primary/5 text-primary px-2.5 py-1 rounded-md border border-primary/10 flex items-center gap-1">
                  <span className="font-bold">{ie.stockItemName}</span>
                  <span className="opacity-70">| {ie.quantity} x {ie.rate} = ₹{ie.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface ReviewStepProps {
  vouchers: Voucher[];
  duplicates: Voucher[];
  paginatedVouchers: Voucher[];
  isProcessing: boolean;
  isSaving: boolean;
  progress: number;
  onDownload: () => void;
  onDownloadExcel?: () => void;
  onDownloadMapping?: () => void;
  onDownloadDuplicates: () => void;
  onSaveToCloud: () => void;
  onBack: () => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  onLedgerChange: (index: number, field: 'ledgerName' | 'secondLedger', val: string) => void;
  onAdditionalLedgerChange: (vIndex: number, leIndex: number, field: keyof LedgerEntry, val: any) => void;
  itemsPerPage: number;
}

export const ReviewStep = ({ 
  vouchers, 
  duplicates,
  paginatedVouchers, 
  isProcessing, 
  isSaving,
  progress, 
  onDownload, 
  onDownloadExcel,
  onDownloadMapping,
  onDownloadDuplicates,
  onSaveToCloud,
  onBack,
  currentPage, 
  totalPages, 
  onPageChange, 
  onLedgerChange,
  onAdditionalLedgerChange,
  itemsPerPage
}: ReviewStepProps) => (
  <div className="w-full max-w-[95%] mx-auto bg-card text-card-foreground rounded-lg border shadow-sm p-6">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-2xl font-semibold leading-none tracking-tight">Review Transactions ({vouchers.length})</h3>
          <button 
            onClick={onBack}
            className="text-xs text-muted-foreground hover:text-primary transition-colors ml-2"
          >
            Back
          </button>
        </div>
        <p className="text-sm text-muted-foreground mt-1.5">AI mapping ledgers based on narration.</p>
      </div>
      <div className="flex items-center gap-2">
        {isProcessing && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            {progress}%
          </div>
        )}
        <button 
          className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background hover:bg-accent h-10 px-4 py-2"
          onClick={onSaveToCloud}
          disabled={isSaving || vouchers.length === 0}
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Brain className="w-4 h-4 mr-2" />}
          Save to Cloud
        </button>
        <button 
          className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background hover:bg-accent h-10 px-4 py-2"
          onClick={onDownloadMapping}
          disabled={isProcessing || vouchers.length === 0}
        >
          <Brain className="w-4 h-4 mr-2" />
          Mapping Report
        </button>
        <button 
          className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background hover:bg-accent h-10 px-4 py-2"
          onClick={onDownloadExcel}
          disabled={isProcessing || vouchers.length === 0}
        >
          <Download className="w-4 h-4 mr-2" />
          Excel
        </button>
        <button 
          className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
          onClick={onDownload} 
          disabled={isProcessing}
        >
          <Download className="mr-2 w-4 h-4" /> Generate
        </button>
      </div>
    </div>

    {duplicates.length > 0 && (
      <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-amber-600">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-900">{duplicates.length} Duplicate Entries Found</p>
            <p className="text-xs text-amber-700">These entries already exist in your Tally data and were skipped.</p>
          </div>
        </div>
        <button 
          onClick={onDownloadDuplicates}
          className="text-xs font-medium text-amber-900 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-md transition-colors flex items-center gap-2"
        >
          <Download className="w-3 h-3" />
          Download Duplicate Report
        </button>
      </div>
    )}
    
    <div className="rounded-md border overflow-hidden">
      {paginatedVouchers.map((v, i) => (
        <VoucherRow 
          key={(currentPage - 1) * itemsPerPage + i} 
          v={v} 
          index={(currentPage - 1) * itemsPerPage + i} 
          onLedgerChange={(field, val) => onLedgerChange((currentPage - 1) * itemsPerPage + i, field, val)} 
          onAdditionalLedgerChange={(leIdx, field, val) => onAdditionalLedgerChange((currentPage - 1) * itemsPerPage + i, leIdx, field, val)}
        />
      ))}
    </div>
    
    {totalPages > 1 && (
      <div className="flex items-center justify-between mt-4">
        <p className="text-xs text-muted-foreground">
          {vouchers.length} total
        </p>
        <div className="flex items-center gap-2">
          <button 
            className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background hover:bg-accent h-8 px-3"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
          >
            Prev
          </button>
          <span className="text-xs font-medium">{currentPage} / {totalPages}</span>
          <button 
            className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background hover:bg-accent h-8 px-3"
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
          >
            Next
          </button>
        </div>
      </div>
    )}
  </div>
);
