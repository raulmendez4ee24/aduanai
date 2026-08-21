const API_BASE = '/api';

// Fase 4.5: guard para no disparar N redirects cuando varias peticiones
// paralelas (Dashboard carga 7 a la vez) reciben 401 al mismo tiempo.
let redirectingToLogin = false;

async function request<T>(path: string, options?: RequestInit, timeoutMs?: number): Promise<T> {
  const token = localStorage.getItem('aduanai_token');
  const controller = timeoutMs !== undefined ? new AbortController() : undefined;
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      ...(controller ? { signal: controller.signal } : {}),
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options?.headers,
      },
    });

    if (!res.ok) {
      // Fase 4.5: sesión expirada — antes cada módulo se tragaba el 401 y
      // pintaba "Sin clasificaciones"/"Sin inventario" como si no hubiera datos.
      // Un 401 con token presente = token vencido/revocado → limpiar y mandar a
      // login con mensaje. Los endpoints /auth/* se excluyen (ahí un 401 es
      // credencial inválida y lo maneja su propia pantalla).
      if (res.status === 401 && token && !path.startsWith('/auth/')) {
        if (!redirectingToLogin) {
          redirectingToLogin = true;
          localStorage.removeItem('aduanai_token');
          window.location.href = '/login?expired=1';
        }
        throw new Error('Tu sesión expiró. Inicia sesión de nuevo.');
      }
      // BUG-1 (24-ago-2026): un 502/503/504 del gateway trae HTML crudo de la
      // plataforma ("Application failed to respond") — NUNCA se muestra ese
      // texto al usuario. Se normaliza a un mensaje claro y reintentable.
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        throw new Error('El servicio no respondió (error temporal). Intenta de nuevo en unos segundos.');
      }
      const error = await res.json().catch(() => ({ message: null }));
      throw new Error(error.message || `El servidor respondió con un error (${res.status}). Intenta de nuevo.`);
    }

    // Respuesta 200 que no es JSON (p. ej. una página de error interpuesta):
    // mensaje claro, nunca el SyntaxError del parser.
    try {
      return await res.json();
    } catch {
      throw new Error('El servidor devolvió una respuesta inválida. Intenta de nuevo.');
    }
  } catch (error) {
    if (controller?.signal.aborted) {
      throw new Error('La consulta tardó demasiado. Intenta de nuevo.');
    }
    throw error;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

export const api = {
  // Auth
  login: (email: string, password: string, rememberMe?: boolean) =>
    request<{ token: string; refreshToken: string; user: { id: string; email: string; name: string; role: string; emailVerified: boolean; status: string } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, rememberMe }),
    }),

  register: (data: { email: string; password: string; name: string; companyName: string; phone?: string; rfc?: string }) =>
    request<{ token: string; refreshToken: string; user: { id: string; email: string; name: string; role: string; emailVerified: boolean; status: string } }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  me: () =>
    request<{ status: string; data: { id: string; email: string; name: string; role: string; emailVerified: boolean; status: string; phone?: string; lastLoginAt?: string; createdAt: string } }>('/auth/me'),

  logout: (refreshToken?: string) =>
    request<{ status: string }>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),

  verifyEmail: (code: string) =>
    request<{ status: string; message: string }>('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  resendCode: (type?: string) =>
    request<{ status: string; message: string }>('/auth/resend-code', {
      method: 'POST',
      body: JSON.stringify({ type: type || 'email_verify' }),
    }),

  forgotPassword: (email: string) =>
    request<{ status: string; message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  verifyResetCode: (email: string, code: string) =>
    request<{ status: string; resetToken: string }>('/auth/verify-reset-code', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    }),

  resetPassword: (resetToken: string, newPassword: string) =>
    request<{ status: string; message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ resetToken, newPassword }),
    }),

  // Clasificador — asíncrono (BUG-1/BUG-2): el POST crea un job y responde
  // 202 de inmediato; el resultado se obtiene con polling a classifyJob().
  classifyStart: (
    description: string,
    context?: string,
    countryOfOrigin?: string,
    declaredValueUSD?: number,
    extras?: { useCase?: string; sector?: IndustrialSector; importerType?: ImporterType; declaredQuantity?: number },
  ) =>
    request<{ status: string; jobId: string; reused: boolean; description: string | null }>('/classify', {
      method: 'POST',
      body: JSON.stringify({ description, context, countryOfOrigin, declaredValueUSD, ...extras }),
    }, 30000),

  classifyJob: (jobId: string) =>
    request<{
      status: string;
      job: {
        id: string;
        status: 'queued' | 'running' | 'done' | 'error';
        createdAt: string;
        startedAt: string | null;
        finishedAt: string | null;
        description: string | null;
        error: { code: string; message: string; retriable: boolean } | null;
        classificationId: string | null;
        result: ClassificationResult | null;
      };
    }>(`/classify/jobs/${encodeURIComponent(jobId)}`, undefined, 15000),

  classifyHistory: (search?: string, page = 1) =>
    request<{ status: string; data: ClassificationRecord[]; pagination: { page: number; total: number } }>(
      `/classify/history?page=${page}&limit=20${search ? `&search=${encodeURIComponent(search)}` : ''}`
    ),

  classifyFeedback: (id: string, feedback: 'correct' | 'incorrect' | 'partial', feedbackNote?: string) =>
    request<{ status: string }>(`/classify/${id}/feedback`, {
      method: 'PATCH',
      body: JSON.stringify({ feedback, feedbackNote }),
    }),

  classifyApprove: (id: string) =>
    request<{ status: string; data: ClassificationRecord }>(`/classify/${id}/approve`, { method: 'POST' }),

  quoteApprove: (id: string) =>
    request<{ status: string; data: { id: string; status: string; approvedAt: string | null } }>(`/quote/${id}/approve`, { method: 'POST' }),

  // Knowledge base (admin)
  knowledgeList: (filters: { type?: string; chapter?: string; verified?: boolean; search?: string } = {}) => {
    const qs = new URLSearchParams();
    if (filters.type) qs.set('type', filters.type);
    if (filters.chapter) qs.set('chapter', filters.chapter);
    if (filters.verified !== undefined) qs.set('verified', String(filters.verified));
    if (filters.search) qs.set('search', filters.search);
    return request<{ status: string; data: KnowledgeRecord[] }>(`/knowledge${qs.toString() ? `?${qs}` : ''}`);
  },

  knowledgeCreate: (data: Partial<KnowledgeRecord>) =>
    request<{ status: string; data: KnowledgeRecord }>('/knowledge', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  knowledgeUpdate: (id: string, data: Partial<KnowledgeRecord>) =>
    request<{ status: string; data: KnowledgeRecord }>(`/knowledge/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  knowledgeVerify: (id: string) =>
    request<{ status: string; data: KnowledgeRecord }>(`/knowledge/${id}/verify`, { method: 'POST' }),

  knowledgeDelete: (id: string) =>
    request<{ status: string }>(`/knowledge/${id}`, { method: 'DELETE' }),

  knowledgeImport: (items: Partial<KnowledgeRecord>[]) =>
    request<{ status: string; created: number; errors: string[] }>('/knowledge/import', {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),

  knowledgeAccuracy: () =>
    request<{ status: string; data: { chapter: string; total: number; correct: number; accuracy: number; alert: string | null }[] }>('/knowledge/accuracy'),

  // Stats
  stats: () =>
    request<{ status: string; data: StatsData }>('/stats'),

  statsVolume: (days = 30) =>
    request<{ status: string; data: VolumeDay[] }>(`/stats/volume?days=${days}`),

  // Cotizador
  quote: (data: QuoteInput) =>
    request<{ status: string; data: QuoteResult }>('/quote', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Alertas
  alerts: () =>
    request<{ status: string; data: Alert[] }>('/alerts'),

  alertsUnreadCount: () =>
    request<{ status: string; data: { count: number } }>('/alerts/unread-count'),

  alertMarkRead: (id: string) =>
    request<{ status: string }>(`/alerts/${id}/read`, { method: 'PATCH' }),

  alertMarkAllRead: () =>
    request<{ status: string }>('/alerts/read-all', { method: 'POST' }),

  alertAcknowledge: (id: string) =>
    request<{ status: string }>(`/alerts/${id}/acknowledge`, { method: 'PATCH' }),

  alertSnooze: (id: string, days = 7) =>
    request<{ status: string; data: { snoozedUntil: string } }>(`/alerts/${id}/snooze`, {
      method: 'PATCH',
      body: JSON.stringify({ days }),
    }),

  alertResolve: (id: string) =>
    request<{ status: string }>(`/alerts/${id}/resolve`, { method: 'PATCH' }),

  alertIgnore: (id: string) =>
    request<{ status: string }>(`/alerts/${id}/ignore`, { method: 'PATCH' }),

  alertsRegenerate: () =>
    request<{ status: string; data: { inserted: number; updated: number; specs: number } }>('/alerts/regenerate', { method: 'POST' }),

  // Monitoring (admin)
  monitoringOverview: () =>
    request<{ status: string; data: MonitoringOverview }>('/admin/monitoring/overview'),

  monitoringLogs: (filters: { level?: string; endpoint?: string; tenantId?: string; userId?: string; since?: string; limit?: number; cursor?: string } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v != null && v !== '') qs.set(k, String(v)); });
    return request<{ status: string; data: SystemLogRecord[]; nextCursor: string | null }>(`/admin/monitoring/logs?${qs.toString()}`);
  },

  monitoringErrors: (since?: string) =>
    request<{ status: string; data: ErrorGroup[] }>(`/admin/monitoring/errors${since ? `?since=${encodeURIComponent(since)}` : ''}`),

  monitoringAICosts: (range: 'day' | 'week' | 'month' | 'year' = 'month') =>
    request<{ status: string; data: AICostsReport }>(`/admin/monitoring/ai-costs?range=${range}`),

  monitoringBusiness: () =>
    request<{ status: string; data: BusinessMetrics }>('/admin/monitoring/business'),

  monitoringHealth: () =>
    request<HealthStatus>('/health'),

  // Security panel (admin)
  securityOverview: () =>
    request<{ status: string; data: SecurityOverview }>('/admin/security/overview'),

  securityEvents: (filters: { type?: string; severity?: string; ip?: string; since?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v != null && v !== '') qs.set(k, String(v)); });
    return request<{ status: string; data: SecurityEventRecord[] }>(`/admin/security/events?${qs.toString()}`);
  },

  securityBlockedIPs: () =>
    request<{ status: string; data: BlockedIPRecord[] }>('/admin/security/blocked-ips'),

  securityUnblockIP: (ip: string) =>
    request<{ status: string }>(`/admin/security/blocked-ips/${encodeURIComponent(ip)}/unblock`, { method: 'POST' }),

  securityLockedUsers: () =>
    request<{ status: string; data: LockedUserRecord[] }>('/admin/security/locked-users'),

  securityUnlockUser: (id: string) =>
    request<{ status: string }>(`/admin/security/users/${id}/unlock`, { method: 'POST' }),

  securityTenantsRFC: () =>
    request<{ status: string; data: TenantRFCFlag[] }>('/admin/security/tenants-rfc'),

  validateRFC: (rfc: string, options: { allowGeneric?: boolean; expectedType?: 'moral' | 'fisica' } = {}) =>
    request<{ status: string; data: RFCValidationResult }>('/validate/rfc', {
      method: 'POST',
      body: JSON.stringify({ rfc, ...options }),
    }),

  // Verificación profesional
  verificationMe: () =>
    request<{ status: string; data: UserVerificationRecord | null }>('/verification/me'),

  verificationLookup: (patente: string) =>
    request<{ status: string; data: PatenteLookup }>('/verification/lookup', {
      method: 'POST',
      body: JSON.stringify({ patente }),
    }),

  verificationSubmit: (input: {
    professionalType: 'agent_customs' | 'broker' | 'importer' | 'consultant' | 'other';
    agentPatente?: string;
    agentSocialName?: string;
    agentPort?: string;
    patenteDocUrl?: string;
    rfcDocUrl?: string;
    cspDocUrl?: string;
    notes?: string;
  }) =>
    request<{ status: string; data: { id: string; preApproved: boolean } }>('/verification/submit', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  verificationPending: () =>
    request<{ status: string; data: UserVerificationWithUser[] }>('/verification/pending'),

  verificationAll: (status?: string) =>
    request<{ status: string; data: UserVerificationWithUser[] }>(`/verification/all${status ? `?status=${status}` : ''}`),

  verificationExpiring: () =>
    request<{ status: string; data: UserVerificationWithUser[] }>('/verification/expiring'),

  verificationApprove: (id: string) =>
    request<{ status: string }>(`/verification/${id}/approve`, { method: 'POST' }),

  verificationReject: (id: string, reason: string) =>
    request<{ status: string }>(`/verification/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  // Backups & Restores
  backupsList: (filters: { type?: string; status?: string } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) qs.set(k, String(v)); });
    return request<{ status: string; data: BackupRecord[] }>(`/admin/backups?${qs.toString()}`);
  },

  backupConfig: () =>
    request<{ status: string; data: BackupConfig }>('/admin/backups/config'),

  backupRun: (type: 'daily' | 'weekly' | 'monthly' | 'manual' = 'manual') =>
    request<{ status: string; data: { success: boolean; backupId: string; error?: string } }>('/admin/backups/run', {
      method: 'POST',
      body: JSON.stringify({ type }),
    }),

  backupCleanup: () =>
    request<{ status: string; data: { deleted: number } }>('/admin/backups/cleanup', { method: 'POST' }),

  backupRestore: (id: string, type: 'full' | 'partial' | 'test', reason?: string, confirm?: string) =>
    request<{ status: string; data: { success: boolean; restoreId: string; error?: string } }>(`/admin/backups/${id}/restore`, {
      method: 'POST',
      body: JSON.stringify({ type, reason, confirm }),
    }),

  backupRestoreLog: () =>
    request<{ status: string; data: RestoreLogRecord[] }>('/admin/backups/restores'),

  backupDelete: (id: string) =>
    request<{ status: string }>(`/admin/backups/${id}`, { method: 'DELETE' }),

  // Incidents (admin)
  incidentsList: () =>
    request<{ status: string; data: SystemIncidentRecord[] }>('/admin/incidents'),

  incidentCreate: (data: { title: string; description: string; severity: string; components?: string[]; publicVisible?: boolean }) =>
    request<{ status: string; data: SystemIncidentRecord }>('/admin/incidents', { method: 'POST', body: JSON.stringify(data) }),

  incidentUpdate: (id: string, data: { update?: string; status?: string; resolution?: string; rootCause?: string }) =>
    request<{ status: string; data: SystemIncidentRecord }>(`/admin/incidents/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Catálogos oficiales Anexo 22 (fuente única en server/lib/anexo22.ts — Fase 4.1/4.2)
  catalogsAnexo22: () =>
    request<{ status: string; data: Anexo22Catalogs }>('/catalogs/anexo22'),

  // Risk Scorer — responsabilidad solidaria (motor determinista)
  riskAssess: (input: RiskAssessInput) =>
    request<{ status: string; data: RiskAssessResult }>('/risk/assess', { method: 'POST', body: JSON.stringify(input) }),

  // Glosa Simulator
  glosaSimulate: (input: GlosaSimulationInput) =>
    request<{ status: string; data: GlosaSimulationResult }>('/glosa/simulate', { method: 'POST', body: JSON.stringify(input) }),
  glosaHistory: () =>
    request<{ status: string; data: GlosaSimulationListItem[] }>('/glosa/history'),
  glosaGet: (id: string) =>
    request<{ status: string; data: GlosaSimulationFull }>(`/glosa/${id}`),
  glosaOutcome: (id: string, outcome: 'ra_yes' | 'ra_no' | 'documental' | 'free', notes?: string) =>
    request<{ status: string }>(`/glosa/${id}/outcome`, { method: 'POST', body: JSON.stringify({ outcome, notes }) }),
  glosaRules: () =>
    request<{ status: string; data: GlosaRiskRuleRecord[] }>('/glosa/rules/list'),

  glosaAdminStats: () =>
    request<{ status: string; data: GlosaStats }>('/admin/glosa/stats'),
  glosaAdminRules: () =>
    request<{ status: string; data: GlosaRiskRuleRecord[] }>('/admin/glosa/rules'),
  glosaAdminUpdateRule: (id: string, body: { weight?: number; severity?: 'low' | 'medium' | 'high' | 'critical'; active?: boolean }) =>
    request<{ status: string; data: GlosaRiskRuleRecord }>(`/admin/glosa/rules/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  // Permisos granulares
  permissionsMe: () =>
    request<{ status: string; data: UserPermissions }>('/permissions/me'),
  permissionsRoles: () =>
    request<{ status: string; data: TenantRoleRecord[] }>('/permissions/roles'),
  permissionsUsers: () =>
    request<{ status: string; data: TenantUserWithRoles[] }>('/permissions/users'),
  permissionsAssign: (input: { userId: string; roleCode: string; reason?: string; forceOverrideConflict?: boolean }) =>
    request<{ status: string; data: { userRoleId: string; conflict?: SODConflict | null } }>('/permissions/assign', { method: 'POST', body: JSON.stringify(input) }),
  permissionsRemove: (input: { userId: string; roleId: string; reason?: string }) =>
    request<{ status: string }>('/permissions/remove', { method: 'POST', body: JSON.stringify(input) }),
  permissionsCheckConflict: (userId: string, roleCode: string) =>
    request<{ status: string; data: SODConflict }>('/permissions/check-conflict', { method: 'POST', body: JSON.stringify({ userId, roleCode }) }),
  permissionsAudit: (filters: { action?: string; userId?: string } = {}) => {
    const qs = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => { if (v) qs.set(k, String(v)) })
    return request<{ status: string; data: PermissionAuditEntry[] }>(`/permissions/audit?${qs.toString()}`)
  },
  permissionsOEAReport: () =>
    request<{ status: string; data: OEAReport }>('/permissions/oea-report'),

  // Invitations
  permissionsInvite: (input: { email: string; name: string; initialRoleCodes: string[] }) =>
    request<{ status: string; data: { id: string; email: string; expiresAt: string; acceptUrl: string } }>('/permissions/users/invite', { method: 'POST', body: JSON.stringify(input) }),
  permissionsInvitations: () =>
    request<{ status: string; data: InvitationRecord[] }>('/permissions/users/invitations'),
  permissionsInvitationResend: (id: string) =>
    request<{ status: string; data: { id: string; expiresAt: string } }>(`/permissions/users/invitations/${id}/resend`, { method: 'POST' }),
  permissionsInvitationCancel: (id: string) =>
    request<{ status: string }>(`/permissions/users/invitations/${id}`, { method: 'DELETE' }),
  acceptInvitation: (token: string, password: string) =>
    request<{ token: string; refreshToken: string; expiresIn: number; user: { id: string; email: string; name: string; role: string; emailVerified: boolean; status: string }; assignedRoles: string[] }>('/auth/accept-invitation', { method: 'POST', body: JSON.stringify({ token, password }) }),

  // Settings (datos de mi empresa)
  settingsEmpresa: () =>
    request<{ status: string; data: TenantSettings }>('/settings/empresa'),
  settingsEmpresaUpdate: (body: { name?: string; rfc?: string }) =>
    request<{ status: string; data: { id: string; name: string; rfc: string | null; plan: string; status: string } }>('/settings/empresa', { method: 'PATCH', body: JSON.stringify(body) }),
  settingsUsers: () =>
    request<{ status: string; data: TenantUser[] }>('/settings/users'),

  // Cuotas activas (vista usuario filtrada por sector del tenant)
  antidumpingActive: (filters: { country?: string; fraction?: string; scope?: 'tenant' | 'all' } = {}) => {
    const qs = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => { if (v) qs.set(k, String(v)) })
    return request<{ status: string; data: AntidumpingDutyRecord[]; scope: string }>(`/antidumping/active?${qs.toString()}`)
  },

  // Biblioteca Legal (búsqueda en RAG)
  legalLibraryList: (filters: { type?: string; source?: string; q?: string } = {}) => {
    const qs = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => { if (v) qs.set(k, String(v)) })
    return request<{ status: string; data: LegalDocSummary[] }>(`/legal-library?${qs.toString()}`)
  },
  legalLibraryGet: (id: string) =>
    request<{ status: string; data: LegalDocFull }>(`/legal-library/${id}`),
  legalLibrarySources: () =>
    request<{ status: string; data: { source: string; count: number }[] }>('/legal-library/sources/list'),

  // Audit Trail (vista usuario — endpoints user-side, distintos a los admin de arriba)
  myAuditList: (filters: { entity?: string; action?: string; q?: string; page?: number; limit?: number; dateFrom?: string; dateTo?: string } = {}) => {
    const qs = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => { if (v !== undefined && v !== '') qs.set(k, String(v)) })
    return request<{ status: string; data: AuditLogRecord[]; pagination: { page: number; limit: number; total: number } }>(`/audit?${qs.toString()}`)
  },
  myAuditVerifyChain: () =>
    request<{ status: string; data: { valid: boolean; brokenAt?: string; checkedCount: number } }>('/audit/verify-chain'),
  myAuditTimestamps: () =>
    request<{ status: string; data: { resourceId: string; contentHash: string; status: string; bitcoinBlock: number | null; bitcoinTimestamp: string | null; submittedAt: string; confirmedAt: string | null }[] }>('/audit/timestamps'),

  // Padrones SAT
  padronesList: (type?: string) =>
    request<{ status: string; data: SATPadronRecord[] }>(`/padrones/list${type ? `?type=${type}` : ''}`),
  padronesCheck: (fraction: string) =>
    request<{ status: string; data: PadronCheckResultData }>(`/padrones/check?fraction=${encodeURIComponent(fraction)}`),
  padronesMine: () =>
    request<{ status: string; data: TenantPadronStatusRecord[] }>('/padrones/me'),
  padronesDeclare: (input: PadronDeclareInput) =>
    request<{ status: string; data: TenantPadronStatusRecord }>('/padrones/me/declare', { method: 'POST', body: JSON.stringify(input) }),
  padronesLetterURL: (padronId: string) => `/api/padrones/me/letter/${padronId}`,

  padronesAdminList: (status?: string) =>
    request<{ status: string; data: (TenantPadronStatusRecord & { tenant: { id: string; name: string; rfc: string | null } | null })[] }>(`/admin/padrones${status ? `?status=${status}` : ''}`),
  padronesAdminByPadron: () =>
    request<{ status: string; data: { padron: SATPadronRecord; total: number; breakdown: Record<string, number> }[] }>('/admin/padrones/by-padron'),
  padronesAdminPending: () =>
    request<{ status: string; data: (TenantPadronStatusRecord & { tenant: { id: string; name: string; rfc: string | null } | null })[] }>('/admin/padrones/pending'),
  padronesAdminApprove: (id: string) =>
    request<{ status: string; data: TenantPadronStatusRecord }>(`/admin/padrones/${id}/approve`, { method: 'POST' }),
  padronesAdminReject: (id: string, reason: string) =>
    request<{ status: string; data: TenantPadronStatusRecord }>(`/admin/padrones/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  padronesAdminExposure: (tenantId: string) =>
    request<{ status: string; data: PadronExposureReport }>(`/admin/padrones/exposure/${tenantId}`),

  // OpenTimestamps (Bitcoin anchor)
  timestampVerifyURL: (hash: string) => `/verify/timestamp/${hash}`,
  timestampDownloadURL: (hash: string) => `/verify/timestamp/${hash}/proof.ots`,

  timestampsList: (filters: { status?: string; resourceType?: string } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) qs.set(k, String(v)); });
    return request<{ status: string; data: TimestampProofRecord[] }>(`/admin/timestamps?${qs.toString()}`);
  },

  timestampsStats: () =>
    request<{ status: string; data: TimestampStats }>('/admin/timestamps/stats'),

  timestampsCheckPending: () =>
    request<{ status: string; data: { checked: number; confirmed: number; reSubmitted: number } }>('/admin/timestamps/check-pending', { method: 'POST' }),

  // Antidumping
  antidumpingCheck: (input: { fractionCode: string; countryOfOrigin: string; valueUSD?: number; weightKg?: number; units?: number }) =>
    request<{ status: string; data: AntidumpingCheckResult[] }>('/antidumping/check', { method: 'POST', body: JSON.stringify(input) }),

  antidumpingExposure: () =>
    request<{ status: string; data: ExposureReport }>('/antidumping/exposure'),

  antidumpingList: (filters: { country?: string; fraction?: string; status?: string } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) qs.set(k, String(v)); });
    return request<{ status: string; data: AntidumpingDutyRecord[] }>(`/admin/antidumping?${qs.toString()}`);
  },

  antidumpingExpiring: () =>
    request<{ status: string; data: AntidumpingDutyRecord[] }>('/admin/antidumping/expiring'),

  antidumpingExposureByTenant: (tenantId: string) =>
    request<{ status: string; data: ExposureReport }>(`/admin/antidumping/exposure-by-tenant?tenantId=${encodeURIComponent(tenantId)}`),

  antidumpingPatch: (id: string, data: Partial<{ status: string; expiryDate: string; rate: number; notes: string; active: boolean }>) =>
    request<{ status: string }>(`/admin/antidumping/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Demo profiles (admin)
  demoProfiles: () =>
    request<{ status: string; data: DemoProfile[] }>('/admin/demo/profiles'),

  demoProfileLoad: (profileCode: string, tenantId: string) =>
    request<{ status: string; data: { profile: { code: string; name: string }; imports: number; classifications: number; quotes: number; alerts: number } }>('/admin/demo/load', {
      method: 'POST',
      body: JSON.stringify({ profileCode, tenantId }),
    }),

  demoProfileClear: (tenantId: string) =>
    request<{ status: string }>('/admin/demo/clear', {
      method: 'POST',
      body: JSON.stringify({ tenantId }),
    }),

  demoProfileCreateAll: () =>
    request<{ status: string; data: { created: { profileCode: string; tenantId: string; email: string; userId: string }[]; password: string } }>('/admin/demo/tenants/create-all', { method: 'POST' }),

  // Status pública (sin auth)
  statusPublic: () =>
    fetch('/api/status').then(r => r.json() as Promise<{ status: string; data: PublicStatus }>),

  statusIncidents: () =>
    fetch('/api/status/incidents').then(r => r.json() as Promise<{ status: string; data: SystemIncidentRecord[] }>),

  statusSubscribe: (email: string) =>
    fetch('/api/status/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }).then(r => r.json()),

  // Fracciones
  searchFractions: (q: string) =>
    request<{ status: string; data: FractionSearchResult[] }>(`/fractions/search?q=${encodeURIComponent(q)}`),

  watchFraction: (fractionCode: string) =>
    request<{ status: string }>('/alerts/watch', {
      method: 'POST',
      body: JSON.stringify({ fractionCode }),
    }),

  unwatchFraction: (code: string) =>
    request<{ status: string }>(`/alerts/watch/${code}`, { method: 'DELETE' }),

  watchedFractions: () =>
    request<{ status: string; data: FractionSearchResult[] }>('/alerts/watched'),

  // Copilot (RAG)
  chat: (message: string, conversationId?: string) =>
    request<{ status: string; data: CopilotChatResponse }>('/copilot', {
      method: 'POST',
      body: JSON.stringify({ message, conversationId }),
    }, 120000),

  copilotFeedback: (consultHash: string, helpful: boolean, note?: string) =>
    request<{ status: string }>(`/copilot/feedback/${consultHash}`, {
      method: 'PATCH',
      body: JSON.stringify({ helpful, note }),
    }),

  // Legal docs admin
  legalDocsList: (filters: { type?: string; source?: string; search?: string } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) qs.set(k, String(v)); });
    return request<{ status: string; data: LegalDocumentMeta[] }>(`/admin/legal-docs?${qs.toString()}`);
  },

  legalDocsStats: () =>
    request<{ status: string; data: LegalDocsStats }>('/admin/legal-docs/stats'),

  legalDocsCopilotQuality: () =>
    request<{ status: string; data: CopilotQuality }>('/admin/legal-docs/copilot-quality'),

  legalDocsReindex: () =>
    request<{ status: string; data: { updated: number } }>('/admin/legal-docs/reindex', { method: 'POST' }),

  legalDocsCreate: (doc: {
    type: string; source: string; title: string; reference: string; content: string;
    officialUrl?: string; publishedDate?: string; effectiveDate?: string; expiryDate?: string;
    version?: string; topics?: string[]; keywords?: string[]; fractionRefs?: string[];
  }) =>
    request<{ status: string; data: { id: string; contentHash: string } }>('/admin/legal-docs', {
      method: 'POST', body: JSON.stringify(doc),
    }),

  legalDocsDelete: (id: string) =>
    request<{ status: string }>(`/admin/legal-docs/${id}`, { method: 'DELETE' }),

  // Inventario IMMEX
  inventoryStats: () =>
    request<{ status: string; data: InventoryStats }>('/inventory/stats'),

  inventoryBalances: () =>
    request<{ status: string; data: InventoryBalance[] }>('/inventory/balance'),

  inventoryExpiring: (days = 90) =>
    request<{ status: string; data: TemporaryImportRecord[] }>(`/inventory/expiring?days=${days}`),

  inventoryInconsistencies: () =>
    request<{ status: string; data: InconsistencyReport }>('/inventory/inconsistencies'),

  inventoryImports: (page = 1, status?: string, fraction?: string) => {
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (status) params.set('status', status);
    if (fraction) params.set('fraction', fraction);
    return request<{ status: string; data: TemporaryImportRecord[]; pagination: { page: number; limit: number; total: number } }>(
      `/inventory/imports?${params}`
    );
  },

  inventoryImportCreate: (data: CreateImportInput) =>
    request<{ status: string; data: TemporaryImportRecord }>('/inventory/imports', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  inventoryImportDetail: (id: string) =>
    request<{ status: string; data: TemporaryImportRecord }>(`/inventory/imports/${id}`),

  inventoryImportDelete: (id: string) =>
    request<{ status: string }>(`/inventory/imports/${id}`, { method: 'DELETE' }),

  inventoryDischarges: (page = 1, importId?: string) => {
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (importId) params.set('importId', importId);
    return request<{ status: string; data: DischargeRecord[]; pagination: { page: number; limit: number; total: number } }>(
      `/inventory/discharges?${params}`
    );
  },

  inventoryDischargeCreate: (data: CreateDischargeInput) =>
    request<{ status: string; data: DischargeRecord }>('/inventory/discharges', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  inventoryDischargeDelete: (id: string) =>
    request<{ status: string }>(`/inventory/discharges/${id}`, { method: 'DELETE' }),

  inventoryAnnex24Generate: (data: { period: string; periodStart: string; periodEnd: string }) =>
    request<{ status: string; data: { report: Annex24ReportRecord; data: unknown } }>('/inventory/annex24-report', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  inventoryAnnex24Reports: () =>
    request<{ status: string; data: Annex24ReportRecord[] }>('/inventory/annex24-reports'),

  inventoryAnnex30Account: () =>
    request<{ status: string; data: Annex30AccountRecord }>('/inventory/annex30-account'),

  // BOM (Bill of Materials)
  bomProducts: (filter?: 'finished' | 'raw') => {
    const qs = filter === 'finished' ? '?finished=true' : filter === 'raw' ? '?finished=false' : '';
    return request<{ status: string; data: ProductRecord[] }>(`/inventory/products${qs}`);
  },

  bomProductCreate: (data: { productCode: string; description: string; fractionCode?: string; unit: string; isFinished: boolean }) =>
    request<{ status: string; data: ProductRecord }>('/inventory/products', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  bomProductDelete: (id: string) =>
    request<{ status: string }>(`/inventory/products/${id}`, { method: 'DELETE' }),

  bomComponentUpsert: (productId: string, data: { componentId: string; quantity: number; unit: string; scrapPercent?: number; notes?: string }) =>
    request<{ status: string; data: ProductComponentRecord }>(`/inventory/products/${productId}/components`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  bomComponentDelete: (productId: string, componentId: string) =>
    request<{ status: string }>(`/inventory/products/${productId}/components/${componentId}`, { method: 'DELETE' }),

  bomImport: (components: Array<{ productCode: string; componentCode: string; quantity: number; unit: string; scrapPercent?: number }>) =>
    request<{ status: string; data: { created: number; skipped: number; errors: string[] } }>('/inventory/bom/import', {
      method: 'POST',
      body: JSON.stringify({ components }),
    }),

  assemblies: () =>
    request<{ status: string; data: AssemblyRecord[] }>('/inventory/assemblies'),

  assemblyRecord: (data: { productId: string; quantity: number; assemblyDate?: string; reference?: string; notes?: string }) =>
    request<{ status: string; data: AssemblyResultRecord }>('/inventory/assemblies', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  importTraceability: (importId: string) =>
    request<{ status: string; data: ImportTraceabilityRecord }>(`/inventory/traceability/${importId}`),

  // ROI & Compliance
  roiSummary: (days = 30) =>
    request<{ status: string; data: ROISummary }>(`/roi/summary?days=${days}`),

  complianceScore: () =>
    request<{ status: string; data: ComplianceScore }>('/roi/compliance-score'),

  // Cotizador multi-partida
  quoteMulti: (input: MultiQuoteInput) =>
    request<{ status: string; data: MultiQuoteResult & { quoteId: string } }>('/quote/multi', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  quoteScenarios: (base: MultiQuoteInput, variants: ScenarioVariant[]) =>
    request<{ status: string; data: ScenarioComparison }>('/quote/scenarios', {
      method: 'POST',
      body: JSON.stringify({ base, variants }),
    }),

  exchangeRateRecent: (days = 90) =>
    request<{ status: string; data: { date: string; rate: number; source: string }[] }>(`/quote/exchange-rate/recent?days=${days}`),

  // Origen TMEC / TLCUEM / CPTPP
  originAgreements: () =>
    request<{ status: string; data: string[] }>('/origin/agreements'),

  originRule: (fraction: string, agreement = 'TMEC') =>
    request<{ status: string; data: { rule: OriginRule | null; disclaimer: string } }>(
      `/origin/rule/${encodeURIComponent(fraction)}?agreement=${encodeURIComponent(agreement)}`,
    ),

  originAnalyze: (input: OriginAnalysisInput) =>
    request<{ status: string; data: OriginAnalysisResult }>('/origin/analyze', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  originHistory: (limit = 20) =>
    request<{ status: string; data: OriginAnalysisRecord[] }>(`/origin/history?limit=${limit}`),

  originCertificateCreate: (data: OriginCertificateInput) =>
    request<{ status: string; data: { id: string; certificateNumber: string; contentHash: string } }>('/origin/certificates', {
      method: 'POST', body: JSON.stringify(data),
    }),

  originCertificatesList: () =>
    request<{ status: string; data: OriginCertificateRecord[] }>('/origin/certificates'),

  originCertificatePdfURL: (id: string) => `/api/origin/certificates/${id}/pdf`,

  // NOMs
  nomsEvaluate: (input: {
    fractionCode?: string;
    countryOfOrigin?: string;
    context?: NOMOperationContext;
    noms?: { code: string; authority?: string; description?: string }[];
  }) =>
    request<{ status: string; data: { fractionCode: string; context: NOMOperationContext; evaluations: NOMEvaluation[] } }>('/noms/evaluate', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  /** Devuelve URL para abrir la carta en nueva pestaña (POST + redirect manual) */
  nomsCartaURL: () => '/api/noms/carta-no-comercializacion',

  // Trazabilidad versional
  /** URL pública de verificación de un consultHash */
  verifyConsultURL: (hash: string) => `/verify/${hash}`,

  /** URL del dictamen HTML imprimible para una clasificación */
  dictamenURL: (classificationId: string) => `/api/classify/${classificationId}/dictamen.html`,

  complianceReport: (tenantId: string) =>
    request<{ status: string; data: ComplianceReport }>(`/admin/compliance-report/${tenantId}`),

  // Precedentes legales
  precedentsList: (filters: { search?: string; type?: string; topic?: string; fraction?: string; yearFrom?: number; litigated?: boolean; page?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v !== undefined && v !== '') qs.set(k, String(v)); });
    return request<{ status: string; data: LegalPrecedent[]; pagination: { page: number; limit: number; total: number } }>(`/precedents?${qs.toString()}`);
  },

  precedentDetail: (id: string) =>
    request<{ status: string; data: LegalPrecedent }>(`/precedents/${id}`),

  precedentLookup: (input: { fractionCode?: string; chapter?: string; topics?: string[]; keywords?: string[]; limit?: number }) =>
    request<{ status: string; data: { precedents: PrecedentMatch[]; litigation: { has: boolean; precedents: PrecedentMatch[] } } }>('/precedents/lookup', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  // Pre-validador v2 (Pedimento Anexo 22)
  pedimentoValidate: (pedimento: PedimentoInputV2, aiCheck = false) =>
    request<{ status: string; data: PedimentoValidationResult }>('/prevalidate/pedimento/validate', {
      method: 'POST',
      body: JSON.stringify({ pedimento, aiCheck }),
    }),

  pedimentoCreate: (pedimento: PedimentoInputV2, aiCheck = false) =>
    request<{ status: string; data: { pedimento: PedimentoRecord; validation: PedimentoValidationResult } }>('/prevalidate/pedimento', {
      method: 'POST',
      body: JSON.stringify({ pedimento, aiCheck }),
    }),

  pedimentoList: (status?: string) => {
    const qs = status ? `?status=${status}` : '';
    return request<{ status: string; data: PedimentoRecord[] }>(`/prevalidate/pedimento${qs}`);
  },

  pedimentoDetail: (id: string) =>
    request<{ status: string; data: PedimentoRecord }>(`/prevalidate/pedimento/${id}`),

  pedimentoDelete: (id: string) =>
    request<{ status: string }>(`/prevalidate/pedimento/${id}`, { method: 'DELETE' }),

  // Audit Trail
  auditList: (params: { entity?: string; action?: string; userId?: string; dateFrom?: string; dateTo?: string; q?: string; page?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.entity) qs.set('entity', params.entity);
    if (params.action) qs.set('action', params.action);
    if (params.userId) qs.set('userId', params.userId);
    if (params.dateFrom) qs.set('dateFrom', params.dateFrom);
    if (params.dateTo) qs.set('dateTo', params.dateTo);
    if (params.q) qs.set('q', params.q);
    if (params.page) qs.set('page', String(params.page));
    return request<{ status: string; data: AuditLogRecord[]; pagination: { page: number; limit: number; total: number } }>(`/admin/audit?${qs}`);
  },

  auditDetail: (id: string) =>
    request<{ status: string; data: AuditLogRecord }>(`/admin/audit/log/${id}`),

  auditVerifyChain: () =>
    request<{ status: string; data: { valid: boolean; brokenAt?: string; checkedCount: number } }>('/admin/audit/verify-chain', { method: 'POST' }),

  auditReport: (periodStart?: string, periodEnd?: string) =>
    request<{ status: string; data: AuditReportData }>('/admin/audit/report', {
      method: 'POST',
      body: JSON.stringify({ periodStart, periodEnd }),
    }),

  // Documentos IA
  documentsUploadBatch: (files: { name: string; mimeType: string; base64: string }[]) =>
    request<{ status: string; data: { processed: number; results: DocumentBatchItem[] } }>('/documents/upload-batch', {
      method: 'POST',
      body: JSON.stringify({ files }),
    }),

  documentsList: (params: { operationId?: string; docType?: string; unlinked?: boolean } = {}) => {
    const qs = new URLSearchParams();
    if (params.operationId) qs.set('operationId', params.operationId);
    if (params.docType) qs.set('docType', params.docType);
    if (params.unlinked) qs.set('unlinked', 'true');
    return request<{ status: string; data: DocumentAIRecord[] }>(`/documents?${qs}`);
  },

  documentDetail: (id: string) =>
    request<{ status: string; data: DocumentAIRecord }>(`/documents/${id}`),

  documentEdit: (id: string, patch: { docType?: string; extractedData?: Record<string, unknown>; operationId?: string | null; notes?: string }) =>
    request<{ status: string; data: DocumentAIRecord }>(`/documents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  documentLink: (id: string, operationId: string) =>
    request<{ status: string; data: DocumentAIRecord }>(`/documents/${id}/link`, {
      method: 'POST',
      body: JSON.stringify({ operationId }),
    }),

  documentsGroupSuggest: () =>
    request<{ status: string; data: { groups: { ref: string; documentIds: string[] }[] } }>('/documents/groups/suggest'),

  crossAudit: (operationId: string) =>
    request<{ status: string; data: CrossAuditResultRecord }>(`/documents/cross-audit/${operationId}`),

  // Fiscal Guardian
  fiscalDashboard: () =>
    request<{ status: string; data: FiscalDashboard }>('/fiscal/dashboard'),

  fiscalAccount: () =>
    request<{ status: string; data: FiscalAccount }>('/fiscal/account'),

  fiscalCredits: (page = 1, status?: string) => {
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (status) params.set('status', status);
    return request<{ status: string; data: TaxCreditRecord[]; pagination: { page: number; limit: number; total: number } }>(
      `/fiscal/credits?${params}`
    );
  },

  fiscalCreditCreate: (data: CreateTaxCreditInput) =>
    request<{ status: string; data: TaxCreditRecord }>('/fiscal/credits', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  fiscalCreditDetail: (id: string) =>
    request<{ status: string; data: TaxCreditRecord }>(`/fiscal/credits/${id}`),

  fiscalCreditUse: (id: string, data: CreateCreditUsageInput) =>
    request<{ status: string; data: CreditUsageRecord }>(`/fiscal/credits/${id}/use`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  fiscalCreditDelete: (id: string) =>
    request<{ status: string }>(`/fiscal/credits/${id}`, { method: 'DELETE' }),

  fiscalRisks: () =>
    request<{ status: string; data: FiscalRiskReport }>('/fiscal/risks'),

  fiscalSimulateLoss: () =>
    request<{ status: string; data: CertLossSimulation }>('/fiscal/simulate-loss', { method: 'POST' }),

  fiscalGuarantees: () =>
    request<{ status: string; data: GuaranteeRecord[] }>('/fiscal/guarantees'),

  fiscalGuaranteeCreate: (data: CreateGuaranteeInput) =>
    request<{ status: string; data: GuaranteeRecord }>('/fiscal/guarantees', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  fiscalGuaranteeUpdate: (id: string, data: Partial<CreateGuaranteeInput> & { status?: string }) =>
    request<{ status: string; data: GuaranteeRecord }>(`/fiscal/guarantees/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  fiscalGuaranteeDelete: (id: string) =>
    request<{ status: string }>(`/fiscal/guarantees/${id}`, { method: 'DELETE' }),

  fiscalCertification: () =>
    request<{ status: string; data: CertificationProfileRecord | null }>('/fiscal/certification'),

  fiscalCertificationUpdate: (data: CertificationUpdateInput) =>
    request<{ status: string; data: CertificationProfileRecord }>('/fiscal/certification', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Auto MVE
  mveDashboard: () =>
    request<{ status: string; data: MVEDashboard }>('/mve/dashboard'),

  mveExtractInvoice: (invoiceText: string) =>
    request<{ status: string; data: ExtractedInvoiceData }>('/mve/extract-invoice', {
      method: 'POST',
      body: JSON.stringify({ invoiceText }),
    }),

  mveCreate: (data: CreateMVEInput) =>
    request<{ status: string; data: MVERecord }>('/mve', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  mveList: (page = 1, status?: string) => {
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (status) params.set('status', status);
    return request<{ status: string; data: MVERecord[]; pagination: { page: number; limit: number; total: number } }>(
      `/mve?${params}`
    );
  },

  mveDetail: (id: string) =>
    request<{ status: string; data: MVERecord }>(`/mve/${id}`),

  mveUpdate: (id: string, data: Partial<CreateMVEInput>) =>
    request<{ status: string; data: MVERecord }>(`/mve/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  mveDelete: (id: string) =>
    request<{ status: string }>(`/mve/${id}`, { method: 'DELETE' }),

  mveValidate: (id: string) =>
    request<{ status: string; data: MVEValidation }>(`/mve/${id}/validate`, { method: 'POST' }),

  mveSign: (id: string) =>
    request<{ status: string; data: MVERecord }>(`/mve/${id}/sign`, { method: 'POST' }),

  mveTransmit: (id: string) =>
    request<{ status: string; data: MVERecord }>(`/mve/${id}/transmit`, { method: 'POST' }),

  mvePdf: (id: string) =>
    request<{ status: string; data: { text: string; mve: MVERecord } }>(`/mve/${id}/pdf`),

  mveCoveCreate: (data: { mveId: string; eDocument: string; invoiceNumber: string; providerTaxId?: string; value: number; currency?: string }) =>
    request<{ status: string; data: COVERecord }>('/mve/coves', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  mveCoves: (mveId: string) =>
    request<{ status: string; data: COVERecord[] }>(`/mve/${mveId}/coves`),

  // Logistics Optimizer
  logisticsContainers: () =>
    request<{ status: string; data: ContainerSpec[] }>('/logistics/containers'),

  logisticsPlans: () =>
    request<{ status: string; data: LoadPlanRecord[] }>('/logistics/plans'),

  logisticsPlanCreate: (data: { name: string; containerType: string; containerLength?: number; containerWidth?: number; containerHeight?: number; maxWeight?: number }) =>
    request<{ status: string; data: LoadPlanRecord }>('/logistics/plans', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  logisticsPlanDetail: (id: string) =>
    request<{ status: string; data: LoadPlanRecord }>(`/logistics/plans/${id}`),

  logisticsPlanUpdate: (id: string, data: Record<string, unknown>) =>
    request<{ status: string; data: LoadPlanRecord }>(`/logistics/plans/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  logisticsPlanDelete: (id: string) =>
    request<{ status: string }>(`/logistics/plans/${id}`, { method: 'DELETE' }),

  logisticsAddItem: (planId: string, data: CreateLoadItemInput) =>
    request<{ status: string; data: LoadItemRecord }>(`/logistics/plans/${planId}/items`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  logisticsRemoveItem: (planId: string, itemId: string) =>
    request<{ status: string }>(`/logistics/plans/${planId}/items/${itemId}`, { method: 'DELETE' }),

  logisticsCalculate: (planId: string) =>
    request<{ status: string; data: CubicageResult }>(`/logistics/plans/${planId}/calculate`, { method: 'POST' }),

  logisticsOptimize: (planId: string) =>
    request<{ status: string; data: LoadOptimization }>(`/logistics/plans/${planId}/optimize`, { method: 'POST' }),

  logisticsCosts: (planId: string, origin?: string, destination?: string) =>
    request<{ status: string; data: CostAnalysis }>(`/logistics/plans/${planId}/costs`, {
      method: 'POST',
      body: JSON.stringify({ origin, destination }),
    }),

  // TIGIE Updater
  updaterAnalyzeDecree: (decreeText: string) =>
    request<{ status: string; data: { update: TIGIEUpdateRecord; analysis: DecreeAnalysisData } }>('/updater/analyze-decree', {
      method: 'POST',
      body: JSON.stringify({ decreeText }),
    }),

  updaterApply: (id: string) =>
    request<{ status: string; data: { applied: number; total: number } }>(`/updater/apply/${id}`, { method: 'POST' }),

  updaterUpdates: () =>
    request<{ status: string; data: TIGIEUpdateRecord[] }>('/updater/updates'),

  updaterUpdateDetail: (id: string) =>
    request<{ status: string; data: TIGIEUpdateRecord }>(`/updater/updates/${id}`),

  updaterNotify: (id: string) =>
    request<{ status: string; data: { sent: number } }>(`/updater/notify/${id}`, { method: 'POST' }),

  updaterNotifications: () =>
    request<{ status: string; data: UpdateNotificationRecord[] }>('/updater/notifications'),

  updaterUnreadCount: () =>
    request<{ status: string; data: { count: number } }>('/updater/notifications/unread-count'),

  updaterMarkRead: (id: string) =>
    request<{ status: string }>(`/updater/notifications/${id}/read`, { method: 'PATCH' }),

  updaterWeeklyDigest: () =>
    request<{ status: string; data: WeeklyDigest }>('/updater/weekly-digest', { method: 'POST' }),

  updaterAffectedUsers: (id: string) =>
    request<{ status: string; data: { affected: number; notifications: unknown[] } }>(`/updater/affected-users/${id}`),

  updaterChangelog: (page = 1, chapter?: string) => {
    const params = new URLSearchParams({ page: String(page) });
    if (chapter) params.set('chapter', chapter);
    return request<{ status: string; data: ChangelogEntry[] }>(`/updater/changelog?${params}`);
  },

  // Leads (público)
  submitLead: (data: { name: string; company?: string; email: string; phone: string; message?: string; source?: string }) =>
    request<{ status: string; data: { id: string } }>('/leads', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  qualifyLead: (id: string, data: { rfc?: string; industry?: string; monthlyOps?: string; hasIMMEX?: boolean; currentSoftware?: string; problems?: string[]; referralSource?: string }) =>
    request<{ status: string; data: { id: string; score: number } }>(`/leads/${id}/qualify`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  updateLeadStatus: (id: string, status: string) =>
    request<{ status: string }>(`/leads/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  leadStats: () =>
    request<{ status: string; data: Record<string, number> }>('/leads/stats'),

  leadDetail: (id: string) =>
    request<{ status: string; data: Record<string, unknown> }>(`/leads/${id}`),

  // Admin
  adminLeads: (status?: string, minScore?: number) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (minScore) params.set('minScore', String(minScore));
    return request<{ status: string; data: LeadRecord[] }>(`/leads?${params}`);
  },

  adminLeadDetail: (id: string) =>
    request<{ status: string; data: LeadRecord }>(`/leads/${id}`),

  adminLeadStats: () =>
    request<{ status: string; data: LeadStatsData }>('/leads/stats'),

  adminPrepareDemoForLead: (leadId: string) =>
    request<{ status: string; data: { demoAccount: DemoAccountRecord; lead: LeadRecord } }>('/admin/demo/prepare', {
      method: 'POST',
      body: JSON.stringify({ leadId }),
    }),

  adminSendDemoInvite: (demoId: string) =>
    request<{ status: string }>(`/admin/demo/${demoId}/send-invite`, { method: 'POST' }),

  adminCompleteDemo: (demoId: string, notes?: string) =>
    request<{ status: string; classifications: { description: string; fraction: string; confidence: number }[] }>(`/admin/demo/${demoId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    }),

  adminDemos: () =>
    request<{ status: string; data: DemoAccountRecord[] }>('/admin/demos'),

  adminDeleteDemo: (demoId: string) =>
    request<{ status: string }>(`/admin/demo/${demoId}`, { method: 'DELETE' }),

  // Admin — pilotos, tenants, contratos, propuestas, dashboard
  adminActivatePilot: (leadId: string, companyName?: string) =>
    request<{ status: string; data: { tenant: { id: string; name: string; plan: string; pilotEndsAt: string }; credentials: { email: string; password: string } } }>('/admin/pilots/activate', {
      method: 'POST',
      body: JSON.stringify({ leadId, companyName }),
    }),

  adminPilots: () =>
    request<{ status: string; data: PilotRecord[] }>('/admin/pilots'),

  adminExtendPilot: (tenantId: string, days?: number) =>
    request<{ status: string; data: { id: string; pilotEndsAt: string } }>(`/admin/pilots/${tenantId}/extend`, {
      method: 'POST',
      body: JSON.stringify({ days }),
    }),

  adminProcessPilotLifecycle: () =>
    request<{ status: string; data: { reminded15: number; reminded25: number; suspended: number } }>('/admin/pilots/process-lifecycle', { method: 'POST' }),

  adminTenants: (filters?: { plan?: string; status?: string; search?: string }) => {
    const params = new URLSearchParams();
    if (filters?.plan) params.set('plan', filters.plan);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.search) params.set('search', filters.search);
    return request<{ status: string; data: TenantRecord[] }>(`/admin/tenants?${params}`);
  },

  adminTenantDetail: (id: string) =>
    request<{ status: string; data: TenantDetail }>(`/admin/tenants/${id}`),

  adminCreateProposal: (data: { tenantId: string; leadId?: string; plan: string; monthlyPrice: number; durationMonths?: number; modules?: string[]; conditions?: string; supportTier?: string }) =>
    request<{ status: string; data: ProposalRecord }>('/admin/proposals', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  adminProposals: (filters?: { tenantId?: string; status?: string }) => {
    const params = new URLSearchParams();
    if (filters?.tenantId) params.set('tenantId', filters.tenantId);
    if (filters?.status) params.set('status', filters.status);
    return request<{ status: string; data: ProposalRecord[] }>(`/admin/proposals?${params}`);
  },

  adminActivateContract: (data: { tenantId: string; plan: string; monthlyPrice: number; durationMonths?: number; modules?: string[]; startDate?: string }) =>
    request<{ status: string; data: TenantRecord }>('/admin/contracts/activate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  adminDashboard: () =>
    request<{ status: string; data: AdminDashboardData }>('/admin/dashboard'),

  adminRenewals: () =>
    request<{ status: string; data: RenewalRecord[] }>('/admin/renewals'),

  adminMetrics: () =>
    request<{ status: string; data: AdminMetricsData }>('/admin/metrics'),

  // Demo data — carga / limpieza del dataset Maquiladora Ejemplo
  adminDemoLoad: (tenantId: string) =>
    request<{ status: string; data: { tenantId: string; loaded: DemoCounts } }>('/admin/demo-data/load', {
      method: 'POST',
      body: JSON.stringify({ tenantId }),
    }),

  adminDemoClear: (tenantId: string) =>
    request<{ status: string; data: { tenantId: string; cleared: DemoCounts } }>('/admin/demo-data/clear', {
      method: 'POST',
      body: JSON.stringify({ tenantId }),
    }),

  adminDemoReset: () =>
    request<{ status: string; data: { tenantId: string; loaded: DemoCounts } }>('/admin/demo-data/reset-demo-tenant', {
      method: 'POST',
    }),

  adminDemoStatus: (tenantId: string) =>
    request<{ status: string; data: DemoStatus }>(`/admin/demo-data/status/${tenantId}`),

  // Tenant status (for pilot banner + limits)
  tenantStatus: () =>
    request<{ status: string; data: TenantStatusData }>('/auth/tenant-status'),

  // Onboarding
  updateOnboarding: (data: { step?: number; completed?: boolean }) =>
    request<{ status: string; data: { id: string; onboardingCompleted: boolean; onboardingStep: number } }>('/auth/onboarding', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Pre-validador
  prevalidate: (data: PrevalidateInput) =>
    request<{ status: string; data: PrevalidateResult }>('/prevalidate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Operaciones / Expedientes
  operationsList: (status?: string) => {
    const params = status ? `?status=${status}` : '';
    return request<{ status: string; data: OperationRecord[] }>(`/operations${params}`);
  },

  operationCreate: (data: CreateOperationInput) =>
    request<{ status: string; data: OperationRecord }>('/operations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  operationDetail: (id: string) =>
    request<{ status: string; data: OperationRecord & { completeness: number; missingDocuments: string[] } }>(`/operations/${id}`),

  operationDocumentUpdate: (opId: string, docId: string, data: { status?: string; fileName?: string; fileSize?: number; mimeType?: string; notes?: string }) =>
    request<{ status: string; data: DocumentRecord; completeness: number }>(`/operations/${opId}/documents/${docId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  operationDelete: (id: string) =>
    request<{ status: string }>(`/operations/${id}`, { method: 'DELETE' }),

  // ——— Radar de pedimentos (BETA) ———
  pedimentosRadar: async (
    nombreArchivo: string,
    contenido: string,
    tipoSujeto: 'agente' | 'agencia',
  ): Promise<RadarResultado> => {
    const token = localStorage.getItem('aduanai_token');
    try {
      const res = await fetch(`${API_BASE}/pedimentos/radar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ nombreArchivo, contenido, tipoSujeto, declarado: {} }),
      });
      const body = await res.json().catch(() => ({}) as Record<string, never>);
      if (!res.ok) {
        // Misma política de sesión expirada que request() (Fase 4.5).
        if (res.status === 401 && token) {
          if (!redirectingToLogin) {
            redirectingToLogin = true;
            localStorage.removeItem('aduanai_token');
            window.location.href = '/login?expired=1';
          }
          return { ok: false, status: 401, message: 'Tu sesión expiró. Inicia sesión de nuevo.' };
        }
        return {
          ok: false,
          status: res.status,
          message: body.message ?? `Error ${res.status}`,
          detalles: body.detalles,
          layoutVersion: body.layoutVersion,
          limite: body.limite,
          partidas: body.partidas,
        };
      }
      return {
        ok: true,
        loteId: body.data.loteId,
        persistido: body.data.persistido === true,
        avisoValidacion: body.avisoValidacion,
        layoutVersion: body.layoutVersion,
        resumen: body.data.resumen,
        radar: body.data.radar,
      };
    } catch {
      // Fallo de red/DNS/CORS/abort: el fetch rechaza antes de llegar a una respuesta HTTP.
      // Sin este catch, la excepción se propaga y la UI queda en "Evaluando…" para siempre.
      return {
        ok: false,
        status: 0,
        message: 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.',
      };
    }
  },

  /** Radar de un lote YA persistido (GET /pedimentos/radar/:loteId) — misma
   *  unión ok/error que pedimentosRadar; 404 = lote inexistente o ajeno. */
  pedimentosRadarLote: async (loteId: string): Promise<RadarResultado> => {
    const token = localStorage.getItem('aduanai_token');
    try {
      const res = await fetch(`${API_BASE}/pedimentos/radar/${encodeURIComponent(loteId)}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const body = await res.json().catch(() => ({}) as Record<string, never>);
      if (!res.ok) {
        if (res.status === 401 && token) {
          if (!redirectingToLogin) {
            redirectingToLogin = true;
            localStorage.removeItem('aduanai_token');
            window.location.href = '/login?expired=1';
          }
          return { ok: false, status: 401, message: 'Tu sesión expiró. Inicia sesión de nuevo.' };
        }
        return { ok: false, status: res.status, message: body.message ?? `Error ${res.status}` };
      }
      return {
        ok: true,
        loteId: body.data.loteId,
        persistido: body.data.persistido === true,
        avisoValidacion: body.avisoValidacion,
        layoutVersion: body.layoutVersion,
        resumen: body.data.resumen,
        radar: body.data.radar,
      };
    } catch {
      return { ok: false, status: 0, message: 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.' };
    }
  },

  riskCriterios: () =>
    request<{ status: string; data: { rulesVersion: string; criterios: CriterioNormativo[] } }>('/risk/criterios'),
};

// Types

// ——— Radar de pedimentos (BETA — Fase 1.5) ———
export interface RadarHallazgo {
  codigo: string;
  mensaje: string;
  destacado: boolean;
}

export interface ProvenienciaArchivo {
  nombre: string;
  sha256: string;
}

export interface Proveniencia {
  archivo: ProvenienciaArchivo;
  layoutVersion: string;
  metodo: 'determinista';
  fechaExtraccion: string;
  campos: Record<string, string>;
}

export interface RadarFila {
  pedimento: string;
  numeroPedimento15: string | null;
  partida: number;
  fraccion: string;
  nico: string;
  descripcion: string;
  valorUsd: number | null;
  banda: 'VERDE' | 'AMARILLO' | 'NARANJA' | 'ROJO' | 'ROJO_CRITICO';
  exposicion: number;
  escudoPct: number;
  banderas: string[];
  hallazgos: RadarHallazgo[];
  /** Reglas que sumaron puntos, con el origen efectivo de la señal del motor. */
  reglasActivas: RadarReglaActiva[];
  origenDatos: string;
  proveniencia: Proveniencia;
  assessmentId: string;
}

export interface RadarReglaActiva {
  id: string;
  descripcion: string;
  puntos: number;
  maxPuntos: number;
  origenEfectivo: 'verificado' | 'declarado' | 'mixto' | 'no_evaluado' | string;
}

export interface PedimentoExcluido {
  numeroPedimento7: string;
  patente: string;
  lineaInicio: number;
  motivo: string;
}

export interface RadarResumen {
  pedimentosProcesados: number;
  operaciones: number;
  porBanda: Record<string, number>;
  banderas: string[];
  hallazgosDestacados: ({ pedimento: string; partida: number } & RadarHallazgo)[];
  excluidos: PedimentoExcluido[];
  registrosIgnorados: Record<string, number>;
  advertenciasIntegridad: string[];
}

export interface RadarOk {
  ok: true;
  loteId: string;
  /** true cuando la pantalla viene de GET /radar/:loteId (no se re-evaluó). */
  persistido: boolean;
  avisoValidacion: string;
  layoutVersion: string;
  resumen: RadarResumen;
  radar: RadarFila[];
}

export interface RadarError {
  ok: false;
  status: number;
  message: string;
  detalles?: string[];
  layoutVersion?: string;
  /** 413: límite vigente del lote y partidas que trae el archivo. */
  limite?: number;
  partidas?: number;
}

export type RadarResultado = RadarOk | RadarError;

export interface CriterioNormativo {
  id: string;
  titulo: string;
  detalle: string;
  vigenciaHasta: string;
  instrumento: string;
  version: string;
  estado: 'VERSION_ANTICIPADA' | 'PUBLICADA_DOF';
  dofFecha: string | null;
  fechaPublicacionPortal: string;
  fechaCotejo: string;
  urlOficial: string;
}

export interface ClassifierAntidumpingMetadata {
  resolutionNumber: string | null;
  expedienteUPCI: string | null;
  rate: number;
  rateType: 'percentage' | 'specific_USD_kg' | 'specific_USD_unit';
  rateUnit: string;
  rateLabel: string;
  decree: string | null;
  productDesc: string | null;
  countryNormalized: string;
  effectiveDate: string | null;
  expiryDate: string | null;
  dofUrl: string | null;
  publishDate: string | null;
  calculatedAmountUSD: number | null;
  potentialPenaltyUSDMin: number | null;
  potentialPenaltyUSDMax: number | null;
  matchType: 'exact' | 'subheading' | 'heading';
  matchedFraction: string | null;
}

export interface ClassifierAlert {
  type: 'antidumping' | 'undervalue' | 'nom_required' | 'sectoral_padron' | 'automotive' | 'permit_required';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  metadata?: Record<string, unknown> | ClassifierAntidumpingMetadata;
}

export interface ClassificationMeta {
  tigieVersion: string;
  ligieVersion: string;
  rgceVersion?: string | null;
  modelUsed?: string;
  modelProvider?: string;
  inputHash?: string;
  outputHash?: string;
  knowledgeBaseHash?: string;
  legacyHash?: string;
  consultHash: string;
  consultedAt: string;
  verifyUrl: string;
}

export interface ComplianceBreakdown {
  version: string;
  count: number;
  outdated: boolean;
  consultIds: string[];
  firstAt: string;
  lastAt: string;
}

export interface ComplianceReport {
  tenant: { name: string; rfc: string | null };
  activeVersions: { tigie: string; ligie: string; rgce: string | null; acuerdoNoms: string | null; tmec: string | null };
  totals: { consults: number; outdatedConsults: number; uniqueTigieVersions: number };
  breakdown: ComplianceBreakdown[];
  recommendations: string[];
  recent: { id: string; classificationId: string | null; tigieVersion: string; ligieVersion: string; modelUsed: string; consultHash: string; consultedAt: string }[];
}

export type IndustrialSector =
  | 'automotive_terminal' | 'automotive_parts' | 'aeronautic' | 'consumer_electronics'
  | 'medical_pharma' | 'construction' | 'textile_apparel' | 'food_beverage'
  | 'industrial_machinery' | 'agriculture' | 'oil_gas' | 'chemicals' | 'general';

export type ImporterType = 'IMMEX' | 'DEFINITIVO' | 'PERSONA_FISICA';

export interface UseBasedAnalysis {
  applies: boolean;
  byMaterial: { code: string; description: string; confidence: number };
  byUse: { code: string; description: string; confidence: number };
  criterion: string;
  recommendation: string;
  riskNote: string;
  precedents: string[];
}

// ── Bloque canónico del Clasificador (Frontera Canónica §3.4) ─────────────
export interface RegulacionCanonica {
  code: string;
  authority: string;
  description: string;
  type: string;
}

export interface JerarquiaFraccion {
  partida: { code: string; texto: string } | null;
  subpartida: { code: string; texto: string } | null;
}

export interface DatosCanonicosFraccion {
  fraccion: DatoLegal<{ code: string; codeFormatted: string; description: string; unit: string | null; jerarquia: JerarquiaFraccion }>;
  nico: DatoLegal<string[]>;
  tarifas: {
    nmf: DatoLegal<number>;
    preferenciales: DatoLegal<{ TMEC: number | null; TLCUEM: number | null; CPTPP: number | null }>;
    ieps: DatoLegal<number>;
  };
  regulaciones: {
    noms: DatoLegal<RegulacionCanonica[]>;
    rrna: DatoLegal<RegulacionCanonica[]>;
    padronSectorial: DatoLegal<{ requerido: boolean; sectores: { codigo: string; nombre: string }[] }>;
  };
  versiones: { tigie: string; ligie: string; rgce: string | null };
  integridad: { completo: boolean; camposNoRevisados: string[] };
}

export interface DiscrepanciaLLM {
  campo: string;
  valorLLM: unknown;
  valorCanonico: unknown;
  fraccion: string;
}

export interface ClassificationResult {
  fraction: { code: string; description: string; chapter: string; section: string };
  nico: string;
  /** Autodeclarada por el modelo, NO calibrada (los errores promedian 87.5).
   *  Regla de UI: jamás como número prominente — solo detalle técnico. */
  confidence: number;
  griApplied: string[];
  /** nmf null = el catálogo no tiene el dato ('no_disponible') — no se rellena. */
  tariffs: { nmf: number | null; preferential: Record<string, number> };
  regulations: { rrna: string[]; noms: string[]; sectoralRegistry: boolean };
  alternatives: { code: string; description: string; confidence: number; reason: string }[];
  explanation: { simple: string; technical: string };
  legalBasis?: {
    griApplied: { rule: string; reasoning: string }[];
    legalNotes: { source: string; text: string }[];
    discardedFractions: { code: string; reason: string }[];
  };
  useBasedAnalysis?: UseBasedAnalysis | null;
  precedents?: PrecedentMatch[];
  litigationAlert?: { active: boolean; cases: PrecedentMatch[] } | null;
  disclaimer: string;
  alerts?: ClassifierAlert[];
  padronCheck?: PadronCheckResultData;
  meta?: ClassificationMeta;
  /** Frontera Canónica: datos legales con procedencia — la fuente del verde. */
  datosCanonicos?: DatosCanonicosFraccion;
  /** Telemetría: qué dijo el LLM distinto del catálogo (no se pinta en UI). */
  discrepanciasLLM?: DiscrepanciaLLM[];
}

export type KnowledgeType =
  | 'CASO_CLASIFICACION'
  | 'CRITERIO_SAT'
  | 'RESOLUCION_SCJN'
  | 'NOTA_EXPLICATIVA_OMA'
  | 'NOTA_LEGAL'
  | 'REGLA_SECTOR'
  | 'ERROR_COMUN'
  | 'PRECEDENTE'
  | 'CONSULTA_SAT';

export interface KnowledgeRecord {
  id: string;
  type: KnowledgeType;
  fractionCode?: string | null;
  chapterCode?: string | null;
  sectionCode?: string | null;
  title: string;
  content: string;
  source: string;
  sourceDate?: string | null;
  keywords: string[];
  products?: string[] | null;
  priority: number;
  verified: boolean;
  verifiedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClassificationRecord {
  id: string;
  inputDescription: string;
  fractionCode: string;
  fractionDescription?: string;
  confidence: number;
  feedback?: string | null;
  feedbackNote?: string | null;
  status?: 'approved' | 'pending_approval' | 'rejected';
  approvedAt?: string | null;
  approvedById?: string | null;
  createdAt: string;
}

export interface VolumeDay {
  date: string;
  classifications: number;
  quotes: number;
}

export interface StatsData {
  counts: { classifications: number; quotes: number; copilotMessages: number };
  recentClassifications: {
    id: string;
    inputDescription: string;
    fractionCode: string;
    confidence: number;
    createdAt: string;
    feedback: string | null;
  }[];
  /** Fase 4.3: agregados sobre TODAS las filas del tenant (fuente única del server). */
  analytics: {
    uniqueFractions: number;
    avgConfidence: number;
    topChapters: { ch: string; count: number }[];
    confidenceBuckets: number[]; // [95-100, 85-94, 70-84, 50-69, <50]
  };
}

export interface QuoteInput {
  fractionCode: string;
  customsValue: number;
  origin: string;
  incoterm: string;
  currency: string;
}

export interface AntidumpingMatch {
  rate: number;
  type: string;
  decree: string | null;
  country: string;
  countryNormalized: string;
  publishDate: string | null;
  effectiveDate: string | null;
  expiryDate: string | null;
  notes: string | null;
}

export interface RegulationMatch {
  type: 'NOM' | 'RRNA' | 'padron_sectorial' | 'permiso_previo';
  authority: string;
  code: string;
  description: string;
  required: boolean;
}

export interface QuoteResult {
  fraction: string;
  customsValue: number;
  currency: string;
  origin: string;
  incoterm: string;
  exchangeRate: number;
  exchangeRateDate: string;
  exchangeRateSource: string;
  exchangeRateIsOfficial: boolean;
  exchangeRateWarning: string | null;
  valueMXN: number;
  breakdown: {
    igi: { rate: number; base: number; amount: number };
    dta: { rate: number; base: number; amount: number };
    countervailingDuty: { rate: number; base: number; amount: number } | null;
    ieps: { rate: number; base: number; amount: number } | null;
    iva: { rate: number; base: number; amount: number };
    preIVABase: number;
    prevalidation: number;
  };
  totalTaxes: number;
  totalLandedCost: number;
  totalWithDispatch: number;
  totalLandedCostUSD: number;
  preferential: { treaty: string; igi: number | null; savings: number; available: boolean; note: string | null }[] | null;
  compensatorias: AntidumpingMatch | null;
  regulaciones: RegulationMatch[];
  alertas: string[];
}

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';
export type AlertImpactType = 'savings' | 'cost' | 'risk';

export interface AlertSuggestedAction {
  type: 'recalculate_quotes' | 'review_operation' | 'renew_guarantee' | 'discharge_credit' | 'notify_client' | 'view_fraction' | 'open_module';
  label: string;
  payload?: Record<string, unknown>;
}

export interface Alert {
  id: string;
  channel: string;
  type: string;
  title: string;
  content: string;
  read: boolean;
  createdAt: string;
  fractionCodes: string[];
  severity: AlertSeverity;
  affectedFraction: string | null;
  affectedOperations: string[];
  estimatedImpactMXN: number | null;
  impactType: AlertImpactType | null;
  actionRequired: string | null;
  suggestedAction: AlertSuggestedAction | null;
  dueDate: string | null;
  daysToDue: number | null;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  snoozedUntil: string | null;
  ignored: boolean;
  resolvedAt: string | null;
}

export interface MonitoringOverview {
  requests: { hour: number; day: number; week: number };
  errors: { hour: number; day: number; rateHour: number; rateDay: number };
  latency: { avgMsDay: number; sparkline: { ts: string; avg: number; count: number }[] };
  ai: { tokensMonth: number; costUSDMonth: number };
  topEndpoints: { endpoint: string | null; count: number }[];
  topErrors: { message: string | null; count: number }[];
}

export interface SystemLogRecord {
  id: string;
  level: string;
  timestamp: string;
  tenantId: string | null;
  userId: string | null;
  requestId: string | null;
  method: string | null;
  endpoint: string | null;
  statusCode: number | null;
  latencyMs: number | null;
  errorMessage: string | null;
  errorStack: string | null;
  entity: string | null;
  entityId: string | null;
  action: string | null;
  metadata: unknown;
  userAgent: string | null;
  ip: string | null;
}

export interface ErrorGroup {
  message: string;
  count: number;
  lastSeen: string;
  affectedTenants: number;
  affectedUsers: number;
  sample: SystemLogRecord;
}

export interface AICostsReport {
  range: string;
  since: string;
  totals: { calls: number; tokens: number; costUSD: number; projectionUSD: number | null };
  byModel: { model: string; calls: number; inputTokens: number; outputTokens: number; totalTokens: number; costUSD: number }[];
  byOperation: { operation: string; calls: number; tokens: number; costUSD: number }[];
  byTenant: { tenantId: string | null; calls: number; tokens: number; costUSD: number }[];
  daily: { day: string; tokens: number; costUSD: number }[];
}

export interface BusinessMetrics {
  users: { dau: number; wau: number; mau: number };
  activity: { classificationsDay: number; classificationsWeek: number };
  funnel: { leads30d: number; demoScheduled: number; demoDone: number; pilots: number; converted: number };
  churn: { last60Days: number; rateMonthly: number };
  ltvAvgMXN: number;
  activeTenants: number;
}

export interface HealthStatus {
  status: 'ok' | 'degraded';
  service: string;
  timestamp: string;
  uptime: number;
  nodeVersion: string;
  checks: {
    database: { ok: boolean; latencyMs?: number; error?: string };
    anthropic_api: { ok: boolean; error?: string };
    resend_email: { ok: boolean; error?: string };
  };
}

// ── Risk Scorer (responsabilidad solidaria) ──
export interface RiskFundamento { articulo: string; citaCorta: string; fuente: string; url: string; fechaCotejo: string }
export interface RiskRegla { id: string; factor: string; descripcion: string; puntos: number; maxPuntos: number; bandera?: string; origenSenal: string; origenEfectivo?: string; motivo?: string; fundamento: RiskFundamento }
export interface RiskFactor { factor: string; puntos: number; peso: number; reglas: RiskRegla[] }
export interface RiskChecklistItem { id: string; grupo: string; descripcion: string; aplicable: boolean; completo: boolean; origenSenal: string; accionSugerida: string; fundamento: RiskFundamento }
export interface RiskAssessInput {
  tipoSujeto: 'agente' | 'agencia';
  operacion: {
    fraccion?: string; nico?: string; valorUnitario?: number; paisOrigen?: string;
    paisProcedencia?: string; numeroPedimento?: string; importadorRfc?: string;
    preferenciaArancelaria?: boolean;
  };
  declarado: Record<string, unknown>;
}
export interface RiskAssessResult {
  exposicion: number; escudoPct: number; banda: string; banderas: string[];
  factores: RiskFactor[]; checklist: RiskChecklistItem[]; faltantes: string[];
  cobertura?: { verificadas: number; declaradas: number; noEvaluadas: number; identificadoresFaltantes: string[] };
  rulesVersion: string; disclaimer: string; assessmentId: string;
}

export interface GlosaSimulationInput {
  fractionCode: string;
  fractionDescription?: string;
  productDescription?: string;
  countryOrigin: string;
  countryProvider: string;
  customsCode: string;
  regimenCode: string;
  unitValueUSD: number;
  unitMeasure?: string;
  units?: number;
  weightKg: number;
  totalValueUSD: number;
  totalValueMXN?: number;
  declaresAntidumping?: boolean;
  declaresLink?: boolean;
  appliesTMEC?: boolean;
  hasTMECCertificate?: boolean;
  declaresNOMs?: boolean;
  hasIVAIEPSCertification?: boolean;
  documents?: {
    invoice?: boolean;
    bl?: boolean;
    packingList?: boolean;
    originCertificate?: boolean;
    mve?: boolean;
    permits?: boolean;
    nomCertificates?: boolean;
  };
}

// ── Frontera Canónica (docs/FRONTERA_CANONICA_DESIGN.md §1) ──────────────
// Todo dato legal de la API declara origen, fuente, fecha de cotejo y estado.
export type OrigenDato = 'catalogo' | 'tabla' | 'declarado_usuario' | 'llm_no_verificado';
export type EstadoDato = 'verificado' | 'sin_verificar' | 'no_revisado' | 'vencido' | 'no_disponible';

export interface FuenteLegal {
  nombre: string;
  url: string | null;
  version: string | null;
  fechaPublicacion: string | null;
}

export interface DatoLegal<T> {
  valor: T | null;
  origen: OrigenDato;
  fuente: FuenteLegal | null;
  fechaCotejo: string | null;
  estado: EstadoDato;
  metodo?: 'manual' | 'ingesta' | 'scraper';
  nota?: string;
}

export type DominioGlosa =
  | 'precio_estimado' | 'historico_importador' | 'cuotas_compensatorias'
  | 'padrones' | 'noms' | 'reclasificacion_historica';

export interface RevisionGlosa {
  dominios: Record<DominioGlosa, 'revisado' | 'no_revisado' | 'no_aplica'>;
  completa: boolean;
  noRevisados: { dominio: DominioGlosa; motivo: string }[];
  /** Reglas cuyo dato de entrada no fue capturado o es insuficiente: no
   *  disparan ni cuentan como revisadas — quedan visibles con motivo. */
  reglasNoEvaluadas?: { ruleCode: string; motivo: string }[];
}

export interface GlosaRiskFlag {
  ruleCode: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  name: string;
  reason: string;
  recommendation: string;
  legalBasis: string | null;
  /** Fundamento con procedencia: verde solo si la regla está cotejada en DB. */
  fundamento: DatoLegal<string> | null;
  weight: number;
}

export interface GlosaSimulationResult {
  simulationId: string;
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  /** 'indeterminado' cuando la revisión quedó incompleta — el score parcial
   *  NO puede presentarse como bajo (fail-closed §5.2). */
  riskLevelPresentacion: 'low' | 'medium' | 'high' | 'critical' | 'indeterminado';
  raProbability: number;
  cotejoProb: number;
  glosaProb: number;
  flags: GlosaRiskFlag[];
  recommendations: { priority: 'critical' | 'recommended'; items: string[] }[];
  industryAverage: number | null;
  yourHistory: number | null;
  revision: RevisionGlosa;
  tipoCambio: DatoLegal<number> | null;
  disclaimer: string;
  /** Versión normativa eco-devuelta por ESTA corrida (fuente: backend, ya no
   *  el espejo hardcodeado corpus-version.ts). */
  versiones?: {
    tigie: string;
    ligie: string;
    rgce: string | null;
    fuenteNombre: string;
    fuenteUrl: string;
    fechaPublicacion: string;
    fechaVerificacion: string;
  };
}

export interface GlosaSimulationListItem {
  id: string;
  fractionCode: string;
  countryOrigin: string;
  customsCode: string;
  regimenCode: string;
  valueUSD: number;
  riskScore: number;
  riskLevel: string;
  raProbability: number;
  actualOutcome: string | null;
  createdAt: string;
  feedbackAt: string | null;
  /** null en simulaciones previas a la revisión por dominios (Fase 2). */
  revision?: RevisionGlosa | null;
}

export interface GlosaSimulationFull extends GlosaSimulationListItem {
  pedimentoData: GlosaSimulationInput;
  riskFlags: GlosaRiskFlag[];
  recommendations: { priority: 'critical' | 'recommended'; items: string[] }[];
  industryAverage: number | null;
  yourHistory: number | null;
  cotejoProb: number;
  glosaProb: number;
  weightKg: number;
  units: number | null;
  unitMeasure: string | null;
  countryProvider: string;
}

export interface GlosaRiskRuleRecord {
  id: string;
  ruleCode: string;
  category: string;
  name: string;
  description: string;
  weight: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  recommendation: string;
  legalBasis: string | null;
  active: boolean;
}

export interface GlosaStats {
  total: number;
  byLevel: { level: string; count: number }[];
  topRules: { ruleCode: string; name: string; activations: number }[];
  customsRA: { customs: string; ra: number; total: number }[];
  modelCalibration: { predictedAvg: number; actualRA: number; total: number };
}

export interface TenantRoleRecord {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isCustom: boolean;
  permissions: { modules: Record<string, Record<string, boolean>>; features: Record<string, boolean>; limits?: Record<string, number | null> };
  conflictsWith: string[];
  active: boolean;
}

export interface UserPermissions {
  legacyRole: string | undefined;
  roles: { code: string; name: string; description: string | null }[];
  permissions: { modules: Record<string, Record<string, boolean>>; features: Record<string, boolean>; limits?: Record<string, number | null> };
}

export interface TenantUserWithRoles {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
  roles: { assignmentId: string; code: string; name: string; assignedAt: string }[];
}

export interface SODConflict {
  hasConflict: boolean;
  conflictingRoles: { id: string; code: string; name: string }[];
}

export interface PermissionAuditEntry {
  id: string;
  tenantId: string;
  userId: string;
  action: string;
  targetUserId: string | null;
  roleId: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  actor: { id: string; email: string; name: string } | null;
  target: { id: string; email: string; name: string } | null;
  role: { id: string; code: string; name: string } | null;
}

export interface InvitationRecord {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  invitedBy: string;
  initialRoleCodes: string[];
  token: string;
  expiresAt: string;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'CANCELED';
  acceptedAt: string | null;
  acceptedUserId: string | null;
  createdAt: string;
  updatedAt: string;
  lastSentAt: string | null;
}

export interface OEAReport {
  generatedAt: string;
  period: { since: string; until: string };
  sodConflicts: {
    usersWithConflicts: { userId: string; email: string; name: string; roles: { code: string; name: string }[]; conflicts: string[] }[];
    totalUsersChecked: number;
  };
  roleDistribution: { code: string; count: number }[];
  activity: { permissionDenials: number; roleAssignments: number; roleRemovals: number };
  recommendations: string[];
}

export interface TenantSettings {
  id: string;
  name: string;
  rfc: string | null;
  plan: string;
  status: string;
  pilotStartedAt: string | null;
  pilotEndsAt: string | null;
  classificationLimit: number | null;
  userLimit: number | null;
  contractStartedAt: string | null;
  contractEndsAt: string | null;
  monthlyPrice: number | null;
  contractModules: string[];
  lastActivityAt: string | null;
  healthScore: number;
  createdAt: string;
  updatedAt: string;
  userCount: number;
  classificationCount: number;
  quoteCount: number;
}

export interface TenantUser {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface LegalDocSummary {
  id: string;
  type: string;
  source: string;
  title: string;
  reference: string;
  officialUrl: string | null;
  publishedDate: string | null;
  effectiveDate: string | null;
  topics: string[];
  keywords: string[];
}

export interface LegalDocFull extends LegalDocSummary {
  content: string;
}

export interface SATPadronRecord {
  id: string;
  type: 'general' | 'sectorial' | 'encargo_conferido';
  sectorialCode: string | null;
  sectorialName: string | null;
  description: string;
  legalBasis: string;
  authority: string;
  fractionCodes: string[];
  fractionPatterns: string[];
  estimatedDays: number | null;
  costMXN: number | null;
  validityMonths: number;
  requiresEFirma: boolean;
  renewalRequired: boolean;
  renewalAdvance: number;
  active: boolean;
}

export interface TenantPadronStatusRecord {
  id: string;
  tenantId: string;
  padronId: string;
  padron: SATPadronRecord;
  status: 'active' | 'suspended' | 'expired' | 'rejected' | 'in_process' | 'not_registered';
  registrationDate: string | null;
  expirationDate: string | null;
  lastVerified: string;
  verifiedBy: string | null;
  evidence: string | null;
  notes: string | null;
  rejectionReason: string | null;
  suspensionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PadronCheckItem {
  padronId: string;
  type: string;
  sectorialCode: string | null;
  sectorialName: string;
  description: string;
  legalBasis: string;
  authority: string;
  estimatedDays: number | null;
  status: string;
  isActive: boolean;
  isExpiringSoon: boolean;
  expirationDate: string | null;
  isBlocking: boolean;
  daysToExpiration: number | null;
}

export interface PadronCheckResultData {
  fractionCode: string;
  canOperate: boolean;
  totalRequired: number;
  required: PadronCheckItem[];
  blocking: PadronCheckItem[];
  warnings: PadronCheckItem[];
  legalConsequences: string[];
}

export interface PadronDeclareInput {
  padronId: string;
  status: 'active' | 'in_process' | 'suspended' | 'expired' | 'rejected';
  registrationDate?: string;
  expirationDate?: string;
  evidence?: string;
  notes?: string;
}

export interface PadronExposureReport {
  tenant: { id: string; name: string; rfc: string | null } | null;
  totalBlockingChecks: number;
  byFraction: { fractionCode: string; attempts: number; missingPadrones: string[]; lastCheckedAt: string }[];
}

export interface TimestampProofRecord {
  id: string;
  resourceType: string;
  resourceId: string;
  contentHash: string;
  bitcoinBlock: number | null;
  bitcoinTimestamp: string | null;
  status: 'pending' | 'submitted' | 'confirmed' | 'verified' | 'failed';
  submittedAt: string;
  confirmedAt: string | null;
  lastCheckedAt: string | null;
  verificationCount: number;
  errorMessage: string | null;
  calendarUrl: string | null;
}

export interface TimestampStats {
  total: number;
  byStatus: { status: string; count: number }[];
  lastConfirmed: { confirmedAt: string | null; bitcoinBlock: number | null } | null;
  avgConfirmationMinutes: number | null;
}

export interface AntidumpingDutyRecord {
  id: string;
  resolutionType: string;
  resolutionNumber: string | null;
  expedienteUPCI: string | null;
  fractionCode: string;
  countryOfOrigin: string;
  productDesc: string | null;
  specificProducer: string | null;
  rateType: string;
  rate: number;
  rateUnit: string;
  publishDateDOF: string | null;
  effectiveDate: string | null;
  expiryDate: string | null;
  status: string;
  investigationType: string | null;
  decree: string | null;
  dofUrl: string | null;
  notes: string | null;
  active: boolean;
}

export interface AntidumpingCheckResult {
  duty: AntidumpingDutyRecord;
  calculatedAmountUSD: number | null;
  calculation: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  expiringSoon: boolean;
  daysToExpiry: number | null;
  appliesToOperation: boolean;
}

export interface ExposureReport {
  tenantId: string;
  totalImports: number;
  totalExposureUSD: number;
  potentialMultaUSD: number;
  byResolution: {
    resolutionNumber: string | null;
    fractionCode: string;
    countryOfOrigin: string;
    productDesc: string | null;
    importsCount: number;
    exposureUSD: number;
  }[];
}

export interface CopilotCitation {
  reference: string;
  documentId: string;
  source: string;
  excerpt: string;
  officialUrl: string | null;
  score: number;
}

export interface CopilotChatResponse {
  reply: string;
  conversationId: string;
  /** SOLO documentos que respaldan citas del texto (clave exacta). Puede ser []. */
  citations: CopilotCitation[];
  /** Documentos recuperados que NO respaldan ninguna cita — se muestran
   *  aparte, nunca como fuentes de la afirmación (Fase 3a §4.2). */
  documentosConsultados?: { reference: string; source: string; officialUrl: string | null }[];
  citaEstricta?: {
    modo: 'off' | 'sombra' | 'estricta';
    regenerada: boolean;
    degradada: boolean;
    noRespaldadas: string[];
  };
  confidence: number;
  consultHash: string;
  retrievedDocsCount: number;
  hallucinationWarning: { count: number; refs: string[] } | null;
}

export interface LegalDocumentMeta {
  id: string;
  type: string;
  source: string;
  title: string;
  reference: string;
  officialUrl: string | null;
  publishedDate: string | null;
  effectiveDate: string | null;
  expiryDate: string | null;
  isActive: boolean;
  supersededBy: string | null;
  version: string | null;
  topics: string[];
  keywords: string[];
  fractionRefs: string[];
  contentHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface LegalDocsStats {
  total: number;
  active: number;
  inactive: number;
  byType: { type: string; count: number }[];
  bySource: { source: string; count: number }[];
  byTopic: { topic: string; count: number }[];
  lastUpdate: string | null;
}

export interface CopilotQuality {
  period: string;
  totalConsults: number;
  feedback: { helpful: number; unhelpful: number; helpfulRate: number };
  avgConfidence: number;
  topDocsCited: { reference: string; count: number }[];
  neverCitedCount: number;
}

export interface DemoProfile {
  id: string;
  industryCode: string;
  industryName: string;
  description: string;
  longDescription: string | null;
  companyName: string;
  rfc: string;
  primarySector: string;
  immexModality: string | null;
  certifications: string[] | null;
  fractionsRange: { chapters: number[]; typical: string[] };
  countriesOfOrigin: string[];
  productCatalog: { sku: string; description: string; fraction: string }[];
  isDefault: boolean;
  active: boolean;
}

export interface BackupRecord {
  id: string;
  type: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  storageProvider: string;
  storageUrl: string | null;
  storageKey: string | null;
  sizeBytes: number | null;
  recordCount: number | null;
  checksumSHA256: string | null;
  encrypted: boolean;
  errorMessage: string | null;
  retentionDays: number;
  expiresAt: string | null;
  triggeredBy: string | null;
}

export interface BackupConfig {
  ok: boolean;
  details: string;
  provider: string;
  backupDir: string;
  encryptionKeyConfigured: boolean;
  operationsEmail: string;
  retention: { daily: number; weekly: number; monthly: number; manual: number };
  lastSuccessful: { id: string; type: string; completedAt: string } | null;
}

export interface RestoreLogRecord {
  id: string;
  backupId: string;
  type: string;
  startedAt: string;
  completedAt: string | null;
  status: string;
  scope: unknown;
  recordsRestored: number | null;
  triggeredBy: string;
  reason: string | null;
  errorMessage: string | null;
  backup: { id: string; type: string; completedAt: string | null };
}

export interface SystemIncidentRecord {
  id: string;
  title: string;
  severity: string;
  status: string;
  startedAt: string;
  resolvedAt: string | null;
  components: string[];
  description: string;
  updates: { ts: string; message: string; status: string }[];
  affectedUsers: number | null;
  rootCause: string | null;
  resolution: string | null;
  publicVisible: boolean;
}

export interface PublicStatus {
  overall: 'operational' | 'degraded' | 'down';
  timestamp: string;
  uptime: number;
  components: { name: string; status: 'operational' | 'degraded' | 'down'; detail?: string }[];
  uptime90: { day: string; status: 'operational' | 'degraded' | 'down' }[];
}

export type ProfessionalType = 'agent_customs' | 'broker' | 'importer' | 'consultant' | 'other';
export type VerificationStatus = 'pending' | 'submitted' | 'verified' | 'rejected' | 'expired';

export interface UserVerificationRecord {
  id: string;
  userId: string;
  professionalType: ProfessionalType | null;
  agentPatente: string | null;
  agentSocialName: string | null;
  agentPort: string | null;
  agentVerified: boolean;
  agentExpiry: string | null;
  patenteDocUrl: string | null;
  rfcDocUrl: string | null;
  cspDocUrl: string | null;
  status: VerificationStatus;
  submittedAt: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  rejectionReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserVerificationWithUser extends UserVerificationRecord {
  user: { id: string; email: string; name: string; tenantId: string; tenant?: { name: string; rfc: string | null } };
}

export interface PatenteLookup {
  exists: boolean;
  active: boolean;
  expired: boolean;
  socialName?: string;
  port?: string;
  expiry?: string;
  source?: string;
}

export type RFCValidationReason =
  | 'EMPTY' | 'INVALID_LENGTH' | 'EXPECTED_MORAL' | 'EXPECTED_FISICA'
  | 'INVALID_PATTERN_MORAL' | 'INVALID_PATTERN_FISICA' | 'INVALID_MONTH' | 'INVALID_DAY'
  | 'GENERIC_RFC' | 'TEST_PATTERN' | 'SUSPICIOUS_HOMOCLAVE';

export interface RFCValidationResult {
  valid: boolean;
  reason?: RFCValidationReason;
  warning?: RFCValidationReason;
  message?: string;
  type?: 'moral' | 'fisica';
  normalized?: string;
  isGeneric?: boolean;
}

export interface TenantRFCFlag {
  id: string;
  name: string;
  rfc: string | null;
  plan: string;
  status: string;
  createdAt: string;
  rfcValid: boolean;
  rfcReason: string | null;
  rfcWarning: string | null;
  rfcMessage: string | null;
  isGeneric: boolean;
}

export interface SecurityEventRecord {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  ip: string;
  userId: string | null;
  email: string | null;
  endpoint: string | null;
  details: unknown;
  createdAt: string;
}

export interface BlockedIPRecord {
  id: string;
  ip: string;
  reason: string;
  expiresAt: string;
  active: boolean;
  createdAt: string;
}

export interface LockedUserRecord {
  id: string;
  email: string;
  name: string;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  lastLoginIp: string | null;
}

export interface SecurityOverview {
  events: { day: number; week: number; month: number };
  blocks: { active: number; last24h: number; last7d: number };
  bySeverity: { severity: string; count: number }[];
  byType: { type: string; count: number }[];
  lockedUsers: number;
  recentFailedLogins: { id: string; email: string; ip: string; reason: string | null; createdAt: string }[];
}

export interface FractionSearchResult {
  code: string;
  codeFormatted: string;
  description: string;
  tariffNMF: number | null;
  tariffTMEC?: number | null;
  unit?: string | null;
  noms?: string[];
  requiresPermit?: boolean;
  permitType?: string | null;
}

// Inventario IMMEX
export interface InventoryStats {
  totalImports: number;
  activeImports: number;
  totalDischarges: number;
  expiringIn90Days: number;
  totalValueActive: number;
  totalPendingQty: number;
}

export interface InventoryBalance {
  fractionCode: string;
  description: string;
  unit: string;
  totalImported: number;
  totalDischarged: number;
  balance: number;
  totalValueUSD: number;
  earliestExpiration: string | null;
  daysRemaining: number | null;
  importCount: number;
  activeImports: number;
}

export interface TemporaryImportRecord {
  id: string;
  pedimento: string;
  fractionCode: string;
  description: string;
  quantity: number;
  unit: string;
  customsValue: number;
  valueMXN?: number | null;
  supplier?: string | null;
  originCountry?: string | null;
  entryDate: string;
  expirationDate: string;
  expirationMonths: number;
  quantityDischarged: number;
  status: string;
  notes?: string | null;
  createdAt: string;
  discharges?: {
    id: string;
    type: string;
    quantity: number;
    dischargeDate: string;
    pedimento?: string | null;
  }[];
}

export interface DischargeRecord {
  id: string;
  type: string;
  pedimento?: string | null;
  quantity: number;
  unit: string;
  customsValue?: number | null;
  dischargeDate: string;
  destinationCountry?: string | null;
  buyerName?: string | null;
  taxesPaid?: number | null;
  notes?: string | null;
  createdAt: string;
  temporaryImport?: {
    pedimento: string;
    fractionCode: string;
    description: string;
  };
}

export interface CreateImportInput {
  pedimento: string;
  fractionCode: string;
  description: string;
  quantity: number;
  unit: string;
  customsValue: number;
  valueMXN?: number;
  supplier?: string;
  originCountry?: string;
  entryDate: string;
  expirationMonths?: number;
  notes?: string;
}

export interface CreateDischargeInput {
  temporaryImportId: string;
  type: string;
  pedimento?: string;
  quantity: number;
  unit: string;
  customsValue?: number;
  dischargeDate: string;
  destinationCountry?: string;
  buyerName?: string;
  taxesPaid?: number;
  notes?: string;
}

export interface Annex24ReportRecord {
  id: string;
  period: string;
  periodStart: string;
  periodEnd: string;
  totalImports: number;
  totalDischarges: number;
  totalValueUSD: number;
  status: string;
  transmissionDate?: string | null;
  transmissionRef?: string | null;
  createdAt: string;
}

export interface Annex30AccountRecord {
  id: string;
  period: string;
  totalCredits: number;
  totalGuarantees: number;
  totalDebits: number;
  balance: number;
  igiDeferred: number;
  dtaDeferred: number;
  ivaDeferred: number;
}

export interface ProductRecord {
  id: string;
  productCode: string;
  description: string;
  fractionCode: string | null;
  unit: string;
  isFinished: boolean;
  active: boolean;
  createdAt: string;
  components?: ProductComponentExpanded[];
  _count?: { assemblies: number };
}

export interface ProductComponentRecord {
  id: string;
  productId: string;
  componentId: string;
  quantity: number;
  unit: string;
  scrapPercent: number;
  notes?: string | null;
}

export interface ProductComponentExpanded extends ProductComponentRecord {
  component: ProductRecord;
}

export interface AssemblyRecord {
  id: string;
  productId: string;
  product: { productCode: string; description: string; unit: string };
  quantity: number;
  assemblyDate: string;
  reference: string | null;
  notes: string | null;
  consumptions: AssemblyConsumptionRecord[];
  createdAt: string;
}

export interface AssemblyConsumptionRecord {
  id: string;
  assemblyId: string;
  componentId: string;
  componentCode: string;
  fractionCode: string | null;
  quantityRequired: number;
  quantityWithScrap: number;
  unit: string;
  importIds: string[];
}

export interface AssemblyResultRecord {
  assemblyId: string;
  consumptions: {
    componentCode: string;
    fractionCode: string | null;
    quantityWithScrap: number;
    unit: string;
    importsConsumed: { importId: string; pedimento: string; deducted: number }[];
    shortage: number;
  }[];
}

export interface DocumentAIRecord {
  id: string;
  tenantId: string | null;
  name: string;
  type: string;
  docType: string | null;
  confidence: number | null;
  extractedData: Record<string, unknown> | null;
  rawText: string | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  fileHash: string | null;
  status: string;
  aiErrors: string[] | null;
  processedAt: string | null;
  operationId: string | null;
  operation?: { id: string; reference: string } | null;
  createdAt: string;
}

export interface DocumentBatchItem {
  index: number;
  ok: boolean;
  document?: { id: string; docType: string | null; confidence: number | null; extractedData: unknown; fileHash: string };
  cached?: boolean;
  linked?: boolean;
  operationId?: string;
  error?: string;
}

export type CrossAuditSeverity = 'error' | 'warning' | 'info';

export interface CrossAuditResultRecord {
  operationId: string;
  documentCount: number;
  byType: Record<string, number>;
  issues: { severity: CrossAuditSeverity; rule: string; message: string; affectedDocs: string[] }[];
  timeline: {
    stage: string;
    label: string;
    date: string | null;
    documentId: string | null;
    documentType: string | null;
    status: 'present' | 'missing' | 'partial';
  }[];
}

export interface AuditLogRecord {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown | null;
  after: unknown | null;
  diff: Record<string, { from: unknown; to: unknown }> | null;
  ipAddress: string | null;
  userAgent: string | null;
  endpoint: string | null;
  method: string | null;
  metadata: Record<string, unknown> | null;
  hash: string;
  prevHash: string | null;
  createdAt: string;
  user: { id: string; email: string; name: string; role: string } | null;
}

export interface AuditReportData {
  tenant: { id: string; name: string; rfc: string | null; plan: string };
  period: { start: string; end: string };
  chainIntegrity: { valid: boolean; brokenAt?: string; checkedCount: number };
  logCount: number;
  logs: AuditLogRecord[];
  reportHash: string;
  cryptoCertification?: {
    anchoredCount: number;
    confirmedCount: number;
    lastBitcoinBlock: number | null;
    lastConfirmedAt: string | null;
    legalNotice: string;
  };
  generatedAt: string;
  disclaimer: string;
}

export interface PedimentoPartidaInputV2 {
  numeroPartida: number;
  fraccion: string;
  descripcion: string;
  cantidad: number;
  unidadMedida: string;
  unidadMedidaCom?: string;
  valorUnitario: number;
  valorAduana: number;
  pais: string;
  paisVendedor?: string;
  igi?: number;
  dta?: number;
  iva?: number;
  ieps?: number;
  permisos?: { tipo: string; codigo: string; autoridad: string }[];
  identificadores?: { codigo: string; complemento1?: string; complemento2?: string }[];
  vinculacion?: boolean;
  vinculacionDesc?: string;
}

export interface PedimentoInputV2 {
  numero?: string;
  clave: string;
  aduana: string;
  patenteAduanal: string;
  rfcImportador: string;
  curp?: string;
  tipoOperacion: 'IMP' | 'EXP';
  regimen: string;
  destino?: string;
  origen?: string;
  pesoBruto: number;
  pesoNeto: number;
  bultos: number;
  valorAduana: number;
  valorComercial: number;
  valorDolares: number;
  tipoCambio: number;
  incoterm: string;
  transporte: string;
  medioTransporte?: string;
  factura?: string;
  cove?: string;
  bl?: string;
  partidas: PedimentoPartidaInputV2[];
}

export interface PedimentoValidationIssue {
  partida?: number;
  field: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  rule: string;
}

export interface PedimentoValidationResult {
  valid: boolean;
  errorsCount: number;
  warningsCount: number;
  issues: PedimentoValidationIssue[];
  aiNotes: { partida: number; observation: string; suggestion: string }[];
}

export interface PedimentoRecord {
  id: string;
  numero: string | null;
  clave: string;
  aduana: string;
  rfcImportador: string;
  status: string;
  valorAduana: number;
  partidas?: { id: string; numeroPartida: number; fraccion: string; valorAduana: number }[];
  _count?: { partidas: number };
  createdAt: string;
}

export interface MultiQuoteItemInput {
  fractionCode: string;
  description?: string;
  countryOfOrigin: string;
  quantity: number;
  unit?: string;
  /** Peso bruto en kg — requerido cuando aplica cuota compensatoria USD/kg. */
  weightKg?: number;
  unitValueUSD: number;
  freightUSD?: number;
  insuranceUSD?: number;
  igiRateOverride?: number;
  applyTreaty?: 'TMEC' | 'TLCUEM' | 'CPTPP';
  hasCertificadoOrigen?: boolean;
  applyPROSEC?: boolean;
  applyRegla8va?: boolean;
  regla8vaParentFraction?: string;
  isVehicle?: boolean;
  vehiclePriceMXN?: number;
  isElectric?: boolean;
}

export interface ItemPrograms {
  prosec: { eligible: boolean; applied: boolean; sector: string | null; prosecRate: number | null; savingsMXN: number; verificacion?: DatoLegal<number> | null };
  regla8va: { eligible: boolean; applied: boolean; vehicleFraction: string | null; preferentialRate: number | null };
  ieps: { applies: boolean; category: string | null; rate: number; rateType: string; amountMXN: number; calculation: string };
  isan: { applies: boolean; exempt: boolean; amountMXN: number; calculation: string; tier: { fixedAmount: number; marginalRate: number } | null };
}

export interface ItemTreaty {
  requested: string | null;
  applied: string | null;
  hasCertificate: boolean;
  nmfRate: number;
  preferentialRate: number | null;
  appliedRate: number;
  savingsMXN: number;
  note: string | null;
}

export interface DispatchCostsInput {
  honorariosAgente?: number;
  prevalidacion?: number;
  almacenaje?: number;
  estiba?: number;
  fleteInterno?: number;
  otrosGastos?: { label: string; amount: number }[];
}

export interface MultiQuoteInput {
  name?: string;
  client?: string;
  origin?: string;
  destination?: string;
  incoterm?: string;
  currency?: string;
  exchangeRateMode?: 'current' | 'average30' | string;
  exchangeRate?: number;
  items: MultiQuoteItemInput[];
  dispatch?: DispatchCostsInput;
}

export interface EstimatedPriceMatch {
  fractionCode: string;
  countryOfOrigin: string | null;
  estimatedValue: number;
  unit: string;
  decree: string | null;
  publishDate: string;
  effectiveDate: string;
  source: string;
  notes: string | null;
}

export interface PriceCheckResult {
  hasEstimatedPrice: boolean;
  estimated: EstimatedPriceMatch | null;
  declaredUnitValueUSD: number | null;
  ratio: number | null;
  deltaPct: number | null;
  severity: 'critical' | 'warning' | 'ok' | 'no_data';
  message: string | null;
  guaranteeMXN: number | null;
  action: string | null;
  disclaimer: string | null;
}

export interface MultiQuoteItem {
  numeroPartida: number;
  fractionCode: string;
  description: string | null;
  countryOfOrigin: string;
  quantity: number;
  unit: string | null;
  unitValueUSD: number;
  totalValueUSD: number;
  freightUSD: number;
  insuranceUSD: number;
  customsValueUSD: number;
  customsValueMXN: number;
  igiRate: number;
  dtaRate: number;
  ivaRate: number;
  iepsRate: number;
  countervailingRate: number;
  igi: number;
  dta: number;
  ieps: number;
  countervailing: number;
  iva: number;
  totalDuties: number;
  isan: number;
  totalCost: number;
  hasAntidumping: boolean;
  antidumpingDecree: string | null;
  antidumping: MultiQuoteAntidumping | null;
  alertas: string[];
  priceCheck: PriceCheckResult | null;
  treaty: ItemTreaty;
  programs: ItemPrograms;
}

export interface MultiQuoteAntidumping {
  rate: number;
  rateType: 'percentage' | 'specific_USD_kg' | 'specific_USD_unit';
  rateUnit: string;
  resolutionNumber: string | null;
  expedienteUPCI: string | null;
  productDesc: string | null;
  dofUrl: string | null;
  effectiveDate: string | null;
  expiryDate: string | null;
  matchType: 'exact' | 'subheading' | 'heading';
  matchedFraction: string | null;
  calculation: string | null;
  needsWeight: boolean;
  potentialPenaltyMXN: number;
}

export interface MultiQuoteResult {
  exchangeRate: number;
  exchangeRateDate: string;
  exchangeRateMode: string;
  exchangeRateSource: string;
  exchangeRateIsOfficial: boolean;
  exchangeRateWarning: string | null;
  items: MultiQuoteItem[];
  dispatch: {
    honorariosAgente: number;
    prevalidacion: number;
    almacenaje: number;
    estiba: number;
    fleteInterno: number;
    otrosGastos: { label: string; amount: number }[];
    total: number;
  };
  totals: {
    valueMXN: number;
    igi: number;
    dta: number;
    ieps: number;
    countervailing: number;
    iva: number;
    isan: number;
    totalDuties: number;
    totalLandedCost: number;
    totalDispatch: number;
    totalAll: number;
  };
  alertas: string[];
}

export interface ScenarioVariant {
  name: string;
  freightMultiplier?: number;
  weightMultiplier?: number;
  exchangeRateOverride?: number;
  countryOverride?: string;
}

// ── Precedentes legales ──
export interface LegalPrecedent {
  id: string;
  type: 'TFJA' | 'SCJN' | 'CRITERIO_SAT' | 'CONSULTA_SAT' | 'OMA' | 'RESOLUCION_UPCI';
  reference: string;
  title: string;
  fractionCodes: string[];
  chapterCodes: string[];
  topic: string;
  summary: string;
  ruling: string;
  reasoning: string;
  applicability: string | null;
  yearPublished: number;
  isVigente: boolean;
  litigated: boolean;
  source: string | null;
  createdAt?: string;
}

export interface PrecedentMatch extends LegalPrecedent {
  relevanceScore: number;
}

// ── NOMs y Anexo 2.4.1 ──
export interface NOMOperationContext {
  immex?: boolean;
  productive?: boolean;
  consumerFinal?: boolean;
  automotive?: boolean;
  industrialEquipment?: boolean;
  ownUse?: boolean;
  personalUse?: boolean;
  samples?: boolean;
  repair?: boolean;
  reExport?: boolean;
  governmentImport?: boolean;
  willLabelInMexico?: boolean;
  fair?: boolean;
}

export interface NOMExceptionMatch {
  exceptionId: string;
  exceptionCode: string;
  fraction: string;
  description: string;
  requiredDoc: string | null;
  legalBasis: string | null;
}

export interface NOMEvaluation {
  nomCode: string;
  authority: string;
  description: string;
  required: boolean;
  exception: NOMExceptionMatch | null;
  fullComplianceRequirements: string[] | null;
  message: string;
  severity: 'critical' | 'warning' | 'info' | 'ok';
}

export interface CartaNoComercializacionInput {
  empresa: string;
  rfc: string;
  immexNumber?: string;
  domicilioFiscal?: string;
  representanteLegal: string;
  representanteCargo?: string;
  fractionCode: string;
  productDescription: string;
  noms: string[];
  destination: string;
  exceptionCode: string;
}

// ── Origen TMEC ──
export interface OriginRule {
  id: string;
  fractionCode: string;
  matchType: string;
  agreement: string;
  ruleType: 'wholly_obtained' | 'tariff_shift' | 'rvc' | 'specific_process' | 'combined';
  description: string;
  rvcRequired: number | null;
  rvcRequiredNetCost: number | null;
  rvcMethod: string | null;
  tariffShift: string | null;
  tariffShiftCode: string | null;
  specificProcess: string | null;
  annex: string | null;
  isAutomotive: boolean;
  autoCategory: 'vehicle' | 'core_part' | 'principal_part' | 'complementary_part' | null;
  laborValueContent: number | null;
  steelAluminumPercent: number | null;
  textileRule: string | null;
  notes: string | null;
}

export interface OriginCertificateInput {
  fractionCode: string;
  productDescription: string;
  exporterName: string;
  exporterAddress?: string;
  exporterTaxId?: string;
  importerName?: string;
  importerAddress?: string;
  importerTaxId?: string;
  producerName?: string;
  producerAddress?: string;
  producerTaxId?: string;
  originCountry: 'MX' | 'US' | 'CA';
  preferenceCriterion: 'A' | 'B' | 'C' | 'D' | 'E';
  blanketPeriodFrom?: string;
  blanketPeriodTo?: string;
  signedBy: string;
  signedByRole: string;
  originAnalysisId?: string;
}

export interface OriginCertificateRecord {
  id: string;
  certificateNumber: string;
  fractionCode: string;
  productDescription: string;
  exporterName: string;
  exporterAddress: string | null;
  exporterTaxId: string | null;
  importerName: string | null;
  importerAddress: string | null;
  importerTaxId: string | null;
  producerName: string | null;
  producerAddress: string | null;
  producerTaxId: string | null;
  originCountry: string;
  preferenceCriterion: string;
  blanketPeriodFrom: string | null;
  blanketPeriodTo: string | null;
  signedDate: string;
  signedBy: string;
  signedByRole: string;
  status: string;
  contentHash: string | null;
  createdAt: string;
}

export interface OriginRecommendation {
  type: 'reduce_vnm' | 'increase_originating' | 'change_method' | 'check_specific_process' | 'tariff_shift_audit' | 'wholly_obtained';
  message: string;
  deltaUSD?: number;
}

export interface OriginMaterial { description: string; value: number; fraction?: string; origin?: string }

export interface OriginAnalysisInput {
  fractionCode: string;
  productDescription?: string;
  agreement?: string;
  productValue: number;
  originatingValue?: number;
  nonOriginatingValue?: number;
  originatingMaterials?: OriginMaterial[];
  nonOriginatingMaterials?: OriginMaterial[];
  laborCost?: number;
  highWageLaborCost?: number;
  overheadCost?: number;
  profit?: number;
  packagingCost?: number;
  royalties?: number;
  rvcMethod?: 'transaction_value' | 'net_cost' | 'build_up' | 'build_down';
  totalSteelAluminumValue?: number;
  northAmericanSteelAluminumValue?: number;
  persist?: boolean;
}

export interface OriginAnalysisResult {
  fractionCode: string;
  agreement: string;
  rule: OriginRule | null;
  rvc: { transactionValue: number | null; netCost: number | null; buildUp: number | null; buildDown: number | null };
  rvcRequired: number | null;
  rvcMethodApplied: 'transaction_value' | 'net_cost' | 'build_up' | 'build_down';
  netCost: number | null;
  totalOriginatingValue: number;
  totalNonOriginatingValue: number;
  laborValueContentPct: number | null;
  lvcRequired: number | null;
  lvcCompliance: boolean | null;
  steelAluminumNAPct: number | null;
  saRequired: number | null;
  saCompliance: boolean | null;
  tariffShiftCompliance: boolean | null;
  qualifies: boolean;
  qualifyingMethod: string | null;
  reason: string;
  reasons: string[];
  recommendations: OriginRecommendation[];
  formula: string;
  disclaimer: string;
  analysisId?: string | null;
  consultHash?: string;
  // legacy compat
  rvcMethod?: string;
  rvcCalculated?: number | null;
}

export interface OriginAnalysisRecord {
  id: string;
  fractionCode: string;
  agreement: string;
  productValue: number;
  originatingValue: number;
  nonOriginatingValue: number;
  rvcCalculated: number | null;
  ruleApplied: string | null;
  qualifies: boolean;
  reason: string;
  recommendations: unknown;
  createdAt: string;
}

export interface ScenarioComparison {
  base: MultiQuoteResult;
  scenarios: { name: string; result: MultiQuoteResult; deltaMXN: number; deltaPct: number }[];
}

export interface ROIModuleEntry {
  count: number;
  perUnitMXN: number;
  savingsMXN: number;
  rationale: string;
}

export interface ROISummary {
  tenantId: string;
  periodDays: number;
  periodStart: string;
  totalSavingsMXN: number;
  byModule: {
    classifier: ROIModuleEntry;
    inventoryIMMEX: ROIModuleEntry;
    fiscalGuardian: ROIModuleEntry;
    quoter: ROIModuleEntry;
    mve: ROIModuleEntry;
    logistics: ROIModuleEntry;
  };
}

export interface ComplianceScore {
  tenantId: string;
  score: number;
  status: 'EXCELENTE' | 'BUENO' | 'REGULAR' | 'DEFICIENTE';
  computedAt: string;
  breakdown: {
    expedientes: { value: number; weight: number; detail: string };
    inventarios: { value: number; weight: number; detail: string };
    certificacion: { value: number; weight: number; detail: string };
    alertas: { value: number; weight: number; detail: string };
    clasificaciones: { value: number; weight: number; detail: string };
  };
  recommendations: string[];
}

export interface ImportTraceabilityRecord {
  importId: string;
  pedimento: string;
  fractionCode: string;
  description: string;
  quantityImported: number;
  quantityDischarged: number;
  balance: number;
  unit: string;
  consumedInAssemblies: {
    assemblyId: string;
    productCode: string;
    productDescription: string;
    quantityProduced: number;
    assemblyDate: string;
    componentDeducted: number;
  }[];
  totalConsumedInProduction: number;
}

export interface InconsistencyReport {
  issues: {
    severity: 'critical' | 'warning' | 'info';
    fractionCode: string;
    message: string;
    detail: string;
    recommendation: string;
  }[];
  aiSummary: string | null;
  total: number;
}

// Fiscal Guardian
export interface FiscalDashboard {
  activeCredits: number;
  totalCredits: number;
  expiringCredits: number;
  activeGuarantees: number;
  expiringGuarantees: number;
  totalPending: number;
  totalGranted: number;
  utilizationRate: number;
  certificationStatus: string;
  certificationModality: string | null;
  riskScore: number;
  riskFactors: string[];
}

export interface FiscalAccount {
  totalGranted: number;
  totalUsed: number;
  totalPending: number;
  totalIVA: number;
  totalIEPS: number;
  activeCount: number;
  expiredCount: number;
  totalCredits: number;
  utilizationRate: number;
  byMonth: { month: string; granted: number; used: number; balance: number }[];
  byFraction: { fractionCode: string; granted: number; used: number; balance: number; count: number }[];
}

export interface TaxCreditRecord {
  id: string;
  pedimento: string;
  fractionCode: string;
  ivaAmount: number;
  iepsAmount: number;
  creditDate: string;
  status: string;
  dischargeDeadline: string;
  discharged: number;
  remaining: number;
  relatedImportId?: string | null;
  notes?: string | null;
  createdAt: string;
  usages?: CreditUsageRecord[];
}

export interface CreditUsageRecord {
  id: string;
  pedimentoDescargo: string;
  ivaApplied: number;
  iepsApplied: number;
  usageDate: string;
  createdAt: string;
}

export interface CreateTaxCreditInput {
  pedimento: string;
  fractionCode: string;
  ivaAmount: number;
  iepsAmount?: number;
  creditDate: string;
  dischargeDeadline: string;
  relatedImportId?: string;
  notes?: string;
}

export interface CreateCreditUsageInput {
  pedimentoDescargo: string;
  ivaApplied: number;
  iepsApplied?: number;
  usageDate: string;
}

export interface FiscalRiskReport {
  risks: {
    severity: 'critical' | 'high' | 'medium' | 'low';
    category: string;
    message: string;
    detail: string;
    action: string;
  }[];
  aiSummary: string | null;
  total: number;
  critical: number;
  high: number;
}

export interface CertLossSimulation {
  currentStatus: string;
  modality: string | null;
  immediateImpact: number;
  monthlyExtraCost: number;
  annualExtraCost: number;
  cashFlowImpact: number;
  pendingIVA: number;
  totalImportValue: number;
  activeImportsCount: number;
  aiAnalysis: string | null;
}

export interface GuaranteeRecord {
  id: string;
  type: string;
  amount: number;
  institution: string;
  referenceNumber?: string | null;
  issueDate: string;
  expiryDate: string;
  status: string;
  notes?: string | null;
  createdAt: string;
  daysLeft?: number;
  alertLevel?: 'ok' | 'warning' | 'danger' | 'expired';
}

export interface CreateGuaranteeInput {
  type: string;
  amount: number;
  institution: string;
  referenceNumber?: string;
  issueDate: string;
  expiryDate: string;
  notes?: string;
}

export interface CertificationProfileRecord {
  id: string;
  modality: string;
  certNumber?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
  renewalDeadline?: string | null;
  status: string;
  notes?: string | null;
}

export interface CertificationUpdateInput {
  modality: string;
  certNumber?: string;
  issueDate?: string;
  expiryDate?: string;
  renewalDeadline?: string;
  status?: string;
  notes?: string;
}

// Auto MVE
export interface MVEDashboard {
  total: number;
  draft: number;
  validated: number;
  signed: number;
  transmitted: number;
  pendingAction: number;
  totalValueUSD: number;
  riskCounts: { LOW: number; MEDIUM: number; HIGH: number };
  avgRiskScore: number;
}

export interface ExtractedInvoiceData {
  providerName: string;
  providerCountry: string;
  providerTaxId?: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  incoterm: string;
  currency: string;
  items: {
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    // MVE no clasifica: sin fracción. Usar el Clasificador (valida vs catálogo).
  }[];
  subtotal: number;
  freight?: number | null;
  insurance?: number | null;
  otherCharges?: number | null;
  totalValue: number;
  paymentTerms?: string | null;
  notes?: string | null;
}

export interface MVERecord {
  id: string;
  pedimento?: string | null;
  providerName: string;
  providerCountry: string;
  invoiceNumber: string;
  invoiceDate: string;
  incoterm: string;
  currency: string;
  exchangeRate?: number | null;
  invoiceValue: number;
  freightValue: number;
  insuranceValue: number;
  otherIncrements: number;
  customsValue: number;
  hasVinculacion: boolean;
  vinculacionDesc?: string | null;
  formatoE2?: unknown;
  aiValidation?: MVEValidation | null;
  riskLevel?: string | null;
  status: string;
  signedAt?: string | null;
  transmittedAt?: string | null;
  createdAt: string;
  coves?: COVERecord[];
}

export interface CreateMVEInput {
  pedimento?: string;
  providerName: string;
  providerCountry: string;
  invoiceNumber: string;
  invoiceDate: string;
  incoterm: string;
  currency: string;
  exchangeRate?: number;
  invoiceValue: number;
  freightValue?: number;
  insuranceValue?: number;
  otherIncrements?: number;
  hasVinculacion?: boolean;
  vinculacionDesc?: string;
}

export interface MVEValidation {
  riskLevel: string;
  warnings: {
    severity: 'critical' | 'high' | 'medium' | 'low';
    category: string;
    message: string;
    recommendation: string;
  }[];
  summary: string;
}

export interface COVERecord {
  id: string;
  eDocument: string;
  invoiceNumber: string;
  providerTaxId?: string | null;
  value: number;
  currency: string;
  validated: boolean;
  validationDate?: string | null;
  createdAt: string;
}

// Logistics Optimizer
export interface ContainerSpec {
  type: string;
  label: string;
  length: number;
  width: number;
  height: number;
  maxWeight: number;
  volumeM3: string;
}

export interface LoadPlanRecord {
  id: string;
  name: string;
  containerType: string;
  containerLength: number;
  containerWidth: number;
  containerHeight: number;
  maxWeight: number;
  totalItems: number;
  totalVolume: number;
  totalWeight: number;
  volumeUsed: number;
  weightUsed: number;
  aiOptimization?: LoadOptimization | null;
  costAnalysis?: CostAnalysis | null;
  status: string;
  createdAt: string;
  items?: LoadItemRecord[];
}

export interface LoadItemRecord {
  id: string;
  description: string;
  quantity: number;
  length: number;
  width: number;
  height: number;
  weight: number;
  stackable: boolean;
  fragile: boolean;
}

export interface CreateLoadItemInput {
  description: string;
  quantity: number;
  length: number;
  width: number;
  height: number;
  weight: number;
  stackable?: boolean;
  fragile?: boolean;
}

export interface CubicageResult {
  containerVolume: number;
  itemsVolume: number;
  totalWeight: number;
  volumeUsedPct: number;
  weightUsedPct: number;
  limitingFactor: string;
  totalPieces: number;
  fitsAll: boolean;
  overflow: number;
  items: {
    description: string;
    quantity: number;
    fitQuantity: number;
    volumePerPiece: number;
    weightPerPiece: number;
    totalVolume: number;
    totalWeight: number;
  }[];
}

export interface LoadOptimization {
  loadingOrder: string[];
  arrangement: string;
  tips: string[];
  spaceOptimization: string;
  alternativeContainer?: string;
  estimatedLoadTime?: string;
}

export interface CostAnalysis {
  options: {
    name: string;
    containers: string;
    estimatedCost: number;
    costPerPiece: number;
    volumeUtilization: number;
    pros: string[];
    cons: string[];
  }[];
  recommendation: string;
  savingsVsWorst: number;
  notes?: string;
}

// TIGIE Updater
export interface TIGIEUpdateRecord {
  id: string;
  source: string;
  decree?: string | null;
  publishDate: string;
  effectiveDate: string;
  summary: string;
  fractionsCreated: number;
  fractionsModified: number;
  fractionsSuppressed: number;
  nomsUpdated: number;
  changes: DecreeChangeItem[];
  status: string;
  appliedAt?: string | null;
  appliedBy?: string | null;
  usersNotified: number;
  createdAt: string;
  _count?: { notifications: number };
  notifications?: UpdateNotificationRecord[];
}

export interface DecreeChangeItem {
  type: 'created' | 'modified' | 'suppressed' | 'nom_update';
  fractionCode: string;
  description?: string;
  field?: string;
  oldValue?: string | null;
  newValue?: string | null;
  details?: string;
}

export interface DecreeAnalysisData {
  decree: string;
  source: string;
  publishDate: string;
  effectiveDate: string;
  summary: string;
  context: string;
  impactedSectors: string[];
  changes: DecreeChangeItem[];
  fractionsCreated: number;
  fractionsModified: number;
  fractionsSuppressed: number;
  nomsUpdated: number;
}

export interface UpdateNotificationRecord {
  id: string;
  fractionCode: string;
  changeType: string;
  oldValue?: string | null;
  newValue?: string | null;
  message: string;
  channel: string;
  sent: boolean;
  read: boolean;
  createdAt: string;
  update?: { decree?: string | null; source: string; effectiveDate: string };
}

export interface WeeklyDigest {
  period: string;
  digest: string;
  updatesCount: number;
  affectedFractions: string[];
}

export interface ChangelogEntry {
  fractionCode: string;
  changeType: string;
  field?: string;
  oldValue?: string | null;
  newValue?: string | null;
  decree?: string | null;
  effectiveDate: string;
  details?: string;
}

// Pre-validador
export interface PrevalidateInput {
  fractionCode: string;
  origin?: string;
  customsValue?: number;
  currency?: string;
  incoterm?: string;
  operationType?: string;
  regime?: string;
  customsBroker?: string;
  importerRFC?: string;
  exchangeRate?: number;
  grossWeight?: number;
  netWeight?: number;
  packages?: number;
  invoiceNumber?: string;
}

export interface PrevalidateResult {
  valid: boolean;
  score: number;
  issues: {
    severity: 'error' | 'warning' | 'info';
    field: string;
    message: string;
    suggestion?: string;
  }[];
  summary: string;
}

// Operaciones / Expedientes
export interface OperationRecord {
  id: string;
  reference: string;
  type: string;
  description?: string | null;
  fractionCode?: string | null;
  origin?: string | null;
  destination?: string | null;
  customsValue?: number | null;
  currency: string;
  customsBroker?: string | null;
  operationDate?: string | null;
  status: string;
  completeness?: number;
  createdAt: string;
  documents?: DocumentRecord[];
}

export interface DocumentRecord {
  id: string;
  name: string;
  type: string;
  required: boolean;
  status: string;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  notes?: string | null;
  expiresAt?: string | null;
  verifiedAt?: string | null;
  createdAt: string;
}

export interface CreateOperationInput {
  reference: string;
  type?: string;
  description?: string;
  fractionCode?: string;
  origin?: string;
  destination?: string;
  customsValue?: number;
  currency?: string;
  customsBroker?: string;
  operationDate?: string;
}

export interface LeadRecord {
  id: string;
  name: string;
  company?: string | null;
  email: string;
  phone: string;
  message?: string | null;
  source: string;
  status: string;
  rfc?: string | null;
  industry?: string | null;
  monthlyOps?: string | null;
  hasIMMEX?: boolean | null;
  currentSoftware?: string | null;
  problems: string[];
  referralSource?: string | null;
  score: number;
  scoreBreakdown?: string | null;
  createdAt: string;
}

export interface LeadStatsData {
  total: number;
  new: number;
  contacted: number;
  demoScheduled: number;
  demoDone: number;
  pilot: number;
  negotiating: number;
  converted: number;
  discarded: number;
  avgScore: number;
  hotLeads: number;
  warmLeads: number;
  coldLeads: number;
}

export interface DemoAccountRecord {
  id: string;
  leadId: string;
  tenantId: string;
  userId: string;
  email: string;
  password: string;
  expiresAt: string;
  active: boolean;
  products: string[];
  createdAt: string;
  lead?: LeadRecord;
}

// ── Tenants / Pilotos / Contratos ──

export interface PilotRecord {
  id: string;
  name: string;
  status: string;
  pilotStartedAt: string | null;
  pilotEndsAt: string | null;
  daysLeft: number;
  classificationsUsed: number;
  classificationLimit: number | null;
  usersCount: number;
  userLimit: number | null;
  lastActivityAt: string | null;
  healthScore: number;
  primaryUser: { id: string; email: string; name: string; lastLoginAt: string | null; active: boolean } | null;
}

export interface TenantRecord {
  id: string;
  name: string;
  plan: string;
  status: string;
  active: boolean;
  rfc: string | null;
  monthlyPrice: number | null;
  contractStartedAt: string | null;
  contractEndsAt: string | null;
  contractDaysLeft: number | null;
  pilotStartedAt: string | null;
  pilotEndsAt: string | null;
  pilotDaysLeft: number | null;
  classificationsUsed: number;
  classificationLimit: number | null;
  usersCount: number;
  userLimit: number | null;
  quotesCount: number;
  operationsCount: number;
  healthScore: number;
  lastActivityAt: string | null;
  daysSinceLastActivity: number | null;
  createdAt: string;
}

export interface TenantDetail extends Omit<TenantRecord, 'classificationsUsed' | 'usersCount' | 'quotesCount' | 'operationsCount' | 'contractDaysLeft' | 'pilotDaysLeft' | 'daysSinceLastActivity'> {
  users: { id: string; email: string; name: string; role: string; status: string; active: boolean; lastLoginAt: string | null; createdAt: string }[];
  proposals: ProposalRecord[];
  moduleUsage: {
    classifier: number;
    quoter: number;
    mve: number;
    inventory: number;
    logistics: number;
    operations: number;
  };
  _count: { classifications: number; quotes: number; operations: number; temporaryImports: number; manifestaciones: number; loadPlans: number };
}

export interface ProposalRecord {
  id: string;
  tenantId: string;
  leadId: string | null;
  plan: string;
  monthlyPrice: number;
  durationMonths: number;
  modules: string[];
  conditions: string | null;
  supportTier: string | null;
  status: string;
  sentAt: string | null;
  acceptedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  tenant?: { id: string; name: string };
}

export interface AdminDashboardData {
  kpis: {
    leadsThisMonth: number;
    pilotsActive: number;
    activeTenants: number;
    contractsExpiringSoon: number;
    mrr: number;
    mrrGoal: number;
  };
  pipeline: {
    new: number;
    contacted: number;
    demoScheduled: number;
    demoDone: number;
    pilot: number;
    negotiating: number;
    converted: number;
    discarded: number;
  };
  latestLeads: { id: string; name: string; company: string | null; status: string; score: number; createdAt: string }[];
  pilots: { id: string; name: string; pilotEndsAt: string | null; healthScore: number }[];
}

export interface RenewalRecord {
  id: string;
  name: string;
  plan: string;
  monthlyPrice: number | null;
  contractStartedAt: string | null;
  contractEndsAt: string | null;
  healthScore: number;
  lastActivityAt: string | null;
  daysLeft: number;
  urgency: 'critical' | 'high' | 'medium';
}

export interface AdminMetricsData {
  totalClassifications: number;
  avgConfidence: number;
  feedback: Record<string, number>;
  topFractions: { fractionCode: string; count: number }[];
  topTenants: { tenantId: string; name: string; plan: string; classifications: number }[];
}

export interface DemoCounts {
  imports?: number;
  discharges?: number;
  taxCredits?: number;
  creditUsages?: number;
  guarantees?: number;
  certification?: number;
  classifications?: number;
  quotes?: number;
  operations?: number;
  mves?: number;
  coves?: number;
  loadPlans?: number;
  alerts?: number;
}

export interface DemoStatus {
  tenantId: string;
  total: number;
  loaded: boolean;
  breakdown: {
    imports: number;
    discharges: number;
    taxCredits: number;
    guarantees: number;
    certifications: number;
    classifications: number;
    quotes: number;
    operations: number;
    mves: number;
    coves: number;
    loadPlans: number;
    alerts: number;
  };
}

/** Catálogos del Anexo 22 RGCE 2026 (Apéndices 1, 2 y 16) — DOF 15-ene-2026. */
export interface Anexo22Catalogs {
  aduanas: { clave: string; denominacion: string }[];
  regimenes: { clave: string; descripcion: string }[];
  clavesPedimento: { clave: string; descripcion: string; regimenes: string[] }[];
  fuente: string;
}

export interface TenantStatusData {
  id: string;
  name: string;
  plan: string;
  status: string;
  isPilot: boolean;
  /** Fase 2.1: true si el tenant tiene datos DEMO sembrados (isDemoData en BD). */
  hasDemoData: boolean;
  pilotStartedAt: string | null;
  pilotEndsAt: string | null;
  pilotDaysLeft: number | null;
  classificationsUsed: number;
  classificationLimit: number | null;
  usersCount: number;
  userLimit: number | null;
  contractStartedAt: string | null;
  contractEndsAt: string | null;
  contractDaysLeft: number | null;
  monthlyPrice: number | null;
}
