import React, { useState } from 'react';
import { FileText, ArrowRight, AlertCircle, Hash } from 'lucide-react';

interface PDFPageRangeStepProps {
  fileName: string;
  totalPages: number;
  onConfirm: (start: number, end: number) => void;
  onBack: () => void;
}

export const PDFPageRangeStep = ({ fileName, totalPages, onConfirm, onBack }: PDFPageRangeStepProps) => {
  const [startPage, setStartPage] = useState(1);
  const [endPage, setEndPage] = useState(Math.min(totalPages, 10)); // Default to first 10 pages for safety

  const isValid = startPage >= 1 && endPage <= totalPages && startPage <= endPage;

  return (
    <div className="w-full max-w-xl mx-auto bg-card text-card-foreground rounded-lg border shadow-sm p-6 space-y-6">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-semibold leading-none tracking-tight flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            PDF Page Range
          </h3>
          <button 
            onClick={onBack}
            className="text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            Back
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          Select the pages you want to extract from <b>{fileName}</b>.
        </p>
      </div>

      <div className="p-4 bg-primary/5 border border-primary/10 rounded-xl space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total Pages in File:</span>
          <span className="font-bold text-primary">{totalPages}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <AlertCircle className="w-3 h-3" />
          Processing many pages at once might be slow or fail. We recommend 10-20 pages per batch.
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Hash className="w-3 h-3" /> Start Page
          </label>
          <input 
            type="number" 
            min={1}
            max={totalPages}
            value={startPage}
            onChange={(e) => setStartPage(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-full h-11 px-4 rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Hash className="w-3 h-3" /> End Page
          </label>
          <input 
            type="number" 
            min={startPage}
            max={totalPages}
            value={endPage}
            onChange={(e) => setEndPage(Math.min(totalPages, parseInt(e.target.value) || startPage))}
            className="w-full h-11 px-4 rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono"
          />
        </div>
      </div>

      {!isValid && (
        <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 flex gap-2 text-destructive text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <p>Please enter a valid page range (1 to {totalPages}).</p>
        </div>
      )}

      <button 
        className="w-full bg-primary text-primary-foreground h-12 rounded-xl font-bold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-primary/20 transition-all active:scale-95"
        disabled={!isValid}
        onClick={() => onConfirm(startPage, endPage)}
      >
        Start Extraction <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
};
