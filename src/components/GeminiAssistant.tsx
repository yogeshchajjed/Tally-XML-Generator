import React, { useState } from 'react';
import { Brain, Send, Loader2, X, MessageSquare } from 'lucide-react';
import { askGemini } from '../lib/gemini';

interface GeminiAssistantProps {
  context?: string;
}

export const GeminiAssistant = ({ context }: GeminiAssistantProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAsk = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResponse('');
    try {
      const res = await askGemini(query, context);
      setResponse(res);
    } catch (error) {
      setResponse("Failed to get response from AI.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {isOpen ? (
        <div className="bg-card border shadow-2xl rounded-2xl w-[350px] md:w-[450px] overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-300">
          <div className="bg-primary p-4 text-primary-foreground flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5" />
              <span className="font-semibold">Gemini Thinking Assistant</span>
            </div>
            <button onClick={() => setIsOpen(false)} className="hover:bg-white/20 p-1 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="p-4 h-[400px] overflow-y-auto space-y-4 bg-muted/10">
            {response ? (
              <div className="bg-card p-4 rounded-xl border shadow-sm text-sm leading-relaxed whitespace-pre-wrap">
                {response}
              </div>
            ) : (
              <div className="text-center text-muted-foreground mt-20">
                <Brain className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p className="text-sm">Ask me anything about your Tally data or accounting rules.</p>
              </div>
            )}
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
                <Loader2 className="w-4 h-4 animate-spin" />
                Gemini is thinking deeply...
              </div>
            )}
          </div>

          <div className="p-4 border-t bg-card">
            <div className="flex gap-2">
              <input 
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
                placeholder="Ask a complex question..."
                className="flex-1 h-10 px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button 
                onClick={handleAsk}
                disabled={loading || !query.trim()}
                className="bg-primary text-primary-foreground p-2 rounded-md hover:bg-primary/90 disabled:opacity-50 transition-all"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button 
          onClick={() => setIsOpen(true)}
          className="bg-primary text-primary-foreground p-4 rounded-full shadow-2xl hover:scale-110 transition-all group relative"
        >
          <Brain className="w-6 h-6" />
          <span className="absolute -top-12 right-0 bg-card text-card-foreground text-xs px-3 py-1.5 rounded-lg border shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            Ask Gemini Thinking
          </span>
        </button>
      )}
    </div>
  );
};
