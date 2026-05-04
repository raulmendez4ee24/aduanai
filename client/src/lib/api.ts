const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('aduanai_token');

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Error de conexión' }));
    throw new Error(error.message || `Error ${res.status}`);
  }

  return res.json();
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

  // Clasificador
  classify: (description: string, context?: string, countryOfOrigin?: string, declaredValueUSD?: number) =>
    request<{ status: string; data: ClassificationResult; classificationId?: string }>('/classify', {
      method: 'POST',
      body: JSON.stringify({ description, context, countryOfOrigin, declaredValueUSD }),
    }),

  classifyHistory: (search?: string, page = 1) =>
    request<{ status: string; data: ClassificationRecord[]; pagination: { page: number; total: number } }>(
      `/classify/history?page=${page}&limit=20${search ? `&search=${encodeURIComponent(search)}` : ''}`
    ),

  classifyFeedback: (id: string, feedback: 'correct' | 'incorrect' | 'partial', feedbackNote?: string) =>
    request<{ status: string }>(`/classify/${id}/feedback`, {
      method: 'PATCH',
      body: JSON.stringify({ feedback, feedbackNote }),
    }),

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

  // Copilot
  chat: (message: string, conversationId?: string) =>
    request<{ status: string; data: { reply: string; conversationId: string } }>('/copilot', {
      method: 'POST',
      body: JSON.stringify({ message, conversationId }),
    }),

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
};

// Types
export interface ClassifierAlert {
  type: 'antidumping' | 'undervalue' | 'nom_required' | 'sectoral_padron' | 'automotive' | 'permit_required';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface ClassificationMeta {
  tigieVersion: string;
  ligieVersion: string;
  consultHash: string;
  consultedAt: string;
  verifyUrl: string;
}

export interface ClassificationResult {
  fraction: { code: string; description: string; chapter: string; section: string };
  nico: string;
  confidence: number;
  griApplied: string[];
  tariffs: { nmf: number; preferential: Record<string, number> };
  regulations: { rrna: string[]; noms: string[]; sectoralRegistry: boolean };
  alternatives: { code: string; description: string; confidence: number; reason: string }[];
  explanation: { simple: string; technical: string };
  legalBasis?: {
    griApplied: { rule: string; reasoning: string }[];
    legalNotes: { source: string; text: string }[];
    discardedFractions: { code: string; reason: string }[];
  };
  disclaimer: string;
  alerts?: ClassifierAlert[];
  meta?: ClassificationMeta;
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
  preferential: { treaty: string; igi: number; savings: number }[] | null;
  compensatorias: AntidumpingMatch | null;
  regulaciones: RegulationMatch[];
  alertas: string[];
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
  unitValueUSD: number;
  freightUSD?: number;
  insuranceUSD?: number;
  igiRateOverride?: number;
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
  totalCost: number;
  hasAntidumping: boolean;
  antidumpingDecree: string | null;
  alertas: string[];
}

export interface MultiQuoteResult {
  exchangeRate: number;
  exchangeRateDate: string;
  exchangeRateMode: string;
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
    fractionCode?: string | null;
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

export interface TenantStatusData {
  id: string;
  name: string;
  plan: string;
  status: string;
  isPilot: boolean;
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
