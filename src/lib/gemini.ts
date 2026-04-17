import { GoogleGenAI } from "@google/genai";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

async function withRetry<T>(fn: () => Promise<T>, maxRetries: number = 5): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const errorStr = JSON.stringify(error).toLowerCase();
      
      const isQuotaExceeded = errorStr.includes('429') || errorStr.includes('quota') || errorStr.includes('rate limit') || errorStr.includes('resource_exhausted');
      const isRetryable = 
        isQuotaExceeded ||
        errorStr.includes('503') || 
        errorStr.includes('500') || 
        errorStr.includes('high demand') ||
        errorStr.includes('unavailable') ||
        errorStr.includes('internal') ||
        error?.status === 'UNAVAILABLE' ||
        error?.status === 'INTERNAL' ||
        error?.code === 503 ||
        error?.code === 500 ||
        error?.code === 429;

      if (isRetryable && i < maxRetries - 1) {
        // Default exponential backoff
        let delay = Math.pow(2, i) * 2000 + Math.random() * 1000;
        
        // If it's a quota error, wait longer
        if (isQuotaExceeded) {
          delay = Math.pow(2, i) * 5000 + Math.random() * 2000;
          // Try to extract retry delay from error if available (e.g. "Please retry in 42s")
          const retryMatch = errorStr.match(/retry in (\d+\.?\d*)s/);
          if (retryMatch && retryMatch[1]) {
            delay = (parseFloat(retryMatch[1]) + 1) * 1000;
          }
        }

        console.warn(`Gemini API error (Attempt ${i + 1}/${maxRetries}). Retrying in ${Math.round(delay)}ms...`, isQuotaExceeded ? "(Quota Exceeded)" : "");
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export async function askGemini(
  query: string,
  context: string = ""
): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    return "AI Assistant is currently unavailable (API key missing).";
  }

  try {
    const response = await withRetry(() => (genAI as any).models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: 'user', parts: [{ text: `
        Context: ${context}
        Query: ${query}
        
        You are an expert Tally and accounting assistant. Provide a detailed, helpful response.
      ` }] }]
    })) as any;

    return response.text || "I'm sorry, I couldn't generate a response.";
  } catch (error) {
    console.error("Error in Gemini Thinking:", error);
    return "An error occurred while processing your request. The AI service might be under heavy load, please try again in a moment.";
  }
}

export async function suggestLedgersBatch(
  narrations: string[],
  ledgers: string[],
  previousVouchers: { narration: string, ledger: string }[] = []
): Promise<string[]> {
  if (!process.env.GEMINI_API_KEY) {
    return narrations.map(() => "Suspense");
  }

  const prompt = `
    Task: Map the following narrations to the most appropriate ledger from the provided list.
    
    STRICT RULES:
    1. ONLY use ledger names from the "Allowed Ledgers" list below.
    2. DO NOT create new ledger names.
    3. If a narration does not clearly match any allowed ledger, map it to "Suspense".
    4. If "Suspense" is not in the list, still return "Suspense" as the fallback.
    
    Allowed Ledgers: ${ledgers.join(', ')}
    
    ${previousVouchers.length > 0 ? `Historical Patterns (for reference): ${previousVouchers.slice(0, 15).map(v => `"${v.narration}" -> "${v.ledger}"`).join('; ')}` : ''}
    
    Narrations to Map:
    ${narrations.map((n, i) => `${i + 1}. "${n}"`).join('\n')}
    
    Return ONLY a JSON array of strings containing the exact ledger names.
  `;

  try {
    const response = await withRetry(() => (genAI as any).models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        maxOutputTokens: 1000
      }
    }), 5) as any; // Increased retries for quota issues

    let text = response.text?.trim() || "[]";
    
    // Remove markdown code blocks if present
    if (text.startsWith('```')) {
      text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }

    try {
      const results = JSON.parse(text);
      if (Array.isArray(results)) {
        return results.map(r => (String(r) === "UNKNOWN" || !r) ? "Suspense" : String(r));
      }
    } catch (parseError) {
      console.error("AI JSON Parse Error. Raw text:", text);
    }
    return narrations.map(() => "Suspense");
  } catch (error) {
    console.error("AI Batch Error:", error);
    return narrations.map(() => "Suspense");
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
    const response = await withRetry(() => (genAI as any).models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{
        role: 'user',
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      }
    })) as any;

    let text = response.text?.trim() || "[]";
    
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
