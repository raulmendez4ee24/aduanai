import { useState, useRef, useEffect } from 'react'
import { api } from '../lib/api'
import { Bot, Send, User } from 'lucide-react'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

interface Message { role: 'user' | 'assistant'; content: string }

export function CopilotPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string>()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function handleSend() {
    if (!input.trim() || loading) return
    const msg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setLoading(true)
    try {
      const res = await api.chat(msg, conversationId)
      setConversationId(res.data.conversationId)
      setMessages(prev => [...prev, { role: 'assistant', content: res.data.reply }])
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e instanceof Error ? e.message : 'No se pudo conectar'}` }])
    }
    setLoading(false)
  }

  return (
    <div className="h-full flex flex-col max-w-4xl mx-auto">
      <div className={`${GLASS} rounded-[2rem] flex-1 flex flex-col overflow-hidden`}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200/50 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-[15px] font-bold text-slate-900">Copilot Regulatorio</h1>
            <p className="text-[11px] text-slate-500">Pregunta sobre normatividad aduanera mexicana</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-16">
              <Bot className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-[14px] font-semibold text-slate-700">¿En qué puedo ayudarte?</p>
              <p className="text-[12px] text-slate-500 mt-1 max-w-sm mx-auto">Puedo responder sobre regulaciones, NOM, RRNA, tratados comerciales, fracciones arancelarias y más.</p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {['¿Qué NOM aplica para alimentos?', '¿Necesito permiso para importar textiles?', 'Explica la GRI 3'].map((q, i) => (
                  <button key={i} onClick={() => { setInput(q); }} className="text-[11px] text-slate-600 bg-white/60 border border-slate-200/50 px-3 py-2 rounded-xl hover:bg-white/80 transition-colors">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5 text-emerald-600" />
                </div>
              )}
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-white/60 text-slate-800'
              }`}>
                <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              </div>
              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-lg bg-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5 text-slate-600" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <div className="bg-white/60 rounded-2xl px-4 py-3">
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-slate-200/50">
          <div className="flex items-center gap-2 bg-white/60 rounded-xl px-4 py-2 border border-slate-200/50 focus-within:ring-2 focus-within:ring-emerald-500/30 transition-all">
            <input
              type="text" value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSend() }}
              placeholder="Escribe tu pregunta..."
              className="flex-1 bg-transparent text-[13px] text-slate-900 placeholder:text-slate-400 outline-none"
            />
            <button onClick={handleSend} disabled={loading || !input.trim()}
              className="w-8 h-8 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 flex items-center justify-center transition-colors">
              <Send className="w-3.5 h-3.5 text-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
