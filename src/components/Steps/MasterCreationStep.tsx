import React, { useState, useRef, useMemo, useEffect } from 'react';
import { PlusCircle, Book, Package, Download, Upload, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { Ledger, StockItem, TallyData } from '../../types';
import { generateLedgerXML, generateStockItemXML, generateMultiMasterXML } from '../../lib/tally';
import { toast } from 'sonner';

interface MasterCreationStepProps {
  onBack: () => void;
  tallyData: TallyData | null;
}

const GST_STATE_CODES: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '27': 'Maharashtra', '28': 'Andhra Pradesh', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep',
  '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana', '37': 'Andhra Pradesh (New)'
};

const COSTING_METHODS = ['At Zero Cost', 'Avg. Cost', 'FIFO', 'FIFO Perpetual', 'Last Purchase Cost', 'LIFO Annual', 'LIFO Perpetual', 'Monthly Avg. Cost', 'Std. Cost'];

export const MasterCreationStep = ({ onBack, tallyData }: MasterCreationStepProps) => {
  const [activeTab, setActiveTab] = useState<'manual' | 'excel'>('manual');
  const [type, setType] = useState<'LEDGER' | 'STOCKITEM'>('LEDGER');
  
  // Advanced Ledger State
  const [ledger, setLedger] = useState<any>({ 
    name: '', parent: 'Sundry Debtors', alias1: '', alias2: '', 
    address1: '', address2: '', gstin: '', state: '', registrationType: 'Unregistered' 
  });

  // Advanced Stock Item State
  const [stockItem, setStockItem] = useState<any>({ 
    name: '', parent: 'Primary', uom: 'Nos', alias1: '', alias2: '', 
    hsnCode: '', gstRate: '', costingMethod: 'Avg. Cost', gstApplicable: 'Not Applicable' 
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-fill Ledger fields based on GSTIN
  useEffect(() => {
    if (ledger.gstin && ledger.gstin.length >= 2) {
      const stateCode = ledger.gstin.substring(0, 2);
      const state = GST_STATE_CODES[stateCode] || '';
      setLedger(prev => ({ 
        ...prev, 
        state, 
        registrationType: 'Regular' 
      }));
    } else if (!ledger.gstin) {
      setLedger(prev => ({ ...prev, registrationType: 'Unregistered' }));
    }
  }, [ledger.gstin]);

  // Auto-fill Stock Item fields based on HSN
  useEffect(() => {
    setStockItem(prev => ({
      ...prev,
      gstApplicable: prev.hsnCode ? 'Applicable' : 'Not Applicable'
    }));
  }, [stockItem.hsnCode]);

  const ledgerGroups = useMemo(() => {
    if (!tallyData || !tallyData.ledgers || !Array.isArray(tallyData.ledgers)) return ['Sundry Debtors', 'Sundry Creditors', 'Bank Accounts', 'Cash-in-hand', 'Indirect Expenses'];
    const groups = new Set(tallyData.ledgers.map(l => l.parent).filter(Boolean));
    return Array.from(groups).sort();
  }, [tallyData]);

  const stockGroups = useMemo(() => {
    if (!tallyData || !tallyData.stockItems || !Array.isArray(tallyData.stockItems)) return ['Primary'];
    const groups = new Set(tallyData.stockItems.map(si => si.parent).filter(Boolean));
    return Array.from(groups).sort();
  }, [tallyData]);

  const handleDownload = () => {
    let xml = '';
    let filename = '';
    
    if (type === 'LEDGER') {
      if (!ledger.name) return;
      xml = generateLedgerXML(ledger);
      filename = `Ledger_${ledger.name.replace(/\s+/g, '_')}.xml`;
    } else {
      if (!stockItem.name) return;
      xml = generateStockItemXML(stockItem);
      filename = `StockItem_${stockItem.name.replace(/\s+/g, '_')}.xml`;
    }

    const blob = new Blob([xml], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('XML Generated successfully!');
  };

  const downloadLedgerTemplate = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Ledgers');
    
    const headers = [
      'Name', 'Alias 1', 'Alias 2', 'Parent_Group', 
      'Address 1', 'Address 2', 'GSTIN'
    ];
    worksheet.addRow(headers);
    worksheet.getRow(1).font = { bold: true };

    // Add dynamic lists if tallyData is available
    if (tallyData && tallyData.ledgers && Array.isArray(tallyData.ledgers) && tallyData.ledgers.length > 0) {
      const listSheet = workbook.addWorksheet('Lists');
      listSheet.state = 'veryHidden';

      const groups = [...new Set(tallyData.ledgers.map(l => l.parent).filter(Boolean))];
      if (groups.length === 0) groups.push('Primary', 'Sundry Debtors', 'Sundry Creditors');
      
      groups.forEach((g, i) => listSheet.getCell(`A${i + 1}`).value = g);

      const groupRange = `='Lists'!$A$1:$A$${groups.length}`;

      for (let i = 2; i <= 100; i++) {
        worksheet.getCell(`D${i}`).dataValidation = { type: 'list', formulae: [groupRange] };
      }
    }

    // Add sample data
    worksheet.addRow(['ABC Traders', 'ABC', '', 'Sundry Debtors', 'Street 1', 'City', '07AAAAA0000A1Z5']);
    worksheet.addRow(['XYZ Services', '', '', 'Sundry Creditors', 'Main Road', 'Mumbai', '27BBBBB1111B1Z1']);

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Tally_Ledger_Master_Template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadStockItemTemplate = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('StockItems');
    
    const headers = [
      'Name', 'Alias 1', 'Alias 2', 'Parent_Group', 
      'UOM', 'HSN_Code', 'GST_Rate', 'Costing_Method'
    ];
    worksheet.addRow(headers);
    worksheet.getRow(1).font = { bold: true };

    // Add dynamic lists
    const listSheet = workbook.addWorksheet('Lists');
    listSheet.state = 'veryHidden';

    const uoms = (tallyData && tallyData.stockItems) ? [...new Set(tallyData.stockItems.map(si => si.uom).filter(Boolean))] : [];
    if (uoms.length === 0) uoms.push('Nos', 'Pcs', 'Kg', 'Units', 'Box');

    const groups = (tallyData && tallyData.stockItems) ? [...new Set(tallyData.stockItems.map(si => si.parent).filter(Boolean))] : [];
    if (groups.length === 0) groups.push('Primary');

    const costingMethods = COSTING_METHODS;
    const gstRates = ['0%', '5%', '12%', '18%', '28%', 'Exempt', 'Nil Rated'];

    uoms.forEach((u, i) => listSheet.getCell(`A${i + 1}`).value = u);
    groups.forEach((g, i) => listSheet.getCell(`B${i + 1}`).value = g);
    costingMethods.forEach((m, i) => listSheet.getCell(`C${i + 1}`).value = m);
    gstRates.forEach((r, i) => listSheet.getCell(`D${i + 1}`).value = r);

    const uomRange = `='Lists'!$A$1:$A$${uoms.length}`;
    const groupRange = `='Lists'!$B$1:$B$${groups.length}`;
    const costingRange = `='Lists'!$C$1:$C$${costingMethods.length}`;
    const gstRateRange = `='Lists'!$D$1:$D$${gstRates.length}`;

    for (let i = 2; i <= 100; i++) {
      worksheet.getCell(`D${i}`).dataValidation = { type: 'list', formulae: [groupRange] };
      worksheet.getCell(`E${i}`).dataValidation = { type: 'list', formulae: [uomRange] };
      worksheet.getCell(`G${i}`).dataValidation = { type: 'list', formulae: [gstRateRange] };
      worksheet.getCell(`H${i}`).dataValidation = { type: 'list', formulae: [costingRange] };
    }

    // Add sample data
    worksheet.addRow(['Laptop Dell', 'Dell Lappy', '', 'Primary', 'Nos', '8471', '18%', 'Avg. Cost']);
    worksheet.addRow(['Mouse Wireless', '', '', 'Primary', 'Pcs', '8471', '12%', 'FIFO']);

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Tally_StockItem_Master_Template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      const masters = jsonData.map(row => {
        const name = row.Name || row.name;
        if (!name) return null;

        // Detect type based on columns if 'Type' is missing
        let rowType = String(row.Type || row.type || '').toUpperCase();
        if (!rowType) {
          if ('GSTIN' in row || 'Address 1' in row || 'address1' in row) {
            rowType = 'LEDGER';
          } else if ('UOM' in row || 'uom' in row || 'HSN_Code' in row || 'hsn_code' in row) {
            rowType = 'STOCKITEM';
          }
        }

        if (rowType.includes('LEDGER')) {
          const gstin = row.GSTIN || row.gstin || '';
          const stateCode = gstin.substring(0, 2);
          return {
            type: 'LEDGER' as const,
            data: {
              name,
              alias1: row['Alias 1'] || row.alias1 || '',
              alias2: row['Alias 2'] || row.alias2 || '',
              parent: row.Parent_Group || row.parent_group || 'Sundry Debtors',
              address1: row['Address 1'] || row.address1 || '',
              address2: row['Address 2'] || row.address2 || '',
              gstin,
              state: GST_STATE_CODES[stateCode] || '',
              registrationType: gstin ? 'Regular' : 'Unregistered'
            }
          };
        } else {
          const hsnCode = row.HSN_Code || row.hsn_code || '';
          return {
            type: 'STOCKITEM' as const,
            data: {
              name,
              alias1: row['Alias 1'] || row.alias1 || '',
              alias2: row['Alias 2'] || row.alias2 || '',
              parent: row.Parent_Group || row.parent_group || 'Primary',
              uom: row.UOM || row.uom || 'Nos',
              hsnCode,
              gstRate: row.GST_Rate || row.gst_rate || '',
              costingMethod: row.Costing_Method || row.costing_method || 'Avg. Cost',
              gstApplicable: hsnCode ? 'Applicable' : 'Not Applicable'
            }
          };
        }
      }).filter(Boolean);

      if (masters.length === 0) {
        toast.error('No valid masters found in Excel.');
        return;
      }

      const xml = generateMultiMasterXML(masters as any);
      const blob = new Blob([xml], { type: 'text/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Bulk_Masters_${Date.now()}.xml`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Generated XML for ${masters.length} masters!`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to process Excel file.');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="w-full max-w-2xl mx-auto bg-card text-card-foreground rounded-lg border shadow-sm p-6 space-y-6">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-semibold leading-none tracking-tight flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-primary" />
            Create New Master
          </h3>
          <button 
            onClick={onBack}
            className="text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            Back
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          Generate XML to create masters in Tally with advanced fields.
        </p>
      </div>

      <div className="flex p-1 bg-muted rounded-lg">
        <button 
          onClick={() => setActiveTab('manual')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${activeTab === 'manual' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
        >
          Manual Entry
        </button>
        <button 
          onClick={() => setActiveTab('excel')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${activeTab === 'excel' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
        >
          Excel Bulk Upload
        </button>
      </div>

      {activeTab === 'manual' ? (
        <div className="space-y-6">
          <div className="flex p-1 bg-muted/50 rounded-lg">
            <button 
              onClick={() => setType('LEDGER')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all ${type === 'LEDGER' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Book className="w-4 h-4" /> Ledger
            </button>
            <button 
              onClick={() => setType('STOCKITEM')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all ${type === 'STOCKITEM' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Package className="w-4 h-4" /> Stock Item
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {type === 'LEDGER' ? (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Ledger Name *</label>
                  <input 
                    className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background"
                    value={ledger.name}
                    onChange={(e) => setLedger({ ...ledger, name: e.target.value })}
                    placeholder="e.g. ABC Corp"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Under Group *</label>
                  <input 
                    list="ledger-groups"
                    className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background"
                    value={ledger.parent}
                    onChange={(e) => setLedger({ ...ledger, parent: e.target.value })}
                    placeholder="Select or type group"
                  />
                  <datalist id="ledger-groups">
                    {ledgerGroups.map(g => <option key={g} value={g} />)}
                  </datalist>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Alias 1</label>
                  <input 
                    className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background"
                    value={ledger.alias1}
                    onChange={(e) => setLedger({ ...ledger, alias1: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Alias 2</label>
                  <input 
                    className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background"
                    value={ledger.alias2}
                    onChange={(e) => setLedger({ ...ledger, alias2: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Address Line 1</label>
                  <input 
                    className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background"
                    value={ledger.address1}
                    onChange={(e) => setLedger({ ...ledger, address1: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Address Line 2</label>
                  <input 
                    className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background"
                    value={ledger.address2}
                    onChange={(e) => setLedger({ ...ledger, address2: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">GSTIN</label>
                  <input 
                    className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background"
                    value={ledger.gstin}
                    onChange={(e) => setLedger({ ...ledger, gstin: e.target.value.toUpperCase() })}
                    placeholder="e.g. 07AAAAA0000A1Z5"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">State (Auto-filled)</label>
                  <input 
                    className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-muted"
                    value={ledger.state}
                    readOnly
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Registration Type</label>
                  <input 
                    className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-muted"
                    value={ledger.registrationType}
                    readOnly
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Stock Item Name *</label>
                  <input 
                    className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background"
                    value={stockItem.name}
                    onChange={(e) => setStockItem({ ...stockItem, name: e.target.value })}
                    placeholder="e.g. Laptop Dell"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Under Group *</label>
                  <input 
                    list="stock-groups"
                    className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background"
                    value={stockItem.parent}
                    onChange={(e) => setStockItem({ ...stockItem, parent: e.target.value })}
                    placeholder="Select or type group"
                  />
                  <datalist id="stock-groups">
                    {stockGroups.map(g => <option key={g} value={g} />)}
                  </datalist>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Alias 1</label>
                  <input 
                    className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background"
                    value={stockItem.alias1}
                    onChange={(e) => setStockItem({ ...stockItem, alias1: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Alias 2</label>
                  <input 
                    className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background"
                    value={stockItem.alias2}
                    onChange={(e) => setStockItem({ ...stockItem, alias2: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Unit of Measure (UOM)</label>
                  <input 
                    className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background"
                    value={stockItem.uom}
                    onChange={(e) => setStockItem({ ...stockItem, uom: e.target.value })}
                    placeholder="e.g. Nos, Pcs, Kg"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">HSN Code</label>
                  <input 
                    className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background"
                    value={stockItem.hsnCode}
                    onChange={(e) => setStockItem({ ...stockItem, hsnCode: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">GST Rate (%)</label>
                  <input 
                    className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background"
                    value={stockItem.gstRate}
                    onChange={(e) => setStockItem({ ...stockItem, gstRate: e.target.value })}
                    placeholder="e.g. 18%"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Costing Method</label>
                  <select 
                    className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background"
                    value={stockItem.costingMethod}
                    onChange={(e) => setStockItem({ ...stockItem, costingMethod: e.target.value })}
                  >
                    {COSTING_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">GST Applicable (Auto)</label>
                  <input 
                    className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-muted"
                    value={stockItem.gstApplicable}
                    readOnly
                  />
                </div>
              </>
            )}
          </div>

          <button 
            onClick={handleDownload}
            disabled={type === 'LEDGER' ? !ledger.name : !stockItem.name}
            className="w-full inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 disabled:opacity-50"
          >
            <Download className="mr-2 w-4 h-4" /> Download XML for Tally
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-8 flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-muted/50 transition-colors"
          >
            <Upload className="w-10 h-10 text-muted-foreground" />
            <div className="text-center">
              <p className="font-medium">Click to upload Advanced Masters Excel</p>
              <p className="text-xs text-muted-foreground mt-1">Supports Aliases, GSTIN, HSN, Address, etc.</p>
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleExcelUpload} 
              className="hidden" 
              accept=".xlsx, .xls"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button 
              className="flex flex-col items-center justify-center gap-2 p-4 border rounded-lg hover:bg-muted/50 transition-colors text-primary"
              onClick={downloadLedgerTemplate}
            >
              <Book className="w-5 h-5" />
              <span className="text-xs font-medium">Ledger Template</span>
            </button>
            <button 
              className="flex flex-col items-center justify-center gap-2 p-4 border rounded-lg hover:bg-muted/50 transition-colors text-primary"
              onClick={downloadStockItemTemplate}
            >
              <Package className="w-5 h-5" />
              <span className="text-xs font-medium">Stock Item Template</span>
            </button>
          </div>
        </div>
      )}

      <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800">
        <b>How to import:</b> In Tally, go to Import Data &gt; Masters &gt; Select the generated XML file.
      </div>
    </div>
  );
};
