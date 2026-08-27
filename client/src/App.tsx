import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AppShell } from './components/shell/AppShell'
import { AboutPage } from './pages/Public/About'
import { TermsPage } from './pages/Public/Terms'
import { PrivacyPage } from './pages/Public/Privacy'
import { CookiesPage } from './pages/Public/Cookies'
import { ThankYouPage } from './pages/Public/ThankYou'
import { LoginPage } from './pages/Login'
import { RegisterPage } from './pages/Register'
import { VerifyEmailPage } from './pages/VerifyEmail'
import { ForgotPasswordPage } from './pages/ForgotPassword'
import { ResetPasswordPage } from './pages/ResetPassword'
import { DashboardPage } from './pages/Dashboard'
import { ClassifierPage } from './pages/Classifier'
import { QuoterPage } from './pages/Quoter'
import { CopilotPage } from './pages/Copilot'
import { HistoryPage } from './pages/History'
import { OperationsPage } from './pages/Operations'
import { AlertsPage } from './pages/Alerts'
import { AnalyticsPage } from './pages/Analytics'
import { InventoryPage } from './pages/Inventory'
import { FiscalPage } from './pages/Fiscal'
import { MVEPage } from './pages/MVE'
import { LogisticsPage } from './pages/Logistics'
import { UpdatesPage } from './pages/Updates'
import { PreValidatorPage } from './pages/PreValidator'
import { FractionsPage } from './pages/Fractions'
import { OrigenTMECPage } from './pages/OrigenTMEC'
import { AdminCompliancePage } from './pages/Admin/AdminCompliance'
import { AdminMonitoringPage } from './pages/Admin/AdminMonitoring'
import { AdminSecurityPage } from './pages/Admin/AdminSecurity'
import { AdminVerificationsPage } from './pages/Admin/AdminVerifications'
import { VerificacionPage } from './pages/Verificacion'
import { AdminBackupsPage } from './pages/Admin/AdminBackups'
import { AdminDemoProfilesPage } from './pages/Admin/AdminDemoProfiles'
import { AdminLegalDocsPage } from './pages/Admin/AdminLegalDocs'
import { AdminAntidumpingPage } from './pages/Admin/AdminAntidumping'
import { AdminTimestampsPage } from './pages/Admin/AdminTimestamps'
import { AdminPadronesPage } from './pages/Admin/AdminPadrones'
import { PadronesPage } from './pages/Settings/Padrones'
import { GlosaSimulatorPage } from './pages/GlosaSimulator'
import { RiskScorerPage } from './pages/RiskScorer'
import { RadarPedimentosPage } from './pages/RadarPedimentos'
import { DesignSystemPage } from './pages/DesignSystem'
import { AdminGlosaPage } from './pages/Admin/AdminGlosa'
import { AuditTrailPage } from './pages/AuditTrail'
import { EmpresaPage } from './pages/Settings/Empresa'
import { SettingsIndexPage } from './pages/Settings/Index'
// ── OPERACIÓN 2026-08 ── imports nuevos (una línea por módulo)
import { CalendarioPage } from './pages/Calendario'
import { CambioRegimenPage } from './pages/CambioRegimen'
import { ActivoFijoPage } from './pages/ActivoFijo'
import { DigestSettingsPage } from './pages/Settings/Digest'
import { UsersAndRolesPage } from './pages/Settings/Users'
import { InviteAcceptPage } from './pages/InviteAccept'
import { BibliotecaLegalPage } from './pages/BibliotecaLegal'
import { CuotasActivasPage } from './pages/CuotasActivas'
import { CumplimientoPage } from './pages/Cumplimiento'
// ── OPERACIÓN 2026-08 ── imports nuevos (una línea por módulo)
import { ClasificadorLotePage } from './pages/ClasificadorLote'
import { ClientesPage } from './pages/Clientes'
import { AprobacionesPage } from './pages/Aprobaciones'
import { CatalogoPage } from './pages/Catalogo'
import { DefensaPage } from './pages/Defensa' // Ola 3
import { StatusPage } from './pages/Public/Status'
import { PrecedentsPage } from './pages/Precedents'
import { AdminLeadsPage } from './pages/Admin/AdminLeads'
import { AdminKnowledgePage } from './pages/Admin/AdminKnowledge'
import { AdminDashboardPage } from './pages/Admin/AdminDashboard'
import { AdminEmpresasPage } from './pages/Admin/AdminEmpresas'
import { AdminPilotosPage } from './pages/Admin/AdminPilotos'
import { AdminRenovacionesPage } from './pages/Admin/AdminRenovaciones'
import { AdminMetricasPage } from './pages/Admin/AdminMetricas'
import { AdminDemoPage } from './pages/Admin/AdminDemo'
import { AdminAuditPage } from './pages/Admin/AdminAudit'
import { ExpedientesAIPage } from './pages/ExpedientesAI'
import { OnboardingWizard } from './components/OnboardingWizard'
import { api } from './lib/api'

