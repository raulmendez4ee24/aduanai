/**
 * SELLO · Shell v2 — configuración de navegación (fuente única).
 * La consumen: sidebar (AppShell), breadcrumb (topbar) y CommandPalette.
 * Cambiar el menú = editar ESTE archivo, no el layout.
 */
import type { ComponentType } from 'react'
import {
  House, FileSearch, ClipboardCheck, Radar, Library, Settings,
  Calculator, Bot, Clock, FolderOpen, Sparkles, ShieldCheck, LineChart,
  Warehouse, Landmark, FileText, Truck, Boxes, Globe, Scale, BadgeCheck,
  Megaphone, ListChecks, Building2, Users, Gauge, Database, ScanSearch,
} from 'lucide-react'

export interface NavItem {
  label: string
  path: string
  icono: ComponentType<{ className?: string; strokeWidth?: number }>
}

/** Navegación principal v2 — en este orden, por diseño. */
export const NAV_PRINCIPAL: NavItem[] = [
  { label: 'Inicio', path: '/app', icono: House },
  { label: 'Clasificador', path: '/clasificador', icono: FileSearch },
  { label: 'Pre-Glosa', path: '/simulador-glosa', icono: ClipboardCheck },
  // Regulatorio y Corpus: entradas listas — hoy aterrizan en las pantallas
  // actuales equivalentes (feed de alertas / biblioteca legal); cuando las
  // pantallas v2 lleguen, solo cambia el destino aquí.
  { label: 'Regulatorio', path: '/alertas', icono: Radar },
  { label: 'Corpus', path: '/biblioteca-legal', icono: Library },
  { label: 'Configuración', path: '/settings', icono: Settings },
]

/** Resto de herramientas del usuario (grupo colapsable — nada queda huérfano). */
export const NAV_HERRAMIENTAS: NavItem[] = [
  { label: 'Cotizador', path: '/cotizador', icono: Calculator },
  { label: 'Copilot', path: '/copilot', icono: Bot },
  { label: 'Historial', path: '/historial', icono: Clock },
  { label: 'Expedientes', path: '/expediente', icono: FolderOpen },
  { label: 'Expedientes IA', path: '/expediente-ia', icono: Sparkles },
  { label: 'Pre-validador', path: '/prevalidador', icono: ShieldCheck },
  { label: 'Radar de pedimentos', path: '/radar', icono: ScanSearch },
  { label: 'Risk Scorer', path: '/risk-scorer', icono: Scale },
  { label: 'Analytics', path: '/analytics', icono: LineChart },
  { label: 'Inventario IMMEX', path: '/inventario', icono: Warehouse },
  { label: 'Fiscal', path: '/fiscal', icono: Landmark },
  { label: 'Auto MVE', path: '/mve', icono: FileText },
  { label: 'Logística', path: '/logistics', icono: Truck },
  { label: 'Fracciones', path: '/fracciones', icono: Boxes },
  { label: 'Origen T-MEC', path: '/origen-tmec', icono: Globe },
  { label: 'Precedentes', path: '/precedentes', icono: Scale },
  { label: 'Cuotas activas', path: '/cuotas-activas', icono: ListChecks },
  { label: 'Cumplimiento', path: '/cumplimiento', icono: BadgeCheck },
  { label: 'Auditoría', path: '/audit', icono: ShieldCheck },
  { label: 'Verificación', path: '/verificacion', icono: BadgeCheck },
  { label: 'Novedades', path: '/updates', icono: Megaphone },
  // ── OPERACIÓN 2026-08 ── entradas nuevas (una línea por módulo)
  { label: 'Catálogo de partes', path: '/catalogo', icono: Boxes },
]

/** Admin (solo SUPERADMIN; grupo colapsable). */
export const NAV_ADMIN: NavItem[] = [
  { label: 'Panel admin', path: '/admin', icono: Gauge },
  { label: 'Leads', path: '/admin/leads', icono: Megaphone },
  { label: 'Empresas', path: '/admin/empresas', icono: Building2 },
  { label: 'Pilotos', path: '/admin/pilotos', icono: Users },
  { label: 'Renovaciones', path: '/admin/renovaciones', icono: Clock },
  { label: 'Métricas', path: '/admin/metricas', icono: LineChart },
  { label: 'Monitoreo', path: '/admin/monitoring', icono: Gauge },
  { label: 'Seguridad', path: '/admin/security', icono: ShieldCheck },
  { label: 'Backups', path: '/admin/backups', icono: Database },
  { label: 'Auditoría admin', path: '/admin/audit', icono: ListChecks },
  { label: 'Compliance', path: '/admin/compliance', icono: BadgeCheck },
  { label: 'Conocimiento', path: '/admin/knowledge', icono: Library },
  { label: 'Docs legales', path: '/admin/legal-docs', icono: FileText },
  { label: 'Antidumping', path: '/admin/antidumping', icono: Scale },
  { label: 'Timestamps', path: '/admin/timestamps', icono: Clock },
  { label: 'Padrones admin', path: '/admin/padrones', icono: ListChecks },
  { label: 'Verificaciones', path: '/admin/verifications', icono: BadgeCheck },
  { label: 'Glosa (admin)', path: '/admin/glosa-simulations', icono: ClipboardCheck },
  { label: 'Demo', path: '/admin/demo', icono: Sparkles },
  { label: 'Perfiles demo', path: '/admin/demo-profiles', icono: Users },
]

/** Rutas sin entrada de menú pero con breadcrumb (subrutas de settings, alias). */
const LABELS_EXTRA: Record<string, string> = {
  '/settings/empresa': 'Configuración · Empresa',
  '/settings/users': 'Configuración · Usuarios y roles',
  '/settings/padrones': 'Configuración · Padrones',
  '/alertas': 'Regulatorio',
  '/biblioteca-legal': 'Corpus',
  '/simulador-glosa': 'Pre-Glosa',
}

/** path → label para el breadcrumb del topbar. */
export const RUTA_LABELS: Record<string, string> = {
  ...Object.fromEntries([...NAV_PRINCIPAL, ...NAV_HERRAMIENTAS, ...NAV_ADMIN].map(i => [i.path, i.label])),
  ...LABELS_EXTRA,
}

export function labelDeRuta(pathname: string): string {
  return RUTA_LABELS[pathname] ?? (pathname.replace(/^\//, '').split('/').join(' · ') || 'ADUANAI')
}

/** Ítems del palette: usuario + (si aplica) admin. */
/** Entradas gateadas por flag del server: se ocultan hasta confirmar `true`. */
const RUTAS_GATEADAS: Record<string, 'radar'> = { '/radar': 'radar' }

export interface FlagsNav { radar: boolean | null }

export function filtrarPorFlags(items: NavItem[], flags: FlagsNav): NavItem[] {
  return items.filter(i => {
    const flag = RUTAS_GATEADAS[i.path]
    return !flag || flags[flag] === true
  })
}

export function rutasParaPalette(esSuperAdmin: boolean, flags: FlagsNav = { radar: true }): NavItem[] {
  const settingsExtras: NavItem[] = [
    { label: 'Configuración · Empresa', path: '/settings/empresa', icono: Building2 },
    { label: 'Configuración · Usuarios y roles', path: '/settings/users', icono: Users },
    { label: 'Configuración · Padrones', path: '/settings/padrones', icono: ListChecks },
  ]
  return filtrarPorFlags([
    ...NAV_PRINCIPAL,
    ...NAV_HERRAMIENTAS,
    ...settingsExtras,
    ...(esSuperAdmin ? NAV_ADMIN : []),
  ], flags)
}
