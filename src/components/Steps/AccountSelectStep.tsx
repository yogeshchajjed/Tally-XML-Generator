import React, { useRef } from 'react';
import { CheckCircle2, AlertCircle, ArrowRight, Upload, FileText } from 'lucide-react';
import { Ledger } from '../../types';

interface AccountSelectStepProps {
  voucherType: string;
  accounts: Ledger[];
  selected: string;
  onSelect: (v: string) => void;
  onContinue: () => void;
  onBack: () => void;
  options: React.ReactNode;
  onStatementUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isProcessing?: boolean;
}

export const AccountSelectStep = ({ 
  voucherType, 
  accounts, 
  selected, 
  onSelect, 
  onContinue, 
  onBack, 
  options,
  onStatementUpload,
  isProcessing
}: AccountSelectStepProps) => {
  const [searchTerm, setSearchTerm] = React.useState('');
  const statementFileRef = useRef<HTMLInputElement>(null);
  const isBankVoucher = voucherType.toLowerCase().includes('payment') || voucherType.toLowerCase().includes('receipt');

  const filteredOptions = React.useMemo(() => {
    if (!searchTerm) return options;
    return React.Children.toArray(options).filter((child: any) => 
      child.props.value.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [options, searchTerm]);

  return (
    <div className="w-full max-w-xl mx-auto bg-card text-card-foreground rounded-lg border shadow-sm p-6 space-y-6">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-semibold leading-none tracking-tight flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-primary" />
            Select Bank/Cash Account
          </h3>
          <button 
            onClick={onBack}
            className="text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            Back
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          Select the account for {voucherType}
        </p>
      </div>
      <div className="space-y-4">
        <div className="space-y-2">
          <input 
            type="text"
            placeholder="Search account..."
            className="w-full h-9 px-3 text-xs rounded-md border border-input bg-muted/50 focus:outline-none focus:ring-1 focus:ring-primary"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <select 
            className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            value={selected}
            onChange={(e) => onSelect(e.target.value)}
          >
            <option value="">-- Select Bank/Cash Account --</option>
            {filteredOptions}
          </select>
        </div>
        
        {isBankVoucher && selected && (
          <div className="pt-4 border-t space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Advanced Option</p>
            <button 
              onClick={() => statementFileRef.current?.click()}
              disabled={isProcessing}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 border-dashed border-primary/20 hover:border-primary/50 hover:bg-primary/5 transition-all group"
            >
              {isProcessing ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
              ) : (
                <Upload className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" />
              )}
              <div className="text-left">
                <p className="text-sm font-semibold">Upload Bank Statement</p>
                <p className="text-[10px] text-muted-foreground">Auto-map entries using AI & Tally history</p>
              </div>
            </button>
            <input 
              type="file" 
              ref={statementFileRef} 
              onChange={onStatementUpload} 
              className="hidden" 
              accept=".xlsx, .xls, .csv"
            />
          </div>
        )}

        {accounts.length === 0 && (
          <div className="p-4 rounded-md bg-destructive/10 text-destructive border border-destructive/20 flex gap-3">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">No Accounts Found</p>
              <p className="text-sm">No ledgers found in Bank or Cash groups. Please check your Tally data.</p>
            </div>
          </div>
        )}
      </div>
      <button 
        className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full" 
        disabled={!selected || isProcessing}
        onClick={onContinue}
      >
        Continue <ArrowRight className="ml-2 w-4 h-4" />
      </button>
    </div>
  );
};
