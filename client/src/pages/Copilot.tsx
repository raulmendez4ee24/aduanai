import { useState, useRef, useEffect } from 'react';
import { Send, MessageSquare, Bot, User } from 'lucide-react';
import { api } from '../lib/api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function CopilotPage() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const res = await api.chat(userMessage, conversationId);
      setConversationId(res.data.conversationId);
      setMessages((prev) => [...prev, { role: 'assistant', content: res.data.reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Error al procesar tu consulta. Intenta de nuevo.' },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
          <MessageSquare size={24} className="text-[#C9A84C]" />
          Compliance Copilot
        </h1>
        <p className="text-slate-400">Consulta normatividad aduanera mexicana con IA</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-[#0D1B2A] border border-[#1B2D45] rounded-xl p-4 mb-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-16">
            <Bot size={48} className="text-[#1B2D45] mx-auto mb-4" />
            <p className="text-slate-500 mb-6">Pregúntame sobre comercio exterior mexicano</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {[
                '¿Qué es el padrón de importadores?',
                '¿Cuándo necesito un agente aduanal?',
                '¿Qué es una IMMEX?',
                '¿Cómo funciona el TMEC?',
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  className="bg-[#1B2D45] text-slate-400 text-sm px-3 py-2 rounded-lg hover:text-white hover:bg-[#243656] transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="bg-[#C9A84C]/10 p-2 rounded-lg h-fit shrink-0">
                <Bot size={16} className="text-[#C9A84C]" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-[#C9A84C] text-[#0A1628]'
                  : 'bg-[#1B2D45] text-slate-300'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
            {msg.role === 'user' && (
              <div className="bg-[#1B2D45] p-2 rounded-lg h-fit shrink-0">
                <User size={16} className="text-slate-400" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="bg-[#C9A84C]/10 p-2 rounded-lg h-fit">
              <Bot size={16} className="text-[#C9A84C]" />
            </div>
            <div className="bg-[#1B2D45] rounded-xl px-4 py-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="flex gap-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 bg-[#0D1B2A] border border-[#1B2D45] rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-[#C9A84C] transition-colors"
          placeholder="Escribe tu consulta sobre comercio exterior..."
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="bg-[#C9A84C] hover:bg-[#A68A3E] text-[#0A1628] px-4 py-3 rounded-xl transition-colors disabled:opacity-50"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
