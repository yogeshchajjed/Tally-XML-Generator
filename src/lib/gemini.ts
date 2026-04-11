import { GoogleGenAI, ThinkingLevel } from "@google/genai";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

async function withRetry<T>(fn: () => Promise<T>, maxRetries: number = 3): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const isRetryable = 
        error?.message?.includes('503') || 
        error?.message?.includes('high demand') ||
        error?.status === 'UNAVAILABLE' ||
        error?.code === 503;

      if (isRetryable && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
        console.warn(`Gemini API busy (503). Retrying in ${Math.round(delay)}ms... (Attempt ${i + 1}/${maxRetries})`);
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
      model: "gemini-3.1-pro-preview",
      contents: [{ role: 'user', parts: [{ text: `
        Context: ${context}
        Query: ${query}
        
        You are an expert Tally and accounting assistant. Provide a detailed, helpful response.
      ` }] }],
      generationConfig: {
        thinkingLevel: ThinkingLevel.HIGH
      }
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
    return narrations.map(() => "UNKNOWN");
  }

  const prompt = `
    Map narrations to ledgers.
    Ledgers: ${ledgers.join(', ')}
    ${previousVouchers.length > 0 ? `Patterns: ${previousVouchers.slice(0, 10).map(v => `"${v.narration}"->"${v.ledger}"`).join('; ')}` : ''}
    Tasks: ${narrations.map((n, i) => `${i + 1}. "${n}"`).join('\n')}
    Return JSON array of strings (exact ledger name or "UNKNOWN").
  `;

  try {
    const response = await withRetry(() => (genAI as any).models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        maxOutputTokens: 1000
      }
    }), 2) as any; // Reduced retries for speed

    let text = response.text?.trim() || "[]";
    
    // Remove markdown code blocks if present
    if (text.startsWith('```')) {
      text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }

    try {
      const results = JSON.parse(text);
      if (Array.isArray(results)) {
        return results.map(r => String(r));
      }
    } catch (parseError) {
      console.error("AI JSON Parse Error. Raw text:", text);
    }
    return narrations.map(() => "UNKNOWN");
  } catch (error) {
    console.error("AI Batch Error:", error);
    return narrations.map(() => "UNKNOWN");
  }
}