interface User {
  id: string
  email: string
  name: string
  role: string
  emailVerified: boolean
  status: string
  onboardingCompleted?: boolean
  onboardingStep?: number
  tenant?: { id: string; name: string; plan: string; status: string }
}

function RequireAuth({ token, user, children }: { token: string | null; user: User | null; children: React.ReactNode }) {
  if (!token) return <Navigate to="/login" replace />
  if (token && user && !user.emailVerified) return <Navigate to="/verify" replace />
  return <>{children}</>
}

function RequireSuperAdmin({ user, children }: { user: User | null; children: React.ReactNode }) {
  if (user && user.role !== 'SUPERADMIN') {
    // Flash message via toast — leído por ToastHost al montarse en /app
    try {
      sessionStorage.setItem('aduanai:flash', JSON.stringify({
        message: 'No tienes permisos para acceder a esa página',
        severity: 'error',
        ts: Date.now(),
      }))
    } catch { /* silent */ }
    return <Navigate to="/app" replace />
  }
  return <>{children}</>
}

function RequireVerifyOnly({ token, children }: { token: string | null; children: React.ReactNode }) {
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RedirectIfAuthed({ token, user, children }: { token: string | null; user: User | null; children: React.ReactNode }) {
  if (token && user?.emailVerified) return <Navigate to="/app" replace />
  return <>{children}</>
}

export function App() {
  const location = useLocation()
  const [token, setToken] = useState<string | null>(localStorage.getItem('aduanai_token'))
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(!!localStorage.getItem('aduanai_token'))

  useEffect(() => {
    const stored = localStorage.getItem('aduanai_token')
    if (!stored) {
      setAuthLoading(false)
      return
    }
    api.me()
      .then(res => {
        setUser(res.data)
        setToken(stored)
      })
      .catch(() => {
        localStorage.removeItem('aduanai_token')
        setToken(null)
        setUser(null)
      })
      .finally(() => setAuthLoading(false))
  }, [])

  function handleLogin(newToken: string, newUser: User) {
    localStorage.setItem('aduanai_token', newToken)
    setToken(newToken)
    setUser(newUser)
  }

  function handleLogout() {
    api.logout().catch(() => {})
    localStorage.removeItem('aduanai_token')
    setToken(null)
    setUser(null)
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const showOnboarding = !!user && user.emailVerified && user.onboardingCompleted === false

  return (
    <>
      {showOnboarding && <OnboardingWizard user={user!} onComplete={() => setUser(prev => prev ? { ...prev, onboardingCompleted: true } : prev)} />}
    <ErrorBoundary resetKey={location.pathname}>
    <Routes>
      {/* Public */}
      {/* SELLO: espejo de QA visual — SOLO build de desarrollo (docs/DESIGN_SYSTEM.md §8) */}
      {import.meta.env.DEV && <Route path="/design-system" element={<DesignSystemPage />} />}
      <Route path="/" element={<AboutPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/terminos" element={<TermsPage />} />
      <Route path="/privacidad" element={<PrivacyPage />} />
      <Route path="/cookies" element={<CookiesPage />} />
      <Route path="/gracias" element={<ThankYouPage />} />

      {/* Auth pages — redirect to /app if already logged in and verified */}
      <Route
        path="/login"
        element={
          <RedirectIfAuthed token={token} user={user}>
            <LoginPage onLogin={handleLogin} />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/register"
        element={
          <RedirectIfAuthed token={token} user={user}>
            <RegisterPage onLogin={handleLogin} />
          </RedirectIfAuthed>
        }
      />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/invite/accept" element={<InviteAcceptPage onLogin={handleLogin} />} />

      {/* Verify — requires token but NOT emailVerified */}
      <Route
        path="/verify"
        element={
          <RequireVerifyOnly token={token}>
            <VerifyEmailPage userEmail={user?.email} onLogout={handleLogout} />
          </RequireVerifyOnly>
        }
      />

      {/* Protected app routes — Shell v2 como layout route (docs/DESIGN_SYSTEM.md). */}
      {/* Las páginas se renderizan vía <Outlet/> SIN rediseñar su contenido todavía. */}
      <Route element={
        <RequireAuth token={token} user={user}>
          <AppShell onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name} />
        </RequireAuth>
      }>
        <Route path="/app" element={<DashboardPage />} />
        <Route path="/clasificador" element={<ClassifierPage />} />
        <Route path="/cotizador" element={<QuoterPage />} />
        <Route path="/copilot" element={<CopilotPage />} />
        <Route path="/historial" element={<HistoryPage />} />
        <Route path="/expediente" element={<OperationsPage />} />
        <Route path="/expediente-ia" element={<ExpedientesAIPage />} />
        <Route path="/prevalidador" element={<PreValidatorPage />} />
        <Route path="/alertas" element={<AlertsPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/inventario" element={<InventoryPage />} />
        <Route path="/fiscal" element={<FiscalPage />} />
        <Route path="/mve" element={<MVEPage />} />
        <Route path="/logistics" element={<LogisticsPage />} />
        <Route path="/updates" element={<UpdatesPage />} />
        <Route path="/fracciones" element={<FractionsPage />} />
        <Route path="/origen-tmec" element={<OrigenTMECPage />} />
        <Route path="/precedentes" element={<PrecedentsPage />} />
        <Route path="/verificacion" element={<VerificacionPage />} />
        <Route path="/settings/padrones" element={<PadronesPage />} />
        <Route path="/simulador-glosa" element={<GlosaSimulatorPage />} />
        <Route path="/risk-scorer" element={<RiskScorerPage />} />
        <Route path="/radar" element={<RadarPedimentosPage />} />
        <Route path="/radar/:loteId" element={<RadarPedimentosPage />} />
        <Route path="/audit" element={<AuditTrailPage />} />
        <Route path="/settings" element={<SettingsIndexPage />} />
        <Route path="/settings/empresa" element={<EmpresaPage />} />
        <Route path="/settings/users" element={<UsersAndRolesPage />} />
        <Route path="/biblioteca-legal" element={<BibliotecaLegalPage />} />
        <Route path="/cuotas-activas" element={<CuotasActivasPage />} />
        <Route path="/cumplimiento" element={<CumplimientoPage />} />
        {/* ── OPERACIÓN 2026-08 ── rutas nuevas (una línea por módulo) */}
        <Route path="/clasificador/lote" element={<ClasificadorLotePage />} />
        <Route path="/clientes" element={<ClientesPage />} />
        <Route path="/aprobaciones" element={<AprobacionesPage />} />
        <Route path="/catalogo" element={<CatalogoPage />} />
        <Route path="/defensa" element={<DefensaPage />} />{/* Ola 3 — Cumplimiento + Auditoría */}
        <Route path="/calendario" element={<CalendarioPage />} />
        <Route path="/calendario/:id" element={<CalendarioPage />} />
        <Route path="/cambio-regimen" element={<CambioRegimenPage />} />
        <Route path="/activo-fijo" element={<ActivoFijoPage />} />
        <Route path="/settings/digest" element={<DigestSettingsPage />} />
        {/* Admin: mismo shell, guard adicional */}
        <Route element={<RequireSuperAdmin user={user}><Outlet /></RequireSuperAdmin>}>
          <Route path="/admin" element={<AdminDashboardPage />} />
          <Route path="/admin/compliance" element={<AdminCompliancePage />} />
          <Route path="/admin/monitoring" element={<AdminMonitoringPage />} />
          <Route path="/admin/security" element={<AdminSecurityPage />} />
          <Route path="/admin/verifications" element={<AdminVerificationsPage />} />
          <Route path="/admin/backups" element={<AdminBackupsPage />} />
          <Route path="/admin/demo-profiles" element={<AdminDemoProfilesPage />} />
          <Route path="/admin/legal-docs" element={<AdminLegalDocsPage />} />
          <Route path="/admin/antidumping" element={<AdminAntidumpingPage />} />
          <Route path="/admin/timestamps" element={<AdminTimestampsPage />} />
          <Route path="/admin/padrones" element={<AdminPadronesPage />} />
          <Route path="/admin/glosa-simulations" element={<AdminGlosaPage />} />
          <Route path="/admin/leads" element={<AdminLeadsPage />} />
          <Route path="/admin/knowledge" element={<AdminKnowledgePage />} />
          <Route path="/admin/pilotos" element={<AdminPilotosPage />} />
          <Route path="/admin/empresas" element={<AdminEmpresasPage />} />
          <Route path="/admin/renovaciones" element={<AdminRenovacionesPage />} />
          <Route path="/admin/metricas" element={<AdminMetricasPage />} />
          <Route path="/admin/demo" element={<AdminDemoPage />} />
          <Route path="/admin/audit" element={<AdminAuditPage />} />
        </Route>
      </Route>

      <Route path="/status" element={<StatusPage />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </ErrorBoundary>
    </>
  )
}
