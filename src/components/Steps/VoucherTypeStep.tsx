import React from 'react';
import { CreditCard, ArrowRight } from 'lucide-react';

interface VoucherTypeStepProps {
  voucherTypes: string[];
  selected: string;
  onSelect: (v: string) => void;
  onContinue: () => void;
  onBack: () => void;
}

export const VoucherTypeStep = ({ voucherTypes, selected, onSelect, onContinue, onBack }: VoucherTypeStepProps) => (
  <div className="w-full max-w-xl mx-auto bg-card text-card-foreground rounded-lg border shadow-sm p-6 space-y-6">
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-semibold leading-none tracking-tight flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-primary" />
          Select Voucher Type
        </h3>
        <button 
          onClick={onBack}
          className="text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          Add More Data
        </button>
      </div>
      <p className="text-sm text-muted-foreground">
        Which type of voucher are you importing?
      </p>
    </div>
    <select 
      className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      value={selected}
      onChange={(e) => onSelect(e.target.value)}
    >
      <option value="">Select voucher type</option>
      {voucherTypes.map(vt => (
        <option key={vt} value={vt}>{vt}</option>
      ))}
    </select>
    <button 
      className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full" 
      disabled={!selected}
      onClick={onContinue}
    >
      Continue <ArrowRight className="ml-2 w-4 h-4" />
    </button>
  </div>
);
