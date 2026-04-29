import { GoogleGenAI } from "@google/genai";
import Fuse from 'fuse.js';

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

// Use gemini-3-flash-preview as per the current Gemini API guidelines
const MODEL_NAME = "gemini-3-flash-preview";

async function withRetry<T>(fn: () => Promise<T>, maxRetries: number = 2): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const errorStr = JSON.stringify(error).toLowerCase();
      const isQuota = errorStr.includes('429') || errorStr.includes('quota');
      
      if (isQuota && i < maxRetries - 1) {
        const delay = 3000 + Math.random() * 1000;
        console.warn(`Gemini Quota. Retrying in ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

/**
 * Optimized ledger mapping:
 * 1. Exact match.
 * 2. High-confidence Fuzzy Search (Very Fast).
 * 3. Deep search in historical records.
 * 4. Batch AI Categorization with gemini-1.5-flash (Fast).
 */
export async function suggestLedgersBatch(
  narrations: string[],
  ledgers: string[],
  previousVouchers: { narration: string, ledger: string }[] = []
): Promise<string[]> {
  const startTime = Date.now();
  const finalResults: (string | null)[] = new Array(narrations.length).fill(null);
  
  // 1. Setup Fuzzy search (threshold 0.4 handles typos and slight variations better)
  const ledgerFuse = new Fuse(ledgers, {
    threshold: 0.4,
    distance: 1000,
    ignoreLocation: true,
    minMatchCharLength: 2
  });

  const historyFuse = previousVouchers.length > 0 ? new Fuse(previousVouchers, {
    keys: ['narration'],
    threshold: 0.4,
    distance: 1000,
    ignoreLocation: true,
    minMatchCharLength: 3
  }) : null;

  // --- Step 1: Rapid Local Matching ---
  for (let i = 0; i < narrations.length; i++) {
    const narration = narrations[i];
    if (!narration) {
      finalResults[i] = "Suspense";
      continue;
    }

    const normNarration = narration.toUpperCase().trim();
    
    // A. Exact match first
    const exact = ledgers.find(l => l.toUpperCase() === normNarration);
    if (exact) {
      finalResults[i] = exact;
      continue;
    }

    // B. Fuzzy match in current ledgers
    const ledgerSearch = ledgerFuse.search(narration);
    if (ledgerSearch.length > 0 && ledgerSearch[0].score! < 0.3) {
      finalResults[i] = ledgerSearch[0].item;
      continue;
    }

    // C. Historical match (Checks if this narration was previously mapped to an existing ledger)
    if (historyFuse) {
      const historySearch = historyFuse.search(narration);
      if (historySearch.length > 0 && historySearch[0].score! < 0.35) {
        const historicalLedger = historySearch[0].item.ledger;
        const exists = ledgers.find(l => l.toLowerCase() === historicalLedger.toLowerCase());
        if (exists) {
          finalResults[i] = exists;
          continue;
        }
      }
    }
  }

  // --- Step 2: Batch AI Fallback for Remaining ---
  const unmatchedIndices = finalResults.map((res, idx) => res === null ? idx : null).filter(idx => idx !== null) as number[];
  
  if (unmatchedIndices.length > 0) {
    const batchNarrations = unmatchedIndices.map(idx => narrations[idx]);
    
    // Smart ledger filtering: Only send ledgers that share keywords with narrations
    const keywords = new Set(batchNarrations.flatMap(n => n.toLowerCase().split(/\W+/).filter(w => w.length > 3)));
    const aiLedgers = ledgers.filter(l => {
      const lowL = l.toLowerCase();
      if (['cash', 'bank', 'gst', 'tax', 'rent', 'salary', 'fees', 'purchase', 'sales'].some(k => lowL.includes(k))) return true;
      return lowL.split(/\W+/).some(w => keywords.has(w));
    }).slice(0, 500);

    const prompt = `Map these narrations to the Allowed Ledgers.
    Allowed Ledgers: [${aiLedgers.join(', ')}]
    
    Narrations:
    ${batchNarrations.map((n, i) => `${i + 1}. ${n}`).join('\n')}
    
    Return ONLY a JSON array of strings: ["Ledger1", "Ledger2", ...]. Use "Suspense" if no match.`;

    try {
      const response = await withRetry(() => genAI.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      }));

      const aiText = response.text || "[]";
      const aiSuggestions = JSON.parse(aiText.match(/\[.*\]/s)?.[0] || "[]");
      
      if (Array.isArray(aiSuggestions)) {
        aiSuggestions.forEach((sug, i) => {
          const targetIdx = unmatchedIndices[i];
          if (targetIdx !== undefined) {
            const found = ledgers.find(l => l.toLowerCase() === String(sug).toLowerCase());
            finalResults[targetIdx] = found || "Suspense";
          }
        });
      }
    } catch (e) {
      console.error("Mapping AI Error:", e);
    }
  }

  const final = finalResults.map(r => r || "Suspense");
  console.log(`Mapped ${narrations.length} in ${Date.now() - startTime}ms`);
  return final;
}

export async function askGemini(
  query: string,
  context: string = ""
): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    return "AI Assistant is currently unavailable (API key missing).";
  }

  try {
    const response = await withRetry(() => genAI.models.generateContent({
      model: MODEL_NAME,
      contents: `Context: ${context}\nQuery: ${query}\nYou are an expert Tally and accounting assistant. Provide a detailed, helpful response.`
    }));

    return response.text || "I'm sorry, I couldn't generate a response.";
  } catch (error) {
    console.error("Error in Gemini Thinking:", error);
    return "An error occurred while processing your request.";
  }
}

export async function parseBankStatementPDF(
  textData: string
): Promise<any[]> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Gemini API key is required for PDF parsing.");
  }

  const prompt = `
    Extract the bank statement table from this text. 
    Convert it into a JSON array of objects where each object is a row.
    Try to use the original column headers found in the statement (e.g., "Date", "Particulars", "Withdrawal", "Deposit", "Balance").
    If headers are missing, use descriptive ones.
    Ensure every transaction row is captured.

    Text Data:
    ${textData}

    Only return the JSON array.
  `;

  return parsePDFWithGemini(prompt, textData);
}

export async function parseBillPDF(
  textData: string
): Promise<any> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Gemini API key is required for PDF parsing.");
  }

  const prompt = `
    Extract billing information from this document text.
    Identify the following fields:
    - Date (in YYYY-MM-DD format)
    - Invoice Number / Bill Number
    - Party Name (Customer or Supplier)
    - Total Amount
    - Voucher Type (Sales or Purchase)
    - Items List (Array of objects with: stockItemName, quantity, rate, amount, uom)
    - Additional Ledgers (Array of objects with: ledgerName, amount, isDebit) - include taxes (GST, VAT), round off, freight, etc.

    Text Data:
    ${textData}

    Return a JSON object with these fields. Ensure all items and all tax/additional ledgers are captured.
  `;

  const result = await parsePDFWithGemini(prompt, textData);
  const data = Array.isArray(result) ? result[0] : result;
  
  // Ensure we have a clean structure
  if (data && data.itemsList) {
    data.itemsList = data.itemsList.map((item: any) => ({
      stockItemName: String(item.stockItemName || ''),
      quantity: parseFloat(item.quantity || 0),
      rate: parseFloat(item.rate || 0),
      amount: parseFloat(item.amount || 0),
      uom: String(item.uom || 'Nos')
    }));
  }
  
  if (data && data.additionalLedgers) {
    data.additionalLedgers = data.additionalLedgers.map((l: any) => ({
      ledgerName: String(l.ledgerName || ''),
      amount: Math.abs(parseFloat(l.amount || 0)),
      isDebit: !!l.isDebit
    }));
  }

  return data;
}

async function parsePDFWithGemini(prompt: string, textData: string): Promise<any> {
  try {
    const response = await withRetry(() => genAI.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        temperature: 0.1,
        responseMimeType: "application/json",
      }
    }));

    let text = response.text || "[]";
    
    // Robustly extract JSON if AI adds extra text or markdown
    const jsonMatch = text.match(/[\{\[]\s*[\s\S]*[\}\]]/);
    if (jsonMatch) {
      text = jsonMatch[0];
    }

    // Sanitize common JSON issues
    text = text
      .replace(/,\s*\]/g, ']')
      .replace(/,\s*\}/g, '}')
      .replace(/}\s*{/g, '},{')
      .replace(/\n/g, ' ')
      .replace(/\r/g, '');

    try {
      return JSON.parse(text);
    } catch (parseError) {
      console.error("AI JSON Parse Error. Attempting manual cleanup. Raw text:", text);
      try {
        const fixedText = text.replace(/"([^"]*)$|(?<=:)\s*"([^"]*)$/gm, '"$1$2"');
        return JSON.parse(fixedText);
      } catch (e) {
        throw new Error("AI generated malformed data. Please try again.");
      }
    }
  } catch (error: any) {
    console.error("PDF Parse Error:", error);
    throw new Error(error.message || "Failed to parse PDF text.");
  }
}
