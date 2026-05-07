import { useEffect, useState } from 'react'
import { AlertCircle, X } from 'lucide-react'

const STORAGE_KEY = 'aduanai:flash'
const EVENT = 'aduanai:flash'

export function showToast(message: string, severity: 'info' | 'error' | 'success' = 'info'): void {
  const payload = JSON.stringify({ message, severity, ts: Date.now() })
  try { sessionStorage.setItem(STORAGE_KEY, payload) } catch {}
  window.dispatchEvent(new CustomEvent(EVENT, { detail: payload }))
}

export function ToastHost() {
  const [item, setItem] = useState<{ message: string; severity: string } | null>(null)

  useEffect(() => {
    function pick(raw: string | null) {
      if (!raw) return
      try {
        const parsed = JSON.parse(raw) as { message: string; severity: string; ts: number }
        if (Date.now() - parsed.ts < 5000) {
          setItem({ message: parsed.message, severity: parsed.severity })
          try { sessionStorage.removeItem(STORAGE_KEY) } catch {}
          setTimeout(() => setItem(null), 4000)
        }
      } catch {}
    }
    // Pick anything pending al montar
    pick(sessionStorage.getItem(STORAGE_KEY))
    function onEvent(e: Event) { pick((e as CustomEvent<string>).detail) }
    window.addEventListener(EVENT, onEvent as EventListener)
    return () => window.removeEventListener(EVENT, onEvent as EventListener)
  }, [])

  if (!item) return null
  const colors = item.severity === 'error'
    ? 'bg-rose-600 text-white'
    : item.severity === 'success'
      ? 'bg-emerald-600 text-white'
      : 'bg-slate-900 text-white'
  return (
    <div className="fixed bottom-4 right-4 z-[200] animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className={`${colors} rounded-xl shadow-xl px-4 py-3 flex items-center gap-2 max-w-sm`}>
        <AlertCircle className="w-4 h-4 shrink-0"/>
        <p className="text-[12px] flex-1">{item.message}</p>
        <button onClick={() => setItem(null)} className="opacity-70 hover:opacity-100">
          <X className="w-3.5 h-3.5"/>
        </button>
      </div>
    </div>
  )
}
