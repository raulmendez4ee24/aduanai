import { useEffect, useState } from 'react'
import { ShieldCheck, AlertTriangle } from 'lucide-react'
import { api } from '../lib/api'
import type { ComplianceScore } from '../lib/api'

const STATUS_COLORS: Record<ComplianceScore['status'], { bar: string; bg: string; text: string }> = {
  EXCELENTE:   { bar: 'bg-emerald-500', bg: 'bg-emerald-50',  text: 'text-emerald-700' },
  BUENO:       { bar: 'bg-emerald-400', bg: 'bg-emerald-50',  text: 'text-emerald-600' },
  REGULAR:     { bar: 'bg-amber-500',   bg: 'bg-amber-50',    text: 'text-amber-700' },
  DEFICIENTE:  { bar: 'bg-rose-500',    bg: 'bg-rose-50',     text: 'text-rose-700' },
}

const SECTION_LABELS: Record<keyof ComplianceScore['breakdown'], string> = {
  expedientes:     'Expedientes',
  inventarios:     'Inventarios',
  certificacion:   'Certificación',
  alertas:         'Alertas atendidas',
  clasificaciones: 'Clasificaciones',
}

export function ComplianceGauge() {
  const [data, setData] = useState<ComplianceScore | null>(null)

  useEffect(() => {
    api.complianceScore().then(r => setData(r.data)).catch(() => {})
  }, [])

  if (!data) return null
  const palette = STATUS_COLORS[data.status]

  // SVG semicircle gauge
  const r = 60
  const circumference = Math.PI * r
  const dashOffset = circumference * (1 - data.score / 100)

  return (
    <div className="rounded-2xl bg-white shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          <p className="text-[14px] font-semibold text-slate-900">Compliance Score</p>
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${palette.bg} ${palette.text}`}>
          {data.status}
        </span>
      </div>

      {/* Semicircle gauge */}
      <div className="relative flex flex-col items-center mb-4">
        <svg width="160" height="90" viewBox="0 0 160 90">
          <path
            d={`M 20 80 A ${r} ${r} 0 0 1 140 80`}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="14"
            strokeLinecap="round"
          />
          <path
            d={`M 20 80 A ${r} ${r} 0 0 1 140 80`}
            fill="none"
            stroke="currentColor"
            className={palette.text}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 800ms ease-out' }}
          />
        </svg>
        <div className="absolute bottom-1 text-center">
          <p className="text-[36px] font-bold text-slate-900 leading-none">{data.score}</p>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider">/ 100</p>
        </div>
      </div>

      {/* Breakdown */}
      <div className="space-y-1.5 mb-3">
        {(Object.entries(data.breakdown) as [keyof ComplianceScore['breakdown'], ComplianceScore['breakdown']['expedientes']][]).map(([key, item]) => (
          <div key={key} className="flex items-center gap-2">
            <span className="text-[11px] text-slate-600 w-28">{SECTION_LABELS[key]}</span>
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={item.value >= 80 ? 'bg-emerald-500 h-full' : item.value >= 50 ? 'bg-amber-500 h-full' : 'bg-rose-500 h-full'}
                style={{ width: `${item.value}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-500 font-mono w-8 text-right">{item.value}</span>
          </div>
        ))}
      </div>

      {/* Recommendations */}
      {data.recommendations.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-1 mb-1.5">
            <AlertTriangle className="w-3 h-3 text-amber-500" />
            <p className="text-[11px] font-semibold text-slate-700">Recomendaciones</p>
          </div>
          <ul className="space-y-0.5">
            {data.recommendations.slice(0, 3).map((r, i) => (
              <li key={i} className="text-[11px] text-slate-600 flex items-start gap-1">
                <span className="text-slate-400 mt-0.5">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
