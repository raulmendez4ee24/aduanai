import { useState, useRef, useEffect } from 'react'
import { api } from '../lib/api'
import type { CopilotCitation } from '../lib/api'
import { Bot, Send, User, ExternalLink, ThumbsUp, ThumbsDown, Scale, AlertTriangle } from 'lucide-react'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

interface Message {
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
  retryOf?: string;
  citations?: CopilotCitation[];
  documentosConsultados?: { reference: string; source: string; officialUrl: string | null }[];
  citaEstricta?: { modo: string; regenerada: boolean; degradada: boolean; noRespaldadas: string[] };
  confidence?: number;
  consultHash?: string;
  hallucinationWarning?: { count: number; refs: string[] } | null;
  feedback?: 'helpful' | 'unhelpful' | null;
}


// Re-verificación 24-ago (cosmético): las respuestas del Copilot llegan con
// markdown (##, **, listas, `código`) que se pintaba CRUDO. Renderer ligero en
// React puro — sin dangerouslySetInnerHTML ni dependencias: los tokens se
// convierten a elementos, nunca a HTML, así que no hay superficie XSS.
function MarkdownLigero({ texto }: { texto: string }) {
  const inline = (s: string) => {
    const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    return parts.map((p, i) =>
      p.startsWith('**') && p.endsWith('**') && p.length > 4
        ? <strong key={i}>{p.slice(2, -2)}</strong>
        : p.startsWith('`') && p.endsWith('`') && p.length > 2
          ? <code key={i} className="bg-slate-100 rounded px-1 text-[12px]">{p.slice(1, -1)}</code>
          : <span key={i}>{p}</span>,
    )
  }
  const lineas = texto.split('\n')
  return (
    <div className="text-[13px] leading-relaxed space-y-1">
      {lineas.map((linea, i) => {
        const h = linea.match(/^(#{1,4})\s+(.*)$/)
        if (h) return <p key={i} className="font-bold text-slate-900 mt-2">{inline(h[2] ?? '')}</p>
        const li = linea.match(/^\s*[-*]\s+(.*)$/)
        if (li) return <p key={i} className="pl-4 relative before:content-['•'] before:absolute before:left-1">{inline(li[1] ?? '')}</p>
        const num = linea.match(/^\s*(\d+)[.)]\s+(.*)$/)
        if (num) return <p key={i} className="pl-4">{num[1]}. {inline(num[2] ?? '')}</p>
        if (linea.trim() === '') return <div key={i} className="h-1" />
        return <p key={i} className="whitespace-pre-wrap">{inline(linea)}</p>
      })}
    </div>
  )
}

export function CopilotPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string>()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function sendPrompt(prompt: string, retryIndex?: number) {
    if (loading) return
    if (retryIndex !== undefined) {
      setMessages(prev => prev.filter((_, i) => i !== retryIndex))
    } else {
      setMessages(prev => [...prev, { role: 'user', content: prompt }])
    }
    setLoading(true)
    try {
      const res = await api.chat(prompt, conversationId)
      setConversationId(res.data.conversationId)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: res.data.reply,
        citations: res.data.citations,
        documentosConsultados: res.data.documentosConsultados,
        citaEstricta: res.data.citaEstricta,
        confidence: res.data.confidence,
        consultHash: res.data.consultHash,
        hallucinationWarning: res.data.hallucinationWarning,
      }])
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: e instanceof Error ? e.message : 'No se pudo conectar',
        error: true,
        retryOf: prompt,
      }])
    }
    setLoading(false)
  }

  async function handleSend() {
    if (!input.trim() || loading) return
    const msg = input.trim()
    setInput('')
    await sendPrompt(msg)
  }

  async function sendFeedback(idx: number, helpful: boolean) {
    const msg = messages[idx]
    if (!msg?.consultHash || msg.feedback) return
    try {
      await api.copilotFeedback(msg.consultHash, helpful)
      setMessages(prev => prev.map((m, i) => i === idx ? { ...m, feedback: helpful ? 'helpful' : 'unhelpful' } : m))
    } catch { /* silent */ }
  }

  return (
    <div className="h-full flex flex-col max-w-4xl mx-auto">
      <div className={`${GLASS} rounded-[2rem] flex-1 flex flex-col overflow-hidden`}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200/50 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-[15px] font-bold text-slate-900">Copilot Regulatorio</h1>
            <p className="text-[11px] text-slate-500">Pregunta sobre normatividad aduanera mexicana</p>
          </div>
        </div>
        {/* Disclaimer permanente */}
        <div className="bg-amber-50 border-b border-amber-100 px-6 py-2">
          <p className="text-[10px] text-amber-800 leading-snug">
            ⚖️ Este asistente cita textos legales reales pero <strong>NO sustituye consulta profesional</strong>. Las normas pueden actualizarse. Verifica siempre en fuente oficial (DOF, SAT). Cualquier acción legal debe ser validada con tu agente aduanal o abogado especialista.
          </p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4" role="log" aria-live="polite" aria-label="Conversación">
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
                  : msg.error
                    ? 'bg-rose-50 border border-rose-200 text-rose-800'
                  : 'bg-white/60 text-slate-800'
              }`}>
                {msg.error ? (
                  <div>
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    {msg.retryOf && (
                      <button
                        onClick={() => sendPrompt(msg.retryOf!, i)}
                        disabled={loading}
                        className="mt-3 text-[11px] font-semibold text-rose-700 bg-white/70 border border-rose-200 px-3 py-1.5 rounded-lg hover:bg-rose-100 disabled:opacity-50 transition-colors"
                      >
                        Reintentar
                      </button>
                    )}
                  </div>
                ) : msg.role === 'assistant' ? (
                  <MarkdownLigero texto={msg.content} />
                ) : (
                  <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                )}

                {/* Citas, documentos consultados y feedback (Fase 3a: las citas
                    son SOLO las que respaldan el texto — puede no haber) */}
                {msg.role === 'assistant' && !msg.error && (msg.citations || msg.documentosConsultados || msg.consultHash) && (
                  <div className="mt-3 pt-3 border-t border-slate-200/50">
                    {msg.citaEstricta?.degradada && (
                      <div className="mb-2 rounded-lg bg-rose-50 border border-rose-200 p-2 flex items-start gap-1.5">
                        <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0 mt-0.5"/>
                        <p className="text-[10px] text-rose-800">
                          La respuesta generada citaba referencias que no están en la base documental verificada y fue retirada. Se muestra la abstención estándar en su lugar.
                        </p>
                      </div>
                    )}
                    {msg.citations && msg.citations.length > 0 && (
                      <>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                          <Scale className="w-3 h-3"/> Fuentes que respaldan esta respuesta
                          {msg.confidence != null && (
                            <span className={`ml-auto px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              msg.confidence >= 70 ? 'bg-emerald-100 text-emerald-800' :
                              msg.confidence >= 40 ? 'bg-amber-100 text-amber-800' :
                              'bg-rose-100 text-rose-800'
                            }`}>{msg.confidence}% confianza (heurística)</span>
                          )}
                        </p>
                        <ul className="space-y-1.5">
                          {msg.citations.map((c, k) => (
                            <li key={k} className="rounded-lg bg-white/50 border border-slate-200/40 p-2">
                              <div className="flex items-start gap-1">
                                <span className="text-[9px] font-mono text-slate-400">[{k + 1}]</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[11px] font-semibold text-slate-800">{c.reference}</p>
                                  <p className="text-[10px] text-slate-600 mt-0.5 italic line-clamp-2">"{c.excerpt}"</p>
                                  {c.officialUrl && (
                                    <a href={c.officialUrl} target="_blank" rel="noreferrer" className="text-[10px] text-emerald-600 hover:underline flex items-center gap-1 mt-1">
                                      <ExternalLink className="w-2.5 h-2.5"/> {c.source}
                                    </a>
                                  )}
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    {(!msg.citations || msg.citations.length === 0) && !msg.citaEstricta?.degradada && (
                      <p className="text-[10px] text-slate-500 mb-1">
                        Esta respuesta no cita documentos verificados de la base.
                      </p>
                    )}

                    {msg.documentosConsultados && msg.documentosConsultados.length > 0 && (
                      <details className="mt-2">
                        <summary className="text-[10px] text-slate-500 cursor-pointer select-none">
                          Documentos consultados, no citados en la respuesta ({msg.documentosConsultados.length})
                        </summary>
                        <ul className="mt-1 space-y-0.5 pl-3">
                          {msg.documentosConsultados.map((d, k) => (
                            <li key={k} className="text-[10px] text-slate-600">
                              {d.reference}
                              {d.officialUrl && (
                                <a href={d.officialUrl} target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline ml-1">({d.source})</a>
                              )}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}

                    {msg.hallucinationWarning && (
                      <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 p-2 flex items-start gap-1.5">
                        <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0 mt-0.5"/>
                        <p className="text-[10px] text-amber-800">
                          Citas detectadas no verificables: {msg.hallucinationWarning.refs.join(', ')}. Verifica directamente en DOF/SAT.
                        </p>
                      </div>
                    )}

                    {msg.consultHash && (
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-200/40">
                        <span className="text-[10px] text-slate-500">¿Útil?</span>
                        <button onClick={() => sendFeedback(i, true)} disabled={!!msg.feedback}
                          className={`text-[10px] px-2 py-1 rounded-full flex items-center gap-1 ${msg.feedback === 'helpful' ? 'bg-emerald-500 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-emerald-50'}`}>
                          <ThumbsUp className="w-2.5 h-2.5"/> Sí
                        </button>
                        <button onClick={() => sendFeedback(i, false)} disabled={!!msg.feedback}
                          className={`text-[10px] px-2 py-1 rounded-full flex items-center gap-1 ${msg.feedback === 'unhelpful' ? 'bg-rose-500 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-rose-50'}`}>
                          <ThumbsDown className="w-2.5 h-2.5"/> No
                        </button>
                      </div>
                    )}
                  </div>
                )}
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
              <div className="bg-white/60 rounded-2xl px-4 py-3" role="status" aria-label="Generando respuesta">
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
          <div className="flex items-end gap-2 bg-white/60 rounded-xl px-4 py-2 border border-slate-200/50 focus-within:ring-2 focus-within:ring-emerald-500/30 transition-all">
            <textarea
              aria-label="Escribe tu pregunta"
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (!loading && input.trim()) handleSend()
                }
              }}
              rows={1}
              placeholder="Escribe tu pregunta... (Shift+Enter para salto de línea)"
              className="flex-1 bg-transparent text-[13px] text-slate-900 placeholder:text-slate-400 outline-none resize-none py-1 max-h-32 overflow-y-auto"
            />
            <button onClick={handleSend} disabled={loading || !input.trim()} aria-label="Enviar pregunta"
              className="w-8 h-8 shrink-0 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 flex items-center justify-center transition-colors">
              <Send className="w-3.5 h-3.5 text-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
