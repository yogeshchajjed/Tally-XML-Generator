import React from 'react';
import { ChevronRight, Download } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

const StepItem = ({ label, number, active, showChevron }: { label: string, number: string, active: boolean, showChevron: boolean }) => (
  <React.Fragment>
    <div className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-colors ${active ? 'bg-primary text-primary-foreground border-transparent' : 'border-muted-foreground/20 text-muted-foreground'}`}>
      {number}. {label}
    </div>
    {showChevron && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
  </React.Fragment>
);

export const Header = ({ step }: { step: string }) => {
  const { isInstallable, install } = usePWAInstall();

  return (
    <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
      <div className="flex items-center justify-between w-full md:w-auto">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tally XML Generator</h1>
          <p className="text-muted-foreground">Convert Excel data to Tally XML with AI assistance.</p>
        </div>
        {isInstallable && (
          <button 
            onClick={install}
            className="md:hidden flex items-center gap-2 bg-primary/10 text-primary px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-primary/20 transition-all"
          >
            <Download className="w-3 h-3" />
            Install
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="hidden md:flex items-center gap-2 mr-4">
          {isInstallable && (
            <button 
              onClick={install}
              className="flex items-center gap-2 bg-primary/10 text-primary px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-primary/20 transition-all"
            >
              <Download className="w-3 h-3" />
              Install Desktop App
            </button>
          )}
        </div>
        {step !== 'MASTER_CREATION' && (
          <>
            <StepItem label="Tally Data" number="1" active={step === 'TALLY_DATA'} showChevron={true} />
            <StepItem label="Setup" number="2" active={step === 'VOUCHER_TYPE' || step === 'ACCOUNT_SELECT'} showChevron={true} />
            <StepItem label="Upload" number="3" active={step === 'EXCEL_UPLOAD'} showChevron={true} />
            <StepItem label="Review" number="4" active={step === 'REVIEW'} showChevron={false} />
          </>
        )}
      </div>
    </header>
  );
};
