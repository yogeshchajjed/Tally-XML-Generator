import React, { useState } from 'react';
import { Settings2, ArrowRight, AlertCircle } from 'lucide-react';

interface ColumnMappingStepProps {
  keys: string[];
  initialMapping?: {
    date: string;
    narration: string;
    withdrawal?: string;
    deposit?: string;
    amount?: string;
    type?: string;
  };
  onMappingComplete: (mapping: {
    date: string;
    narration: string;
    withdrawal?: string;
    deposit?: string;
    amount?: string;
    type?: string;
  }) => void;
  onBack: () => void;
}

export const ColumnMappingStep = ({ keys, initialMapping, onMappingComplete, onBack }: ColumnMappingStepProps) => {
  const [mapping, setMapping] = useState({
    date: initialMapping?.date || '',
    narration: initialMapping?.narration || '',
    withdrawal: initialMapping?.withdrawal || '',
    deposit: initialMapping?.deposit || '',
    amount: initialMapping?.amount || '',
    type: initialMapping?.type || ''
  });

  const isValid = mapping.date && mapping.narration && ((mapping.withdrawal && mapping.deposit) || mapping.amount);

  return (
    <div className="w-full max-w-xl mx-auto bg-card text-card-foreground rounded-lg border shadow-sm p-6 space-y-6">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-semibold leading-none tracking-tight flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-primary" />
            Verify Column Mapping
          </h3>
          <button 
            onClick={onBack}
            className="text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            Back
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          Confirm how we should read your bank statement columns.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Date Column</label>
          <select 
            className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background"
            value={mapping.date}
            onChange={(e) => setMapping({ ...mapping, date: e.target.value })}
          >
            <option value="">Select Date Column</option>
            {keys.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Narration/Description Column</label>
          <select 
            className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background"
            value={mapping.narration}
            onChange={(e) => setMapping({ ...mapping, narration: e.target.value })}
          >
            <option value="">Select Narration Column</option>
            {keys.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>

        <div className="pt-4 border-t">
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">Amount Configuration</p>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium">Withdrawal/Debit</label>
              <select 
                className="w-full h-9 px-2 py-1 text-xs rounded-md border border-input bg-background"
                value={mapping.withdrawal}
                onChange={(e) => setMapping({ ...mapping, withdrawal: e.target.value, amount: '', type: '' })}
              >
                <option value="">Select Column</option>
                {keys.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">Deposit/Credit</label>
              <select 
                className="w-full h-9 px-2 py-1 text-xs rounded-md border border-input bg-background"
                value={mapping.deposit}
                onChange={(e) => setMapping({ ...mapping, deposit: e.target.value, amount: '', type: '' })}
              >
                <option value="">Select Column</option>
                {keys.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
          </div>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or Single Amount Column</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium">Amount Column</label>
              <select 
                className="w-full h-9 px-2 py-1 text-xs rounded-md border border-input bg-background"
                value={mapping.amount}
                onChange={(e) => setMapping({ ...mapping, amount: e.target.value, withdrawal: '', deposit: '' })}
              >
                <option value="">Select Column</option>
                {keys.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">Type (Dr/Cr) Column</label>
              <select 
                className="w-full h-9 px-2 py-1 text-xs rounded-md border border-input bg-background"
                value={mapping.type}
                onChange={(e) => setMapping({ ...mapping, type: e.target.value, withdrawal: '', deposit: '' })}
              >
                <option value="">Select Column (Optional)</option>
                {keys.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
          </div>
        </div>

        {!isValid && (
          <div className="p-3 rounded-md bg-amber-50 border border-amber-200 flex gap-2 text-amber-800">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="text-[10px]">Please map Date, Narration, and either (Withdrawal + Deposit) or a single Amount column.</p>
          </div>
        )}
      </div>

      <button 
        className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full" 
        disabled={!isValid}
        onClick={() => onMappingComplete(mapping)}
      >
        Process Statement <ArrowRight className="ml-2 w-4 h-4" />
      </button>
    </div>
  );
};
