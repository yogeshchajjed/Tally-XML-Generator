/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { Toaster, toast } from 'sonner';
import { onAuthStateChanged, User } from 'firebase/auth';
import { LogIn, LogOut, User as UserIcon, Sparkles, Brain } from 'lucide-react';

import { parseTallyXML, generateTallyXML, fetchFromTally } from './lib/tally';
import { suggestLedgersBatch } from './lib/gemini';
import { TallyData, Voucher } from './types';
import { auth, signInWithGoogle, logout, db } from './firebase';
import { collection, addDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore';

import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { TallyDataStep } from './components/Steps/TallyDataStep';
import { VoucherTypeStep } from './components/Steps/VoucherTypeStep';
import { AccountSelectStep } from './components/Steps/AccountSelectStep';
import { ExcelUploadStep } from './components/Steps/ExcelUploadStep';
import { ReviewStep } from './components/Steps/ReviewStep';
import { MasterCreationStep } from './components/Steps/MasterCreationStep';
import { ColumnMappingStep } from './components/Steps/ColumnMappingStep';
import { DoneStep } from './components/Steps/DoneStep';
import { GeminiAssistant } from './components/GeminiAssistant';

type Step = 'TALLY_DATA' | 'VOUCHER_TYPE' | 'ACCOUNT_SELECT' | 'EXCEL_UPLOAD' | 'REVIEW' | 'DONE' | 'MASTER_CREATION' | 'COLUMN_MAPPING';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [step, setStep] = useState<Step>('TALLY_DATA');
  const [tallyData, setTallyData] = useState<TallyData | null>(null);
  const [selectedVoucherType, setSelectedVoucherType] = useState<string>('');
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [duplicates, setDuplicates] = useState<Voucher[]>([]);
  const [rawStatementData, setRawStatementData] = useState<any[]>([]);
  const [statementKeys, setStatementKeys] = useState<string[]>([]);
  const [initialMapping, setInitialMapping] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const tallyFileRef = useRef<HTMLInputElement>(null);
  const excelFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSaveToCloud = async () => {
    if (!user || vouchers.length === 0) return;
    setIsSaving(true);
    try {
      const batch = vouchers.map(v => ({
        ...v,
        userId: user.uid,
        createdAt: serverTimestamp()
      }));
      
      // Save in small chunks to Firestore
      const chunkSize = 10;
      for (let i = 0; i < batch.length; i += chunkSize) {
        const chunk = batch.slice(i, i + chunkSize);
        await Promise.all(chunk.map(v => addDoc(collection(db, 'vouchers'), v)));
      }
      
      toast.success('Vouchers saved to cloud successfully');
    } catch (error) {
      console.error('Error saving to Firestore:', error);
      toast.error('Failed to save vouchers to cloud');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredAccounts = React.useMemo(() => {
    if (!tallyData) return [];
    
    // Try to find Bank/Cash accounts with a broad filter
    const bankCash = tallyData.ledgers.filter(l => {
      const p = (l.parent || '').toLowerCase();
      const n = (l.name || '').toLowerCase();
      return p.includes('bank') || 
             p.includes('cash') || 
             p.includes('od') || 
             p.includes('occ') ||
             n.includes('bank') ||
             n.includes('cash');
    });

    // If filter finds something, use it. Otherwise fallback to all ledgers
    // so the user is never stuck with an empty list.
    return bankCash.length > 0 ? bankCash : tallyData.ledgers;
  }, [tallyData]);

  const ledgerOptions = React.useMemo(() => {
    if (!tallyData) return null;
    return tallyData.ledgers.slice(0, 50).map(l => (
      <option key={l.name} value={l.name} />
    ));
  }, [tallyData]);

  const accountOptions = React.useMemo(() => {
    return filteredAccounts.map(acc => (
      <option key={acc.name} value={acc.name}>
        {acc.name}
      </option>
    ));
  }, [filteredAccounts]);

  const handleTallyUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      setIsProcessing(true);
      let totalLedgers = 0;
      let totalTransactions = 0;

      for (const file of Array.from(files) as File[]) {
        // Robust file reading with UTF-16 detection
        const buffer = await file.arrayBuffer();
        const uint8 = new Uint8Array(buffer);
        let encoding = 'utf-8';
        
        // Check for UTF-16 BOM
        if (uint8[0] === 0xFF && uint8[1] === 0xFE) encoding = 'utf-16le';
        else if (uint8[0] === 0xFE && uint8[1] === 0xFF) encoding = 'utf-16be';
        // Check for null bytes which often indicate UTF-16 if no BOM
        else if (uint8.slice(0, 100).some(b => b === 0)) encoding = 'utf-16le';

        const decoder = new TextDecoder(encoding);
        const text = decoder.decode(buffer);

        if (!text.trim()) continue;
        const data = await parseTallyXML(text);
        
        // Merge with existing data if any
        setTallyData(prev => {
          const base = prev || { voucherTypes: [], ledgers: [], transactions: [] };
          return {
            voucherTypes: [...new Set([...base.voucherTypes, ...data.voucherTypes])],
            ledgers: Array.from(new Map([...base.ledgers, ...data.ledgers].map(l => [l.name, l])).values()),
            transactions: [...(base.transactions || []), ...(data.transactions || [])]
          };
        });

        totalLedgers += data.ledgers.length;
        totalTransactions += data.transactions.length;
      }

      setStep('VOUCHER_TYPE');
      toast.success(`Loaded data successfully. New Ledgers: ${totalLedgers}, New Transactions: ${totalTransactions}`);
      
      // Reset input value so same file can be uploaded again if needed
      if (e.target) e.target.value = '';
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Failed to parse Tally XML');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDirectConnect = async (port: string) => {
    try {
      setIsProcessing(true);
      const data = await fetchFromTally(port);
      if (data.ledgers.length === 0) throw new Error('No ledgers found in Tally.');

      setTallyData(data);
      setStep('VOUCHER_TYPE');
      toast.success(`Connected to Tally! Loaded ${data.ledgers.length} ledgers.`);
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Failed to connect to Tally');
    } finally {
      setIsProcessing(false);
    }
  };

  const processMappedVouchers = (mappedVouchers: Voucher[]) => {
    if (mappedVouchers.length === 0) {
      setIsProcessing(false);
      toast.error(`No ${selectedVoucherType} entries found in statement.`);
      return;
    }

    // Advanced Duplicate Detection Logic
    const existingTransactions = tallyData?.transactions || [];
    const newVouchers: Voucher[] = [];
    const foundDuplicates: (Voucher & { duplicateReason?: string })[] = [];

    mappedVouchers.forEach(v => {
      // Find potential matches in Tally data
      const matches = existingTransactions.filter(ex => {
        const dateMatch = ex.date.replace(/-/g, '') === v.date.replace(/-/g, '');
        const amountMatch = Math.abs(ex.amount - v.amount) < 0.01;
        return dateMatch && amountMatch;
      });

      if (matches.length > 0) {
        // Check if there are multiple entries with same date and amount in the statement itself
        const sameDayAmountInStatement = mappedVouchers.filter(ov => 
          ov.date === v.date && 
          Math.abs(ov.amount - v.amount) < 0.01
        ).length;

        if (sameDayAmountInStatement > 1) {
          // Case 1: Multiple entries with same date/amount - must check narration
          const exactMatch = matches.find(ex => {
            const nar1 = ex.narration.toLowerCase().trim();
            const nar2 = v.narration.toLowerCase().trim();
            return nar1.includes(nar2) || nar2.includes(nar1);
          });
          
          if (exactMatch) {
            foundDuplicates.push({ ...v, duplicateReason: 'Same Date, Amount & Narration (Multiple entries on this date)' });
          } else {
            newVouchers.push(v);
          }
        } else {
          // Case 2: Single entry with this date/amount - simple match is enough
          foundDuplicates.push({ ...v, duplicateReason: 'Same Date & Amount' });
        }
      } else {
        newVouchers.push(v);
      }
    });

    setDuplicates(foundDuplicates);
    setVouchers(newVouchers);
    setCurrentPage(1);
    setStep('EXCEL_UPLOAD');
    
    if (newVouchers.length > 0) {
      runAIMapping(newVouchers);
      toast.success(`Found ${newVouchers.length} entries. ${foundDuplicates.length} duplicates skipped.`);
    } else {
      setIsProcessing(false);
      toast.info(`All ${foundDuplicates.length} entries were identified as duplicates.`);
    }
    
    if (foundDuplicates.length > 0) {
      toast.info('Click "Download Duplicate Report" in the upload step to see skipped entries.', { duration: 5000 });
    }
  };

  const parseStatementRow = (row: any, keys: string[], mapping: any, voucherType: string, formatDate: (v: any) => string) => {
    const parseAmt = (val: any) => {
      if (typeof val === 'number') return val;
      if (!val) return 0;
      // Remove everything except numbers, dots, and minus signs
      const cleaned = String(val).replace(/[^0-9.-]/g, '');
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? 0 : parsed;
    };

    let withdrawal = 0;
    let deposit = 0;

    if (mapping.withdrawal && mapping.deposit && mapping.withdrawal !== mapping.deposit) {
      const wVal = parseAmt(row[mapping.withdrawal]);
      const dVal = parseAmt(row[mapping.deposit]);
      
      // If both columns have values, use the larger one or respect signs
      // Usually one is 0 or empty
      withdrawal = Math.abs(wVal);
      deposit = Math.abs(dVal);
      
      // If both are non-zero, it's a weird format, but we'll take the one that was actually mapped
      if (wVal !== 0 && dVal === 0) {
        withdrawal = Math.abs(wVal);
        deposit = 0;
      } else if (dVal !== 0 && wVal === 0) {
        deposit = Math.abs(dVal);
        withdrawal = 0;
      }
    } else {
      const amountKey = mapping.amount || mapping.withdrawal || mapping.deposit;
      if (amountKey) {
        const rawAmt = parseAmt(row[amountKey]);
        const amt = Math.abs(rawAmt);
        const type = mapping.type ? String(row[mapping.type] || '').toLowerCase() : '';
        const narration = String(row[mapping.narration] || '').toLowerCase();
        
        const isDr = type.includes('dr') || type.includes('withdrawal') || type.includes('payment') || narration.includes('dr');
        const isCr = type.includes('cr') || type.includes('deposit') || type.includes('receipt') || narration.includes('cr');

        if (isDr) {
          withdrawal = amt;
        } else if (isCr) {
          deposit = amt;
        } else {
          // Fallback to sign
          if (rawAmt < 0) withdrawal = amt;
          else deposit = amt;
        }
      }
    }

    const amount = withdrawal || deposit;
    if (!amount || amount === 0) return null;

    const isPayment = withdrawal > 0;
    const isReceipt = deposit > 0;
    const isVoucherPayment = voucherType.toLowerCase().includes('payment');
    const isVoucherReceipt = voucherType.toLowerCase().includes('receipt');
    
    // Special case: if it's a Contra entry, we might want both, but for now we follow the selected type
    const matchesType = (isVoucherPayment && isPayment) || (isVoucherReceipt && isReceipt);
    
    if (!matchesType) return null;

    return {
      date: formatDate(row[mapping.date]),
      voucherType: voucherType,
      voucherNumber: '',
      ledgerName: selectedAccount,
      amount,
      narration: String(row[mapping.narration] || ''),
      narration2: 'From Bank Statement',
      isDebit: isVoucherReceipt,
      secondLedger: ''
    };
  };

  const handleManualMappingComplete = (mapping: any) => {
    setIsProcessing(true);
    try {
      const formatDate = (val: any) => {
        if (!val) return new Date().toISOString().split('T')[0];
        if (val instanceof Date) {
          const offset = val.getTimezoneOffset();
          const localDate = new Date(val.getTime() - (offset * 60 * 1000));
          return localDate.toISOString().split('T')[0];
        }
        return String(val);
      };

      const mappedVouchers = rawStatementData
        .map(row => parseStatementRow(row, statementKeys, mapping, selectedVoucherType, formatDate))
        .filter(Boolean) as Voucher[];

      processMappedVouchers(mappedVouchers);
    } catch (error) {
      console.error(error);
      toast.error('Failed to process manual mapping');
      setIsProcessing(false);
    }
  };

  const handleStatementUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessing(true);
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { cellDates: true });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      
      // Get all headers correctly from the first row of the worksheet
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
      if (!rows || rows.length === 0) {
        toast.error('The uploaded file is empty.');
        setIsProcessing(false);
        return;
      }
      
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as any[];

      const formatDate = (val: any) => {
        if (!val) return new Date().toISOString().split('T')[0];
        if (val instanceof Date) {
          const offset = val.getTimezoneOffset();
          const localDate = new Date(val.getTime() - (offset * 60 * 1000));
          return localDate.toISOString().split('T')[0];
        }
        return String(val);
      };

      const keys = rows[0].map((k, i) => k ? String(k).trim() : `Column ${i + 1}`);
      
      // Try to identify columns
      const dateKey = keys.find(k => {
        const lk = k.toLowerCase();
        return lk.includes('date') || lk.includes('tran date') || lk.includes('value date');
      });
      
      const narrationKey = keys.find(k => {
        const lk = k.toLowerCase();
        return lk.includes('narration') || lk.includes('description') || lk.includes('particulars') || lk.includes('remarks');
      });
      
      let withdrawalKey = keys.find(k => {
        const lk = k.toLowerCase();
        return lk.includes('withdrawal') || lk.includes('debit') || lk.includes('payment') || (lk.includes('dr') && !lk.includes('dr/cr'));
      });
      
      let depositKey = keys.find(k => {
        const lk = k.toLowerCase();
        return lk.includes('deposit') || lk.includes('credit') || lk.includes('receipt') || (lk.includes('cr') && !lk.includes('dr/cr'));
      });

      const autoMapping = {
        date: dateKey || '',
        narration: narrationKey || '',
        withdrawal: withdrawalKey || '',
        deposit: depositKey || '',
        amount: keys.find(k => k.toLowerCase().includes('amount') || k.toLowerCase().includes('value')) || '',
        type: keys.find(k => k.toLowerCase().includes('type') || k.toLowerCase().includes('dr/cr')) || ''
      };

      setRawStatementData(jsonData);
      setStatementKeys(keys);
      setInitialMapping(autoMapping);
      setStep('COLUMN_MAPPING');
      
      if (!dateKey || !narrationKey || (!withdrawalKey && !depositKey && !autoMapping.amount)) {
        toast.info('Please map the columns manually.');
      } else {
        toast.success('Columns auto-detected. Please verify and proceed.');
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to parse Statement file');
    } finally {
      setIsProcessing(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessing(true);
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { cellDates: true });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      const formatDate = (val: any) => {
        if (!val) return new Date().toISOString().split('T')[0];
        if (val instanceof Date) {
          // Adjust for timezone offset to get local date string
          const offset = val.getTimezoneOffset();
          const localDate = new Date(val.getTime() - (offset * 60 * 1000));
          return localDate.toISOString().split('T')[0];
        }
        return String(val);
      };

      const mappedVouchers: Voucher[] = jsonData.map((row: any) => {
        const voucher: Voucher = {
          date: formatDate(row.Date || row.date),
          voucherType: selectedVoucherType,
          voucherNumber: String(row['Voucher Number'] || row.voucher_number || ''),
          ledgerName: selectedAccount,
          amount: Math.abs(parseFloat(row.Amount || row.amount || 0)),
          narration: row.Narration || row.narration || '',
          narration2: row['Narration 2'] || row.narration2 || '',
          isDebit: selectedVoucherType.toLowerCase().includes('receipt') || selectedVoucherType.toLowerCase().includes('sales'),
          secondLedger: row['Paid To'] || row['Received From'] || row['Customer'] || row['Supplier'] || row['Debit Ledger'] || row['Credit Ledger'] || row['To Account'] || row['From Account'] || ''
        };

        // Handle Inventory for Sales/Purchase
        if (selectedVoucherType.toLowerCase().includes('sales') || selectedVoucherType.toLowerCase().includes('purchase')) {
          const stockItem = row['Stock Item'] || row['stock_item'];
          const quantity = parseFloat(row['Quantity'] || row['qty'] || 0);
          const rate = parseFloat(row['Rate'] || row['rate'] || 0);
          
          if (stockItem && quantity > 0) {
            voucher.inventoryEntries = [{
              stockItemName: stockItem,
              quantity,
              rate,
              amount: quantity * rate
            }];
            // If amount is not provided, calculate it
            if (!voucher.amount) voucher.amount = quantity * rate;
          }
        }

        return voucher;
      });

      // Advanced Duplicate Detection Logic
      const existingTransactions = tallyData?.transactions || [];
      const finalVouchers: Voucher[] = [];
      const foundDuplicates: (Voucher & { duplicateReason?: string })[] = [];

      mappedVouchers.forEach(v => {
        const matches = existingTransactions.filter(ex => {
          const dateMatch = ex.date.replace(/-/g, '') === v.date.replace(/-/g, '');
          const amountMatch = Math.abs(ex.amount - v.amount) < 0.01;
          return dateMatch && amountMatch;
        });

        if (matches.length > 0) {
          const sameDayAmountInStatement = mappedVouchers.filter(ov => 
            ov.date === v.date && 
            Math.abs(ov.amount - v.amount) < 0.01
          ).length;

          if (sameDayAmountInStatement > 1) {
            const exactMatch = matches.find(ex => {
              const nar1 = ex.narration.toLowerCase().trim();
              const nar2 = v.narration.toLowerCase().trim();
              return nar1.includes(nar2) || nar2.includes(nar1);
            });
            
            if (exactMatch) {
              foundDuplicates.push({ ...v, duplicateReason: 'Same Date, Amount & Narration (Multiple entries on this date)' });
            } else {
              finalVouchers.push(v);
            }
          } else {
            foundDuplicates.push({ ...v, duplicateReason: 'Same Date & Amount' });
          }
        } else {
          finalVouchers.push(v);
        }
      });

      setDuplicates(foundDuplicates);
      setVouchers(finalVouchers);
      setCurrentPage(1);
      setStep('REVIEW');
      runAIMapping(finalVouchers);
    } catch (error) {
      console.error(error);
      toast.error('Failed to parse Excel file');
    } finally {
      setIsProcessing(false);
    }
  };

  const runAIMapping = async (initialVouchers: Voucher[]) => {
    if (!tallyData) return;
    setIsProcessing(true);
    setProgress(0);
    const updatedVouchers = [...initialVouchers];
    const ledgerNames = tallyData.ledgers.map(l => l.name);
    const batchSize = 50; // Larger batch size
    const concurrencyLimit = 3; // Process 3 batches in parallel

    // Prepare historical context for AI
    const previousVouchers = (tallyData.transactions || [])
      .filter(t => t.voucherType === selectedVoucherType)
      .slice(-30) // Balanced context size
      .map(t => ({
        narration: t.narration,
        ledger: t.ledgerName
      }));

    const batches = [];
    for (let i = 0; i < updatedVouchers.length; i += batchSize) {
      batches.push({
        index: i,
        data: updatedVouchers.slice(i, i + batchSize)
      });
    }

    let completedCount = 0;
    
    // Process in chunks of concurrencyLimit
    for (let i = 0; i < batches.length; i += concurrencyLimit) {
      const currentBatchGroup = batches.slice(i, i + concurrencyLimit);
      
      await Promise.all(currentBatchGroup.map(async (batch) => {
        try {
          const narrations = batch.data.map(v => v.narration);
          const suggestions = await suggestLedgersBatch(narrations, ledgerNames, previousVouchers);
          
          suggestions.forEach((suggestion, sIndex) => {
            const actualIndex = batch.index + sIndex;
            if (actualIndex < updatedVouchers.length && suggestion && suggestion !== "UNKNOWN") {
              updatedVouchers[actualIndex] = { ...updatedVouchers[actualIndex], secondLedger: suggestion };
            }
          });
        } catch (err) {
          console.error("Batch processing error:", err);
        } finally {
          completedCount += batch.data.length;
          const currentProgress = Math.round((completedCount / updatedVouchers.length) * 100);
          setProgress(Math.min(currentProgress, 99));
          setVouchers([...updatedVouchers]);
        }
      }));
    }
    
    setIsProcessing(false);
    setProgress(100);
    toast.success('AI Ledger mapping complete');
  };

  const handleDownload = () => {
    const xml = generateTallyXML(vouchers);
    const blob = new Blob([xml], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Tally_Import_${selectedVoucherType}_${new Date().getTime()}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStep('DONE');
  };

  const handleDownloadDuplicates = async () => {
    if (duplicates.length === 0) return;
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Duplicates');
    
    const headers = ['Date', 'Voucher Type', 'Amount', 'Narration', 'Ledger Name', 'Reason for Duplicate'];
    worksheet.addRow(headers);
    worksheet.getRow(1).font = { bold: true };
    
    duplicates.forEach(v => {
      worksheet.addRow([
        v.date, 
        v.voucherType, 
        v.amount, 
        v.narration, 
        v.ledgerName, 
        (v as any).duplicateReason || 'Already exists in Tally'
      ]);
    });
    
    // Auto-filter and adjust column widths
    worksheet.columns.forEach(column => {
      column.width = 20;
    });
    worksheet.getColumn(4).width = 40; // Narration
    worksheet.getColumn(6).width = 50; // Reason
    
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Duplicate_Entries_Report_${new Date().getTime()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRestart = () => {
    if (window.confirm('Are you sure you want to restart the entire process? All current progress will be lost.')) {
      setStep('TALLY_DATA');
      setTallyData(null);
      setSelectedVoucherType('');
      setSelectedAccount('');
      setVouchers([]);
      setDuplicates([]);
      setRawStatementData([]);
      setStatementKeys([]);
      setInitialMapping(null);
      setProgress(0);
      setCurrentPage(1);
      toast.success('Process restarted successfully');
    }
  };

  const paginatedVouchers = React.useMemo(() => {
    return vouchers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [vouchers, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(vouchers.length / itemsPerPage);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-muted/30 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-card p-8 rounded-2xl border shadow-xl space-y-8 text-center">
          <div className="space-y-2">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
              <Sparkles className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Tally XML Generator</h1>
            <p className="text-muted-foreground">Sign in to start converting your data</p>
          </div>
          <button 
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 bg-primary text-primary-foreground hover:bg-primary/90 h-12 px-6 rounded-xl font-semibold transition-all shadow-lg hover:shadow-primary/20"
          >
            <LogIn className="w-5 h-5" />
            Sign in with Google
          </button>
          <div className="pt-4 border-t text-xs text-muted-foreground">
            Securely powered by Firebase & Gemini AI
          </div>
        </div>
      </div>
    );
  }

  return (
    <React.Fragment>
      <Toaster position="top-center" />
      <div className="min-h-screen bg-muted/30 p-4 md:p-8">
        <div className="max-w-[95%] mx-auto mb-6 flex items-center justify-between bg-card p-3 px-6 rounded-2xl border shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
              <UserIcon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-none">{user.displayName}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={handleRestart}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary transition-colors px-3 py-1.5 rounded-lg hover:bg-primary/5"
            >
              <Sparkles className="w-4 h-4" />
              Restart Process
            </button>
            <button 
              onClick={logout}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>

        {step === 'REVIEW' && (
          <datalist id="ledger-list">
            {ledgerOptions}
          </datalist>
        )}
        <Header step={step} />
        
        {step === 'TALLY_DATA' && (
          <TallyDataStep 
            onUpload={handleTallyUpload} 
            onDirectConnect={handleDirectConnect}
            isProcessing={isProcessing}
            fileRef={tallyFileRef} 
            onStepChange={setStep}
          />
        )}
        
        {step === 'MASTER_CREATION' && (
          <MasterCreationStep onBack={() => setStep('TALLY_DATA')} tallyData={tallyData} />
        )}
        
        {step === 'VOUCHER_TYPE' && (
          <VoucherTypeStep 
            voucherTypes={tallyData?.voucherTypes || []} 
            selected={selectedVoucherType} 
            onSelect={setSelectedVoucherType} 
            onContinue={() => setStep('ACCOUNT_SELECT')} 
            onBack={() => setStep('TALLY_DATA')}
          />
        )}
        
        {step === 'ACCOUNT_SELECT' && (
          <AccountSelectStep 
            voucherType={selectedVoucherType} 
            accounts={filteredAccounts} 
            selected={selectedAccount} 
            onSelect={setSelectedAccount} 
            onContinue={() => setStep('EXCEL_UPLOAD')} 
            onBack={() => setStep('VOUCHER_TYPE')}
            options={accountOptions}
            onStatementUpload={handleStatementUpload}
            isProcessing={isProcessing}
          />
        )}

        {step === 'COLUMN_MAPPING' && (
          <ColumnMappingStep 
            keys={statementKeys}
            initialMapping={initialMapping}
            onMappingComplete={handleManualMappingComplete}
            onBack={() => setStep('ACCOUNT_SELECT')}
          />
        )}
        
        {step === 'EXCEL_UPLOAD' && (
          <ExcelUploadStep 
            onUpload={handleExcelUpload} 
            fileRef={excelFileRef} 
            onBack={() => setStep('ACCOUNT_SELECT')} 
            voucherType={selectedVoucherType}
            tallyData={tallyData}
            vouchers={vouchers}
            duplicates={duplicates}
            onDownloadDuplicates={handleDownloadDuplicates}
            isProcessing={isProcessing}
            progress={progress}
            onContinue={() => setStep('REVIEW')}
          />
        )}
        
        {step === 'REVIEW' && (
          <ReviewStep 
            vouchers={vouchers}
            duplicates={duplicates}
            paginatedVouchers={paginatedVouchers}
            isProcessing={isProcessing}
            isSaving={isSaving}
            progress={progress}
            onDownload={handleDownload}
            onDownloadExcel={() => {
              toast.info("Generating Excel...");
              const excelBtn = document.querySelector('[data-excel-download-btn]') as HTMLButtonElement;
              if (excelBtn) {
                excelBtn.click();
              } else {
                toast.error("Excel generator not ready. Please go back to upload step.");
              }
            }}
            onDownloadDuplicates={handleDownloadDuplicates}
            onSaveToCloud={handleSaveToCloud}
            onBack={() => setStep('EXCEL_UPLOAD')}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            onLedgerChange={(index, val) => {
              const updated = [...vouchers];
              updated[index].secondLedger = val;
              setVouchers(updated);
            }}
            itemsPerPage={itemsPerPage}
          />
        )}
        
        {step === 'DONE' && <DoneStep onStartOver={() => setStep('TALLY_DATA')} onNewExcel={() => setStep('EXCEL_UPLOAD')} />}
        
        <Footer />
        <GeminiAssistant context={`Current step: ${step}. Vouchers count: ${vouchers.length}. Selected Voucher Type: ${selectedVoucherType}. Historical Transactions: ${tallyData?.transactions?.length || 0}.`} />
      </div>
    </React.Fragment>
  );
}
