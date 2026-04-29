import React, { useState } from 'react';
import { Settings2, ArrowRight, AlertCircle, Table, FileText, Layout, Info } from 'lucide-react';

interface PurchaseExcelMappingStepProps {
  sheetNames: string[];
  previewData: any[][]; // 2D array of the first sheet for preview
  onMappingComplete: (mapping: PurchaseMapping) => void;
  onBack: () => void;
}

export interface PurchaseMapping {
  supplierCell: string;
  supplierGstinCell?: string;
  supplierGstinCol?: string;
  dateCell: string;
  invoiceNumberCell: string;
  itemsStartRow: number;
  descriptionCol: string;
  hsnCol: string;
  quantityCol: string;
  rateCol: string;
  amountCol: string;
  purchaseLedgerCol?: string;
  cgstCol?: string;
  sgstCol?: string;
  igstCol?: string;
}

export const PurchaseExcelMappingStep = ({ sheetNames, previewData, onMappingComplete, onBack }: PurchaseExcelMappingStepProps) => {
  const [mapping, setMapping] = useState<PurchaseMapping>({
    supplierCell: 'A1',
    supplierGstinCell: '',
    supplierGstinCol: '',
    dateCell: 'B1',
    invoiceNumberCell: 'C1',
    itemsStartRow: 5,
    descriptionCol: 'A',
    hsnCol: 'B',
    quantityCol: 'C',
    rateCol: 'D',
    amountCol: 'E',
    purchaseLedgerCol: '',
    cgstCol: '',
    sgstCol: '',
    igstCol: ''
  });

  const isValid = mapping.supplierCell && mapping.dateCell && mapping.itemsStartRow > 0 && mapping.descriptionCol && mapping.amountCol;

  // Helper to convert column letter to index (A -> 0, B -> 1)
  const colToIndex = (col: string) => {
    let index = 0;
    for (let i = 0; i < col.length; i++) {
      index = index * 26 + col.charCodeAt(i) - 64;
    }
    return index - 1;
  };

  // Helper to parse cell (A1 -> {r:0, c:0})
  const parseCell = (cell: string) => {
    const match = cell.match(/([A-Z]+)(\d+)/);
    if (!match) return null;
    return {
      r: parseInt(match[2]) - 1,
      c: colToIndex(match[1])
    };
  };

  return (
    <div className="w-full max-w-4xl mx-auto bg-card text-card-foreground rounded-lg border shadow-sm p-6 space-y-6">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-semibold leading-none tracking-tight flex items-center gap-2">
            <Layout className="w-5 h-5 text-primary" />
            Configure Purchase Excel Mapping
          </h3>
          <button 
            onClick={onBack}
            className="text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            Back
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          Tell us where to find invoice details and items in your Excel file.
        </p>
      </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Configuration Form */}
        <div className="space-y-6">
          <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg flex gap-3 text-blue-800">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <div className="space-y-1">
              <p className="text-xs font-bold leading-none">Date Format Note</p>
              <p className="text-[10px] leading-tight opacity-90">
                System handles multiple formats, but <b>YYYY-MM-DD</b> is preferred for maximum accuracy.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-bold uppercase tracking-wider text-primary flex items-center gap-2">
              <FileText className="w-4 h-4" /> Header Details
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">Supplier Name Cell</label>
                <input 
                  type="text" 
                  className="w-full h-9 px-3 text-sm rounded-md border border-input bg-background"
                  value={mapping.supplierCell}
                  onChange={(e) => setMapping({ ...mapping, supplierCell: e.target.value.toUpperCase() })}
                  placeholder="e.g. A1"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">Supplier GSTIN Cell (Optional)</label>
                <input 
                  type="text" 
                  className="w-full h-9 px-3 text-sm rounded-md border border-input bg-background"
                  value={mapping.supplierGstinCell}
                  onChange={(e) => setMapping({ ...mapping, supplierGstinCell: e.target.value.toUpperCase() })}
                  placeholder="e.g. A2"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">Invoice Date Cell</label>
                <input 
                  type="text" 
                  className="w-full h-9 px-3 text-sm rounded-md border border-input bg-background"
                  value={mapping.dateCell}
                  onChange={(e) => setMapping({ ...mapping, dateCell: e.target.value.toUpperCase() })}
                  placeholder="e.g. B1"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">Invoice No. Cell</label>
                <input 
                  type="text" 
                  className="w-full h-9 px-3 text-sm rounded-md border border-input bg-background"
                  value={mapping.invoiceNumberCell}
                  onChange={(e) => setMapping({ ...mapping, invoiceNumberCell: e.target.value.toUpperCase() })}
                  placeholder="e.g. C1"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t">
            <h4 className="text-sm font-bold uppercase tracking-wider text-primary flex items-center gap-2">
              <Table className="w-4 h-4" /> Item Table Details
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">Items Start Row</label>
                <input 
                  type="number" 
                  className="w-full h-9 px-3 text-sm rounded-md border border-input bg-background"
                  value={mapping.itemsStartRow}
                  onChange={(e) => setMapping({ ...mapping, itemsStartRow: parseInt(e.target.value) || 0 })}
                  placeholder="e.g. 5"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">Description Col</label>
                <input 
                  type="text" 
                  className="w-full h-9 px-3 text-sm rounded-md border border-input bg-background"
                  value={mapping.descriptionCol}
                  onChange={(e) => setMapping({ ...mapping, descriptionCol: e.target.value.toUpperCase() })}
                  placeholder="e.g. A"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">Supplier GSTIN Col (Optional)</label>
                <input 
                  type="text" 
                  className="w-full h-9 px-3 text-sm rounded-md border border-input bg-background"
                  value={mapping.supplierGstinCol}
                  onChange={(e) => setMapping({ ...mapping, supplierGstinCol: e.target.value.toUpperCase() })}
                  placeholder="e.g. F"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">HSN Col</label>
                <input 
                  type="text" 
                  className="w-full h-9 px-3 text-sm rounded-md border border-input bg-background"
                  value={mapping.hsnCol}
                  onChange={(e) => setMapping({ ...mapping, hsnCol: e.target.value.toUpperCase() })}
                  placeholder="e.g. B"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">Quantity Col</label>
                <input 
                  type="text" 
                  className="w-full h-9 px-3 text-sm rounded-md border border-input bg-background"
                  value={mapping.quantityCol}
                  onChange={(e) => setMapping({ ...mapping, quantityCol: e.target.value.toUpperCase() })}
                  placeholder="e.g. C"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">Rate Col</label>
                <input 
                  type="text" 
                  className="w-full h-9 px-3 text-sm rounded-md border border-input bg-background"
                  value={mapping.rateCol}
                  onChange={(e) => setMapping({ ...mapping, rateCol: e.target.value.toUpperCase() })}
                  placeholder="e.g. D"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-primary">Purchase/Sales Ledger Col</label>
                <input 
                  type="text" 
                  className="w-full h-9 px-3 text-sm rounded-md border-2 border-primary/20 bg-background focus:border-primary transition-colors"
                  value={mapping.purchaseLedgerCol}
                  onChange={(e) => setMapping({ ...mapping, purchaseLedgerCol: e.target.value.toUpperCase() })}
                  placeholder="e.g. G"
                />
                <p className="text-[9px] text-muted-foreground italic">Use this if you don't have stock items.</p>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">Amount Col</label>
                <input 
                  type="text" 
                  className="w-full h-9 px-3 text-sm rounded-md border border-input bg-background"
                  value={mapping.amountCol}
                  onChange={(e) => setMapping({ ...mapping, amountCol: e.target.value.toUpperCase() })}
                  placeholder="e.g. E"
                />
              </div>
            </div>
            
            <div className="pt-2">
              <span className="text-[10px] font-bold uppercase text-muted-foreground block mb-2 underline decoration-primary/30">Tax Columns (Optional)</span>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground">CGST</label>
                  <input 
                    type="text" 
                    className="w-full h-8 px-2 text-xs rounded-md border border-input bg-background"
                    value={mapping.cgstCol}
                    onChange={(e) => setMapping({ ...mapping, cgstCol: e.target.value.toUpperCase() })}
                    placeholder="Col"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground">SGST</label>
                  <input 
                    type="text" 
                    className="w-full h-8 px-2 text-xs rounded-md border border-input bg-background"
                    value={mapping.sgstCol}
                    onChange={(e) => setMapping({ ...mapping, sgstCol: e.target.value.toUpperCase() })}
                    placeholder="Col"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground">IGST</label>
                  <input 
                    type="text" 
                    className="w-full h-8 px-2 text-xs rounded-md border border-input bg-background"
                    value={mapping.igstCol}
                    onChange={(e) => setMapping({ ...mapping, igstCol: e.target.value.toUpperCase() })}
                    placeholder="Col"
                  />
                </div>
              </div>
            </div>
          </div>

          {!isValid && (
            <div className="p-3 rounded-md bg-amber-50 border border-amber-200 flex gap-2 text-amber-800">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="text-[10px]">Please fill all required fields to proceed.</p>
            </div>
          )}

          <button 
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full" 
            disabled={!isValid}
            onClick={() => onMappingComplete(mapping)}
          >
            Process All Sheets <ArrowRight className="ml-2 w-4 h-4" />
          </button>
        </div>

        {/* Preview Table */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase text-muted-foreground">Excel Preview (First 15 Rows)</h4>
          <div className="border rounded-lg overflow-auto max-h-[500px] bg-muted/30">
            <table className="w-full text-[10px] border-collapse">
              <thead>
                <tr className="bg-muted">
                  <th className="border p-1 w-8"></th>
                  {Array.from({ length: 10 }).map((_, i) => (
                    <th key={i} className="border p-1 w-20 text-center font-mono">
                      {String.fromCharCode(65 + i)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewData.slice(0, 15).map((row, rIdx) => (
                  <tr key={rIdx}>
                    <td className="border p-1 bg-muted text-center font-mono font-bold">{rIdx + 1}</td>
                    {Array.from({ length: 10 }).map((_, cIdx) => (
                      <td key={cIdx} className="border p-1 bg-background truncate max-w-[80px]" title={row[cIdx]}>
                        {row[cIdx]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-muted-foreground italic">
            * Showing first 10 columns and 15 rows of the first sheet.
          </p>
        </div>
      </div>
    </div>
  );
};
