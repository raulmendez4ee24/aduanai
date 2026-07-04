import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AppLayout } from './components/AppLayout'
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
import { AdminGlosaPage } from './pages/Admin/AdminGlosa'
import { AuditTrailPage } from './pages/AuditTrail'
import { EmpresaPage } from './pages/Settings/Empresa'
import { SettingsIndexPage } from './pages/Settings/Index'
import { UsersAndRolesPage } from './pages/Settings/Users'
import { InviteAcceptPage } from './pages/InviteAccept'
import { BibliotecaLegalPage } from './pages/BibliotecaLegal'
import { CuotasActivasPage } from './pages/CuotasActivas'
import { CumplimientoPage } from './pages/Cumplimiento'
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

      {/* Protected app routes */}
      <Route path="/app" element={
        <RequireAuth token={token} user={user}>
          <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><DashboardPage /></AppLayout>
        </RequireAuth>
      } />
      <Route path="/clasificador" element={
        <RequireAuth token={token} user={user}>
          <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><ClassifierPage /></AppLayout>
        </RequireAuth>
      } />
      <Route path="/cotizador" element={
        <RequireAuth token={token} user={user}>
          <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><QuoterPage /></AppLayout>
        </RequireAuth>
      } />
      <Route path="/copilot" element={
        <RequireAuth token={token} user={user}>
          <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><CopilotPage /></AppLayout>
        </RequireAuth>
      } />
      <Route path="/historial" element={
        <RequireAuth token={token} user={user}>
          <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><HistoryPage /></AppLayout>
        </RequireAuth>
      } />
      <Route path="/expediente" element={
        <RequireAuth token={token} user={user}>
          <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><OperationsPage /></AppLayout>
        </RequireAuth>
      } />
      <Route path="/expediente-ia" element={
        <RequireAuth token={token} user={user}>
          <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><ExpedientesAIPage /></AppLayout>
        </RequireAuth>
      } />
      <Route path="/prevalidador" element={
        <RequireAuth token={token} user={user}>
          <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><PreValidatorPage /></AppLayout>
        </RequireAuth>
      } />
      <Route path="/alertas" element={
        <RequireAuth token={token} user={user}>
          <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><AlertsPage /></AppLayout>
        </RequireAuth>
      } />
      <Route path="/analytics" element={
        <RequireAuth token={token} user={user}>
          <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><AnalyticsPage /></AppLayout>
        </RequireAuth>
      } />
      <Route path="/inventario" element={
        <RequireAuth token={token} user={user}>
          <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><InventoryPage /></AppLayout>
        </RequireAuth>
      } />
      <Route path="/fiscal" element={
        <RequireAuth token={token} user={user}>
          <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><FiscalPage /></AppLayout>
        </RequireAuth>
      } />
      <Route path="/mve" element={
        <RequireAuth token={token} user={user}>
          <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><MVEPage /></AppLayout>
        </RequireAuth>
      } />
      <Route path="/logistics" element={
        <RequireAuth token={token} user={user}>
          <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><LogisticsPage /></AppLayout>
        </RequireAuth>
      } />
      <Route path="/updates" element={
        <RequireAuth token={token} user={user}>
          <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><UpdatesPage /></AppLayout>
        </RequireAuth>
      } />
      <Route path="/fracciones" element={
        <RequireAuth token={token} user={user}>
          <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><FractionsPage /></AppLayout>
        </RequireAuth>
      } />
      <Route path="/origen-tmec" element={
        <RequireAuth token={token} user={user}>
          <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><OrigenTMECPage /></AppLayout>
        </RequireAuth>
      } />
      <Route path="/admin/compliance" element={
        <RequireAuth token={token} user={user}>
          <RequireSuperAdmin user={user}>
            <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><AdminCompliancePage /></AppLayout>
          </RequireSuperAdmin>
        </RequireAuth>
      } />
      <Route path="/precedentes" element={
        <RequireAuth token={token} user={user}>
          <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><PrecedentsPage /></AppLayout>
        </RequireAuth>
      } />
      <Route path="/admin/monitoring" element={
        <RequireAuth token={token} user={user}>
          <RequireSuperAdmin user={user}>
            <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><AdminMonitoringPage /></AppLayout>
          </RequireSuperAdmin>
        </RequireAuth>
      } />
      <Route path="/admin/security" element={
        <RequireAuth token={token} user={user}>
          <RequireSuperAdmin user={user}>
            <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><AdminSecurityPage /></AppLayout>
          </RequireSuperAdmin>
        </RequireAuth>
      } />
      <Route path="/admin/verifications" element={
        <RequireAuth token={token} user={user}>
          <RequireSuperAdmin user={user}>
            <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><AdminVerificationsPage /></AppLayout>
          </RequireSuperAdmin>
        </RequireAuth>
      } />
      <Route path="/verificacion" element={
        <RequireAuth token={token} user={user}>
          <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><VerificacionPage /></AppLayout>
        </RequireAuth>
      } />
      <Route path="/admin/backups" element={
        <RequireAuth token={token} user={user}>
          <RequireSuperAdmin user={user}>
            <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><AdminBackupsPage /></AppLayout>
          </RequireSuperAdmin>
        </RequireAuth>
      } />
      <Route path="/admin/demo-profiles" element={
        <RequireAuth token={token} user={user}>
          <RequireSuperAdmin user={user}>
            <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><AdminDemoProfilesPage /></AppLayout>
          </RequireSuperAdmin>
        </RequireAuth>
      } />
      <Route path="/admin/legal-docs" element={
        <RequireAuth token={token} user={user}>
          <RequireSuperAdmin user={user}>
            <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><AdminLegalDocsPage /></AppLayout>
          </RequireSuperAdmin>
        </RequireAuth>
      } />
      <Route path="/admin/antidumping" element={
        <RequireAuth token={token} user={user}>
          <RequireSuperAdmin user={user}>
            <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><AdminAntidumpingPage /></AppLayout>
          </RequireSuperAdmin>
        </RequireAuth>
      } />
      <Route path="/admin/timestamps" element={
        <RequireAuth token={token} user={user}>
          <RequireSuperAdmin user={user}>
            <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><AdminTimestampsPage /></AppLayout>
          </RequireSuperAdmin>
        </RequireAuth>
      } />
      <Route path="/admin/padrones" element={
        <RequireAuth token={token} user={user}>
          <RequireSuperAdmin user={user}>
            <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><AdminPadronesPage /></AppLayout>
          </RequireSuperAdmin>
        </RequireAuth>
      } />
      <Route path="/settings/padrones" element={
        <RequireAuth token={token} user={user}>
          <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><PadronesPage /></AppLayout>
        </RequireAuth>
      } />
      <Route path="/simulador-glosa" element={
        <RequireAuth token={token} user={user}>
          <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><GlosaSimulatorPage /></AppLayout>
        </RequireAuth>
      } />
      <Route path="/risk-scorer" element={
        <RequireAuth token={token} user={user}>
          <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><RiskScorerPage /></AppLayout>
        </RequireAuth>
      } />
      <Route path="/audit" element={
        <RequireAuth token={token} user={user}>
          <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><AuditTrailPage /></AppLayout>
        </RequireAuth>
      } />
      <Route path="/settings" element={
        <RequireAuth token={token} user={user}>
          <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><SettingsIndexPage /></AppLayout>
        </RequireAuth>
      } />
      <Route path="/settings/empresa" element={
        <RequireAuth token={token} user={user}>
          <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><EmpresaPage /></AppLayout>
        </RequireAuth>
      } />
      <Route path="/settings/users" element={
        <RequireAuth token={token} user={user}>
          <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><UsersAndRolesPage /></AppLayout>
        </RequireAuth>
      } />
      <Route path="/biblioteca-legal" element={
        <RequireAuth token={token} user={user}>
          <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><BibliotecaLegalPage /></AppLayout>
        </RequireAuth>
      } />
      <Route path="/cuotas-activas" element={
        <RequireAuth token={token} user={user}>
          <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><CuotasActivasPage /></AppLayout>
        </RequireAuth>
      } />
      <Route path="/cumplimiento" element={
        <RequireAuth token={token} user={user}>
          <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><CumplimientoPage /></AppLayout>
        </RequireAuth>
      } />
      <Route path="/admin/glosa-simulations" element={
        <RequireAuth token={token} user={user}>
          <RequireSuperAdmin user={user}>
            <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><AdminGlosaPage /></AppLayout>
          </RequireSuperAdmin>
        </RequireAuth>
      } />
      <Route path="/status" element={<StatusPage />} />

      <Route path="/admin" element={
        <RequireAuth token={token} user={user}>
          <RequireSuperAdmin user={user}>
            <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><AdminDashboardPage /></AppLayout>
          </RequireSuperAdmin>
        </RequireAuth>
      } />
      <Route path="/admin/leads" element={
        <RequireAuth token={token} user={user}>
          <RequireSuperAdmin user={user}>
            <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><AdminLeadsPage /></AppLayout>
          </RequireSuperAdmin>
        </RequireAuth>
      } />
      <Route path="/admin/knowledge" element={
        <RequireAuth token={token} user={user}>
          <RequireSuperAdmin user={user}>
            <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><AdminKnowledgePage /></AppLayout>
          </RequireSuperAdmin>
        </RequireAuth>
      } />
      <Route path="/admin/pilotos" element={
        <RequireAuth token={token} user={user}>
          <RequireSuperAdmin user={user}>
            <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><AdminPilotosPage /></AppLayout>
          </RequireSuperAdmin>
        </RequireAuth>
      } />
      <Route path="/admin/empresas" element={
        <RequireAuth token={token} user={user}>
          <RequireSuperAdmin user={user}>
            <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><AdminEmpresasPage /></AppLayout>
          </RequireSuperAdmin>
        </RequireAuth>
      } />
      <Route path="/admin/renovaciones" element={
        <RequireAuth token={token} user={user}>
          <RequireSuperAdmin user={user}>
            <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><AdminRenovacionesPage /></AppLayout>
          </RequireSuperAdmin>
        </RequireAuth>
      } />
      <Route path="/admin/metricas" element={
        <RequireAuth token={token} user={user}>
          <RequireSuperAdmin user={user}>
            <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><AdminMetricasPage /></AppLayout>
          </RequireSuperAdmin>
        </RequireAuth>
      } />
      <Route path="/admin/demo" element={
        <RequireAuth token={token} user={user}>
          <RequireSuperAdmin user={user}>
            <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><AdminDemoPage /></AppLayout>
          </RequireSuperAdmin>
        </RequireAuth>
      } />
      <Route path="/admin/audit" element={
        <RequireAuth token={token} user={user}>
          <RequireSuperAdmin user={user}>
            <AppLayout onLogout={handleLogout} userRole={user?.role} userName={user?.name} userEmail={user?.email} tenantName={user?.tenant?.name}><AdminAuditPage /></AppLayout>
          </RequireSuperAdmin>
        </RequireAuth>
      } />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </ErrorBoundary>
    </>
  )
}
