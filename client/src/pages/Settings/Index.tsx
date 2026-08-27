import { Link } from 'react-router-dom'
import { Building2, Shield, BadgeCheck, Bell, FileText, Users, Settings as SettingsIcon, Mail } from 'lucide-react'
import { usePermissions } from '../../hooks/usePermissions'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

type Tile = { to: string; icon: typeof Building2; label: string; desc: string; requiresSettings?: boolean }

const TILES: Tile[] = [
  { to: '/settings/empresa', icon: Building2, label: 'Empresa', desc: 'Razón social, RFC, plan, usuarios' },
  { to: '/settings/users', icon: Users, label: 'Usuarios y roles', desc: 'Permisos granulares y SOD (OEA)', requiresSettings: true },
  { to: '/settings/padrones', icon: Shield, label: 'Padrones SAT', desc: 'General y sectoriales (Anexo 10)' },
  { to: '/verificacion', icon: BadgeCheck, label: 'Verificación profesional', desc: 'Credenciales del agente aduanal' },
  { to: '/audit', icon: FileText, label: 'Audit Trail', desc: 'Registro de eventos con cadena de hashes verificable' },
  { to: '/alertas', icon: Bell, label: 'Notificaciones', desc: 'Alertas inteligentes' },
  { to: '/settings/digest', icon: Mail, label: 'Digest semanal', desc: 'Resumen por cliente: email / WhatsApp' },
]

export function SettingsIndexPage() {
  const { can } = usePermissions()
  const tiles = TILES.filter(t => !t.requiresSettings || can('classifier', 'settings'))
  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-center gap-2 mb-1">
          <SettingsIcon className="w-5 h-5 text-slate-700"/>
          <h1 className="text-xl font-bold text-slate-900">Configuración</h1>
        </div>
        <p className="text-[12px] text-slate-500">Administra los datos de tu empresa y preferencias.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {tiles.map(t => {
          const Icon = t.icon
          return (
            <Link key={t.to} to={t.to} className={`${GLASS} rounded-2xl p-5 hover:bg-white/90 transition-colors flex items-start gap-3`}>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-emerald-600"/>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-slate-900">{t.label}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{t.desc}</p>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
