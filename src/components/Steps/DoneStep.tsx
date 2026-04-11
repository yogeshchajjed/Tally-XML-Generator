import React from 'react';
import { CheckCircle2 } from 'lucide-react';

interface DoneStepProps {
  onStartOver: () => void;
  onNewExcel: () => void;
}

export const DoneStep = ({ onStartOver, onNewExcel }: DoneStepProps) => (
  <div className="w-full max-w-md mx-auto bg-card text-card-foreground rounded-lg border shadow-sm p-6 text-center space-y-6">
    <div className="space-y-1.5">
      <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
        <CheckCircle2 className="w-10 h-10 text-primary" />
      </div>
      <h3 className="text-2xl font-semibold leading-none tracking-tight">XML Generated!</h3>
      <p className="text-sm text-muted-foreground">
        Your Tally XML file has been downloaded. You can now import it into Tally.
      </p>
    </div>
    <div className="flex gap-2">
      <button 
        className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 flex-1" 
        onClick={onStartOver}
      >
        Start Over
      </button>
      <button 
        className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 flex-1" 
        onClick={onNewExcel}
      >
        New Excel
      </button>
    </div>
  </div>
);
