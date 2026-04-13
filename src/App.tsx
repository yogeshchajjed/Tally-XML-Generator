/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import * as pdfjs from 'pdfjs-dist';
import { Toaster, toast } from 'sonner';
import { onAuthStateChanged, User } from 'firebase/auth';
import { LogIn, LogOut, User as UserIcon, Sparkles, Brain } from 'lucide-react';

import { parseTallyXML, generateTallyXML, fetchFromTally, generateMultiMasterXML } from './lib/tally';
import { suggestLedgersBatch, parseBankStatementPDF, parseBillPDF } from './lib/gemini';
import { TallyData, Voucher, LedgerEntry, InventoryEntry } from './types';
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
import { PDFPageRangeStep } from './components/Steps/PDFPageRangeStep';
import { DoneStep } from './components/Steps/DoneStep';
import { GeminiAssistant } from './components/GeminiAssistant';

type Step = 'TALLY_DATA' | 'VOUCHER_TYPE' | 'ACCOUNT_SELECT' | 'EXCEL_UPLOAD' | 'REVIEW' | 'DONE' | 'MASTER_CREATION' | 'COLUMN_MAPPING' | 'PDF_PAGE_RANGE';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [step, setStep] = useState<Step>('TALLY_DATA');

  useEffect(() => {
    console.log('Step changed to:', step);
  }, [step]);

  // Initialize PDF.js worker once
  useEffect(() => {
    try {
      const version = '5.6.205';
      const workerUrl = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      console.log('PDF Worker initialized:', workerUrl);
    } catch (err) {
      console.error('Failed to initialize PDF worker:', err);
    }
  }, []);
  const [tallyData, setTallyData] = useState<TallyData | null>(null);
  const [selectedVoucherType, setSelectedVoucherType] = useState<string>('');
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [duplicates, setDuplicates] = useState<Voucher[]>([]);
  const [rawStatementData, setRawStatementData] = useState<any[]>([]);
  const [statementKeys, setStatementKeys] = useState<string[]>([]);
  const [initialMapping, setInitialMapping] = useState<any>(null);
  const [pdfFile, setPdfFile] = useState<{ file: File, totalPages: number } | null>(null);
  const [pdfPassword, setPdfPassword] = useState<string>('');
  const [isPasswordRequired, setIsPasswordRequired] = useState(false);
  const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null);
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
      if (val === null || val === undefined) return 0;
      const str = String(val).trim();
      if (!str) return 0;
      
      // If it's "NA", "-", or any other non-numeric placeholder, treat as 0
      if (['na', 'n/a', '-', '--', 'nil', 'null', '.'].includes(str.toLowerCase())) return 0;
      
      // Remove everything except numbers, dots, and minus signs
      // Handle European format if needed (e.g. 1.234,56 -> 1234.56)
      let cleaned = str;
      if (str.includes(',') && str.includes('.') && str.lastIndexOf(',') > str.lastIndexOf('.')) {
        // Likely European: 1.234,56
        cleaned = str.replace(/\./g, '').replace(',', '.');
      } else {
        // Likely Standard: 1,234.56
        cleaned = str.replace(/,/g, '');
      }
      
      cleaned = cleaned.replace(/[^0-9.-]/g, '');
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? 0 : parsed;
    };

    let withdrawal = 0;
    let deposit = 0;

    const hasWithdrawalMapping = !!mapping.withdrawal;
    const hasDepositMapping = !!mapping.deposit;

    if (hasWithdrawalMapping && hasDepositMapping && mapping.withdrawal !== mapping.deposit) {
      // Case 1: Both columns are mapped separately
      const wVal = parseAmt(row[mapping.withdrawal]);
      const dVal = parseAmt(row[mapping.deposit]);
      
      withdrawal = Math.abs(wVal);
      deposit = Math.abs(dVal);
      
      // If both are non-zero, usually one is a placeholder or it's a weird format
      if (wVal !== 0 && dVal === 0) {
        withdrawal = Math.abs(wVal);
        deposit = 0;
      } else if (dVal !== 0 && wVal === 0) {
        deposit = Math.abs(dVal);
        withdrawal = 0;
      }
    } else if (hasWithdrawalMapping && !hasDepositMapping) {
      // Case 2: ONLY Withdrawal column is mapped
      const wVal = parseAmt(row[mapping.withdrawal]);
      if (wVal !== 0) {
        withdrawal = Math.abs(wVal);
        deposit = 0;
      }
    } else if (!hasWithdrawalMapping && hasDepositMapping) {
      // Case 3: ONLY Deposit column is mapped
      const dVal = parseAmt(row[mapping.deposit]);
      if (dVal !== 0) {
        deposit = Math.abs(dVal);
        withdrawal = 0;
      }
    } else {
      // Case 4: Single Amount column mapped, or fallback
      const amountKey = mapping.amount || mapping.withdrawal || mapping.deposit;
      if (amountKey) {
        const rawVal = String(row[amountKey] || '').toLowerCase();
        const rawAmt = parseAmt(row[amountKey]);
        const amt = Math.abs(rawAmt);
        const type = mapping.type ? String(row[mapping.type] || '').trim().toLowerCase() : '';
        const narration = String(row[mapping.narration] || '').toLowerCase();
        
        // Improved Dr/Cr detection including checking the amount string itself
        const isDr = type === 'd' || type === 'dr' || type.includes('withdrawal') || type.includes('payment') || type.includes('debit') || 
                     rawVal.includes('dr') || rawVal.includes('debit') || rawVal.includes('payment') ||
                     /\bdr\b/.test(narration);
                     
        const isCr = type === 'c' || type === 'cr' || type.includes('deposit') || type.includes('receipt') || type.includes('credit') || 
                     rawVal.includes('cr') || rawVal.includes('credit') || rawVal.includes('receipt') ||
                     /\bcr\b/.test(narration);

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
    const vType = voucherType.toLowerCase();
    
    const isVoucherPayment = vType.includes('payment');
    const isVoucherReceipt = vType.includes('receipt');
    const isVoucherContra = vType.includes('contra');
    const isVoucherJournal = vType.includes('journal');
    
    let matchesType = false;
    if (isVoucherPayment) matchesType = isPayment;
    else if (isVoucherReceipt) matchesType = isReceipt;
    else if (isVoucherContra || isVoucherJournal) matchesType = true;
    else matchesType = true; // Default to true for unknown types

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
    console.log('Manual mapping complete. Mapping:', mapping);
    console.log('Raw data rows:', rawStatementData.length);
    
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
        .map((row, idx) => {
          const v = parseStatementRow(row, statementKeys, mapping, selectedVoucherType, formatDate);
          if (!v && idx < 5) {
            console.log(`Row ${idx} failed mapping. Row data:`, row);
          }
          return v;
        })
        .filter(Boolean) as Voucher[];

      console.log('Successfully mapped vouchers:', mappedVouchers.length);
      processMappedVouchers(mappedVouchers);
    } catch (error) {
      console.error('Mapping processing error:', error);
      toast.error('Failed to process manual mapping');
      setIsProcessing(false);
    }
  };

  const handleStatementUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (isPDF) {
      await handlePDFUpload(file);
      if (e.target) e.target.value = '';
      return;
    }

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
        return lk.includes('withdrawal') || lk.includes('withdrawl') || lk.includes('debit') || lk.includes('payment') || (lk.includes('dr') && !lk.includes('dr/cr'));
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

  const handlePDFUpload = async (file: File, password?: string) => {
    try {
      setIsProcessing(true);
      setProgress(0);
      console.log('Pre-loading PDF to check pages:', file.name);
      toast.info('Reading PDF structure...');

      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjs.getDocument({ 
        data: arrayBuffer,
        password: password || pdfPassword 
      });
      
      const pdf = await loadingTask.promise;
      
      setPdfFile({ file, totalPages: pdf.numPages });
      setStep('PDF_PAGE_RANGE');
      setIsPasswordRequired(false);
      setPendingPdfFile(null);
      if (password) setPdfPassword(password);
      
    } catch (error: any) {
      if (error.name === 'PasswordException') {
        setIsPasswordRequired(true);
        setPendingPdfFile(file);
        toast.error('This PDF is password protected. Please enter the password.');
      } else {
        console.error("PDF Pre-load Error:", error);
        toast.error('Failed to read PDF file structure');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const startPDFExtraction = async (start: number, end: number) => {
    if (!pdfFile) return;
    
    try {
      setIsProcessing(true);
      setProgress(0);
      console.log(`Starting PDF extraction for ${pdfFile.file.name}, pages ${start} to ${end}`);
      toast.info(`Initializing analysis for pages ${start} to ${end}...`);

      const arrayBuffer = await pdfFile.file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ 
        data: arrayBuffer,
        password: pdfPassword
      }).promise;
      
      const isBill = selectedVoucherType.toLowerCase().includes('sales') || selectedVoucherType.toLowerCase().includes('purchase');

      if (isBill) {
        // Process as a single bill (usually bills are 1-2 pages)
        let fullText = '';
        for (let j = start; j <= end; j++) {
          const page = await pdf.getPage(j);
          const textContent = await page.getTextContent();
          fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
        }
        
        toast.info('Analyzing bill details...');
        const billData = await parseBillPDF(fullText);
        
        if (billData) {
          const newVoucher: Voucher = {
            date: billData.date || new Date().toISOString().split('T')[0],
            voucherType: selectedVoucherType,
            voucherNumber: billData.invoiceNumber || '',
            ledgerName: selectedVoucherType.toLowerCase().includes('sales') ? 'Sales' : 'Purchase',
            secondLedger: billData.partyName || '',
            amount: billData.totalAmount || 0,
            narration: `Bill No: ${billData.invoiceNumber || ''} - ${billData.partyName || ''}`,
            isDebit: selectedVoucherType.toLowerCase().includes('purchase'),
            inventoryEntries: billData.itemsList || [],
            ledgerEntries: billData.additionalLedgers || []
          };
          
          setVouchers([newVoucher]);
          setDuplicates([]);
          setStep('REVIEW');
          toast.success('Bill details extracted successfully.');
          return;
        }
      }

      // Process in chunks of 2 pages
      const CHUNK_SIZE = 2;
      let allTransactions: any[] = [];
      const totalToProcess = end - start + 1;
      
      for (let i = start; i <= end; i += CHUNK_SIZE) {
        let chunkText = '';
        const chunkEnd = Math.min(i + CHUNK_SIZE - 1, end);
        
        for (let j = i; j <= chunkEnd; j++) {
          const page = await pdf.getPage(j);
          const textContent = await page.getTextContent();
          chunkText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
        }
        
        console.log(`Analyzing pages ${i} to ${chunkEnd}`);
        toast.info(`Analyzing pages ${i} to ${chunkEnd}...`);
        
        const chunkTransactions = await parseBankStatementPDF(chunkText);
        if (Array.isArray(chunkTransactions)) {
          allTransactions = [...allTransactions, ...chunkTransactions];
        }
        
        setProgress(Math.round(((chunkEnd - start + 1) / totalToProcess) * 100));
        
        if (chunkEnd < end) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      if (!allTransactions || allTransactions.length === 0) {
        throw new Error("No transactions found in the selected range.");
      }

      const keys = Array.from(new Set(allTransactions.flatMap(t => t ? Object.keys(t) : [])));
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
        return lk.includes('withdrawal') || lk.includes('withdrawl') || lk.includes('debit') || lk.includes('payment') || (lk.includes('dr') && !lk.includes('dr/cr'));
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

      setRawStatementData(allTransactions);
      setStatementKeys(keys);
      setInitialMapping(autoMapping);
      
      setTimeout(() => {
        setStep('COLUMN_MAPPING');
        toast.success(`Extracted ${allTransactions.length} rows. Please verify mapping.`);
      }, 200);
      
    } catch (error: any) {
      console.error("PDF Extraction Error:", error);
      toast.error(error.message || 'Failed to extract data from PDF');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (isPDF) {
      await handlePDFUpload(file);
      if (e.target) e.target.value = '';
      return;
    }

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

      const isJournalType = selectedVoucherType.toLowerCase().includes('journal');
      
      let finalVouchers: Voucher[] = [];
      const foundDuplicates: (Voucher & { duplicateReason?: string })[] = [];

      if (isJournalType) {
        // Group by Voucher Number
        const groups: { [key: string]: any[] } = {};
        jsonData.forEach(row => {
          const vNum = String(row['Voucher Number'] || row.voucher_number || 'UNNUMBERED');
          if (!groups[vNum]) groups[vNum] = [];
          groups[vNum].push(row);
        });

        Object.entries(groups).forEach(([vNum, rows]) => {
          const firstRow = rows[0];
          const ledgerEntries: LedgerEntry[] = rows.map(r => {
            const dr = parseFloat(r.Debit || 0);
            const cr = parseFloat(r.Credit || 0);
            return {
              ledgerName: String(r['Ledger Name'] || r.ledger_name || ''),
              amount: dr || cr || 0,
              isDebit: dr > 0
            };
          });

          const totalDr = ledgerEntries.filter(e => e.isDebit).reduce((sum, e) => sum + e.amount, 0);
          const totalCr = ledgerEntries.filter(e => !e.isDebit).reduce((sum, e) => sum + e.amount, 0);

          if (Math.abs(totalDr - totalCr) > 0.01) {
            toast.error(`Journal Voucher #${vNum} is unbalanced! Dr: ${totalDr}, Cr: ${totalCr}`, { duration: 5000 });
          }

          const voucher: Voucher = {
            date: formatDate(firstRow.Date || firstRow.date),
            voucherType: selectedVoucherType,
            voucherNumber: vNum === 'UNNUMBERED' ? '' : vNum,
            ledgerName: ledgerEntries[0]?.ledgerName || '',
            amount: totalDr, // Total debit amount
            narration: String(firstRow.Narration || firstRow.narration || ''),
            isDebit: true,
            ledgerEntries
          };
          finalVouchers.push(voucher);
        });
      } else if (selectedVoucherType.toLowerCase().includes('sales') || selectedVoucherType.toLowerCase().includes('purchase')) {
        // Group by Voucher Number for Sales/Purchase to support multiple stock items
        const groups: { [key: string]: any[] } = {};
        jsonData.forEach(row => {
          const vNum = String(row['Voucher Number'] || row.voucher_number || 'UNNUMBERED_' + Math.random());
          if (!groups[vNum]) groups[vNum] = [];
          groups[vNum].push(row);
        });

        Object.entries(groups).forEach(([vNum, rows]) => {
          const firstRow = rows[0];
          const inventoryEntries: InventoryEntry[] = rows.map(r => {
            const stockItem = r['Stock Item'] || r['stock_item'];
            const quantity = parseFloat(r['Quantity'] || r['qty'] || 0);
            const rate = parseFloat(r['Rate'] || r['rate'] || 0);
            if (stockItem && quantity > 0) {
              return {
                stockItemName: stockItem,
                quantity,
                rate,
                amount: quantity * rate
              };
            }
            return null;
          }).filter(Boolean) as InventoryEntry[];

          const totalAmount = inventoryEntries.reduce((sum, ie) => sum + ie.amount, 0);

          const voucher: Voucher = {
            date: formatDate(firstRow.Date || firstRow.date),
            voucherType: selectedVoucherType,
            voucherNumber: vNum.startsWith('UNNUMBERED_') ? '' : vNum,
            ledgerName: selectedAccount || (selectedVoucherType.toLowerCase().includes('sales') ? 'Sales' : 'Purchase'),
            amount: totalAmount || Math.abs(parseFloat(firstRow.Amount || firstRow.amount || 0)),
            narration: firstRow.Narration || firstRow.narration || '',
            narration2: firstRow['Narration 2'] || firstRow.narration2 || '',
            isDebit: selectedVoucherType.toLowerCase().includes('sales'),
            secondLedger: firstRow['Paid To'] || firstRow['Received From'] || firstRow['Customer'] || firstRow['Supplier'] || firstRow['Debit Ledger'] || firstRow['Credit Ledger'] || firstRow['To Account'] || firstRow['From Account'] || '',
            inventoryEntries
          };
          finalVouchers.push(voucher);
        });
      } else {
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
          return voucher;
        });

        // Advanced Duplicate Detection Logic
        const existingTransactions = tallyData?.transactions || [];
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
      }

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
    const batchSize = 100; // Larger batch size to reduce number of requests
    const concurrencyLimit = 1; // Process 1 batch at a time to stay within free tier RPM limits

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
    if (vouchers.length === 0) return;
    
    // Check for missing masters before generating XML
    const missingLedgers = new Set<string>();
    const missingStockItems = new Set<string>();
    
    const existingLedgers = new Set(tallyData?.ledgers.map(l => l.name.toLowerCase()) || []);
    const existingStockItems = new Set(tallyData?.stockItems.map(si => si.name.toLowerCase()) || []);
    
    vouchers.forEach(v => {
      if (v.ledgerName && !existingLedgers.has(v.ledgerName.toLowerCase())) missingLedgers.add(v.ledgerName);
      if (v.secondLedger && !existingLedgers.has(v.secondLedger.toLowerCase())) missingLedgers.add(v.secondLedger);
      
      v.ledgerEntries?.forEach(le => {
        if (le.ledgerName && !existingLedgers.has(le.ledgerName.toLowerCase())) {
          missingLedgers.add(le.ledgerName);
        }
      });

      v.inventoryEntries?.forEach(ie => {
        if (ie.stockItemName && !existingStockItems.has(ie.stockItemName.toLowerCase())) {
          missingStockItems.add(ie.stockItemName);
        }
      });
    });

    if (missingLedgers.size > 0 || missingStockItems.size > 0) {
      const mastersToCreate: { type: 'LEDGER' | 'STOCKITEM', data: any }[] = [];
      
      missingLedgers.forEach(name => {
        mastersToCreate.push({
          type: 'LEDGER',
          data: { name, parent: 'Suspense Account' }
        });
      });
      
      missingStockItems.forEach(name => {
        mastersToCreate.push({
          type: 'STOCKITEM',
          data: { name, parent: 'Primary', uom: 'Nos' }
        });
      });

      // Generate XML for missing masters
      const mastersXml = generateMultiMasterXML(mastersToCreate);
      const mBlob = new Blob([mastersXml], { type: 'text/xml' });
      const mUrl = URL.createObjectURL(mBlob);
      const mA = document.createElement('a');
      mA.href = mUrl;
      mA.download = 'missing_masters.xml';
      mA.click();
      
      // Also generate Excel for missing masters
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Missing Masters');
      sheet.columns = [
        { header: 'Type', key: 'type' },
        { header: 'Name', key: 'name' },
        { header: 'Parent', key: 'parent' },
        { header: 'UOM', key: 'uom' }
      ];
      
      mastersToCreate.forEach(m => {
        sheet.addRow({
          type: m.type,
          name: m.data.name,
          parent: m.data.parent,
          uom: m.data.uom || ''
        });
      });
      
      workbook.xlsx.writeBuffer().then(buffer => {
        const excelBlob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const excelUrl = URL.createObjectURL(excelBlob);
        const excelA = document.createElement('a');
        excelA.href = excelUrl;
        excelA.download = 'missing_masters.xlsx';
        excelA.click();
      });

      toast.info(`Created master files for ${missingLedgers.size} ledgers and ${missingStockItems.size} stock items.`);
    }

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
      setPdfPassword('');
      setIsPasswordRequired(false);
      setPendingPdfFile(null);
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
      
      {isPasswordRequired && pendingPdfFile && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-card border shadow-2xl rounded-2xl p-6 space-y-6 animate-in zoom-in-95 duration-200">
            <div className="space-y-2 text-center">
              <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
                <LogIn className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold">Password Protected PDF</h3>
              <p className="text-sm text-muted-foreground">
                The file <b>{pendingPdfFile.name}</b> requires a password to open.
              </p>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Enter Password
                </label>
                <input 
                  type="password" 
                  autoFocus
                  placeholder="PDF Password"
                  className="w-full h-12 px-4 rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handlePDFUpload(pendingPdfFile, (e.target as HTMLInputElement).value);
                    }
                  }}
                />
              </div>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => {
                    setIsPasswordRequired(false);
                    setPendingPdfFile(null);
                  }}
                  className="flex-1 h-11 rounded-xl font-semibold border hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    const input = document.querySelector('input[type="password"]') as HTMLInputElement;
                    if (input) handlePDFUpload(pendingPdfFile, input.value);
                  }}
                  className="flex-1 h-11 rounded-xl font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Unlock PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
            onContinue={() => {
              const vt = selectedVoucherType.toLowerCase();
              if (vt.includes('receipt') || vt.includes('payment') || vt.includes('contra')) {
                setStep('ACCOUNT_SELECT');
              } else {
                setSelectedAccount(''); // Clear account for other types
                setStep('EXCEL_UPLOAD');
              }
            }} 
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

        {step === 'PDF_PAGE_RANGE' && pdfFile && (
          <PDFPageRangeStep 
            fileName={pdfFile.file.name}
            totalPages={pdfFile.totalPages}
            onConfirm={startPDFExtraction}
            onBack={() => setStep('TALLY_DATA')}
          />
        )}

        {step === 'COLUMN_MAPPING' && (
          <ColumnMappingStep 
            keys={statementKeys}
            initialMapping={initialMapping}
            onMappingComplete={handleManualMappingComplete}
            onBack={() => {
              const vt = selectedVoucherType.toLowerCase();
              if (vt.includes('receipt') || vt.includes('payment') || vt.includes('contra')) {
                setStep('ACCOUNT_SELECT');
              } else {
                setStep('VOUCHER_TYPE');
              }
            }}
          />
        )}
        
        {step === 'EXCEL_UPLOAD' && (
          <ExcelUploadStep 
            onUpload={handleExcelUpload} 
            fileRef={excelFileRef} 
            onBack={() => {
              const vt = selectedVoucherType.toLowerCase();
              if (vt.includes('receipt') || vt.includes('payment') || vt.includes('contra')) {
                setStep('ACCOUNT_SELECT');
              } else {
                setStep('VOUCHER_TYPE');
              }
            }} 
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
