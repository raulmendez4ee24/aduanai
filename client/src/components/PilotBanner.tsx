import { useState, useEffect } from 'react'
import { Clock, Zap, MessageCircle, X } from 'lucide-react'
import { api } from '../lib/api'
import type { TenantStatusData } from '../lib/api'

const WHATSAPP_CONTRACT = 'https://wa.me/523326617755?text=Hola%2C%20quiero%20contratar%20ADUANAI'

export function PilotBanner() {
  const [status, setStatus] = useState<TenantStatusData | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let active = true
    api.tenantStatus()
      .then(res => { if (active) setStatus(res.data) })
      .catch(() => { /* silent */ })
    const interval = setInterval(() => {
      api.tenantStatus().then(res => { if (active) setStatus(res.data) }).catch(() => {})
    }, 300000)
    return () => { active = false; clearInterval(interval) }
  }, [])

  if (!status || !status.isPilot || dismissed) return null

  const daysLeft = status.pilotDaysLeft ?? 0
  const used = status.classificationsUsed
  const limit = status.classificationLimit ?? 100
  const usedPct = Math.min(100, Math.round((used / limit) * 100))
  const urgent = daysLeft <= 7

  const tone = urgent
    ? 'from-amber-500/90 via-orange-500/90 to-rose-500/90'
    : 'from-emerald-500/90 via-teal-500/90 to-cyan-500/90'

  return (
    <div className="px-3 pt-3">
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-r ${tone} text-white shadow-lg`}>
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.3) 0%, transparent 50%)',
        }} />
        <div className="relative flex flex-wrap items-center gap-4 px-5 py-3">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-widest opacity-80">Periodo de prueba</p>
              <p className="text-[14px] font-semibold leading-tight">
                {daysLeft > 0
                  ? <>Te quedan <span className="font-bold">{daysLeft} día{daysLeft !== 1 ? 's' : ''}</span></>
                  : 'Tu piloto venció'}
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 shrink-0 text-[12px]">
            <Clock className="w-3.5 h-3.5 opacity-80" />
            <div className="flex flex-col min-w-[140px]">
              <div className="flex justify-between">
                <span className="opacity-80">Clasificaciones</span>
                <span className="font-semibold">{used}/{limit}</span>
              </div>
              <div className="h-1.5 bg-white/20 rounded-full overflow-hidden mt-1">
                <div className="h-full bg-white rounded-full transition-all" style={{ width: `${usedPct}%` }} />
              </div>
            </div>
          </div>

          <div className="flex-1" />

          <a
            href={WHATSAPP_CONTRACT}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white text-[13px] font-semibold text-slate-900 hover:bg-white/90 transition-colors shadow-sm"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Hablar con asesor
          </a>

          <button
            onClick={() => setDismissed(true)}
            aria-label="Cerrar"
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
