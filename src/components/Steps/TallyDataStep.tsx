import React, { useState } from 'react';
import { Database, Upload, Link, Loader2, Info, AlertCircle, CheckCircle2, HelpCircle, Sparkles, PlusCircle } from 'lucide-react';

interface TallyDataStepProps {
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDirectConnect: (port: string) => void;
  isProcessing: boolean;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onStepChange?: (step: any) => void;
}

export const TallyDataStep = ({ onUpload, onDirectConnect, isProcessing, fileRef, onStepChange }: TallyDataStepProps) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'direct'>('upload');
  const [port, setPort] = useState('9000');
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="w-full max-w-xl mx-auto bg-card text-card-foreground rounded-lg border shadow-sm p-6 space-y-6">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-semibold leading-none tracking-tight flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            Select Tally Data
          </h3>
          <button 
            onClick={() => setShowHelp(!showHelp)}
            className="text-muted-foreground hover:text-primary transition-colors"
            title="Help"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          Choose how you want to load your Tally Masters and Transactions.
        </p>
        <button 
          onClick={() => onStepChange?.('MASTER_CREATION')}
          className="w-full py-2 px-4 border border-primary text-primary rounded-lg text-sm font-medium hover:bg-primary/5 transition-colors flex items-center justify-center gap-2"
        >
          <PlusCircle className="w-4 h-4" /> Need to create new Masters? (Ledger/Stock Item)
        </button>
      </div>

      {showHelp && (
        <div className="p-4 bg-primary/5 border border-primary/10 rounded-xl text-xs space-y-3 animate-in fade-in slide-in-from-top-2">
          <p className="font-semibold flex items-center gap-2 text-primary">
            <Info className="w-4 h-4" />
            How to export Masters from Tally?
          </p>
          <ol className="list-decimal pl-4 space-y-1 text-muted-foreground">
            <li>Open Tally and select your Company.</li>
            <li><b>For Ledgers:</b> Go to Display More Reports &gt; List of Accounts &gt; Ctrl + E &gt; All Masters.</li>
            <li><b>For AI Context:</b> Go to Display More Reports &gt; Daybook &gt; Ctrl + E &gt; Export.</li>
            <li>You can select <b>multiple files</b> at once or upload them one by one.</li>
          </ol>
        </div>
      )}

      <div className="flex p-1 bg-muted rounded-lg">
        <button 
          onClick={() => setActiveTab('upload')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'upload' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Upload className="w-4 h-4" />
          XML Upload
        </button>
        <button 
          onClick={() => setActiveTab('direct')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'direct' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Link className="w-4 h-4" />
          Direct Connect
        </button>
      </div>

      {activeTab === 'upload' ? (
        <div 
          onClick={() => !isProcessing && fileRef.current?.click()}
          className={`border-2 border-dashed border-muted-foreground/25 rounded-xl p-10 flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-muted/50 transition-colors ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {isProcessing ? (
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
          ) : (
            <Upload className="w-10 h-10 text-muted-foreground" />
          )}
          <div className="text-center">
            <p className="font-medium">Click to upload Tally XML(s)</p>
            <p className="text-sm text-muted-foreground">Masters and Daybook exports</p>
          </div>
          <input 
            type="file" 
            ref={fileRef} 
            onChange={onUpload} 
            className="hidden" 
            accept=".xml"
            multiple
            disabled={isProcessing}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 border border-amber-100 text-amber-900 rounded-xl space-y-3">
            <div className="flex gap-2 font-bold text-xs uppercase tracking-wider">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <p>Browser Security Requirement</p>
            </div>
            <div className="text-[11px] space-y-2 leading-relaxed">
              <p>Browsers block connections from <b>HTTPS</b> (this site) to <b>HTTP</b> (Tally) by default.</p>
              <div className="bg-white/50 p-2 rounded border border-amber-200 space-y-2">
                <p className="font-semibold">Firefox Users:</p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>Click the <b>Shield Icon</b> (left of address bar) and turn <b>OFF</b> Tracking Protection.</li>
                  <li>If it still fails, click the <b>Lock Icon</b> &gt; <b>Connection secure</b> &gt; <b>Disable protection for now</b>.</li>
                </ol>
                <p className="font-semibold mt-2">Chrome/Edge Users:</p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>Click <b>Lock Icon</b> &gt; <b>Site Settings</b> &gt; Set <b>Insecure content</b> to <b>Allow</b>.</li>
                </ol>
                <p className="font-bold text-primary mt-2 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Tip: Install as Desktop App (PWA) for better offline support!
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Tally Port</label>
              <span className="text-[10px] text-muted-foreground">Default: 9000</span>
            </div>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="9000"
                className="flex-1 h-11 px-4 rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono"
              />
              <button 
                onClick={() => onDirectConnect(port)}
                disabled={isProcessing}
                className="bg-primary text-primary-foreground px-6 rounded-xl font-bold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-primary/20 transition-all active:scale-95"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Connect
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Tally must be running on this machine
          </div>
        </div>
      )}
    </div>
  );
};
