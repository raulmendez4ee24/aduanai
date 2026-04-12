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
  login: (email: string, password: string) =>
    request<{ token: string; user: { id: string; email: string; name: string } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (data: { email: string; password: string; name: string; companyName: string }) =>
    request<{ token: string; user: { id: string; email: string; name: string } }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Clasificador
  classify: (description: string, context?: string) =>
    request<{ status: string; data: ClassificationResult }>('/classify', {
      method: 'POST',
      body: JSON.stringify({ description, context }),
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

  // Stats
  stats: () =>
    request<{ status: string; data: StatsData }>('/stats'),

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
};

// Types
export interface ClassificationResult {
  fraction: { code: string; description: string; chapter: string; section: string };
  nico: string;
  confidence: number;
  griApplied: string[];
  tariffs: { nmf: number; preferential: Record<string, number> };
  regulations: { rrna: string[]; noms: string[]; sectoralRegistry: boolean };
  alternatives: { code: string; description: string; confidence: number; reason: string }[];
  explanation: { simple: string; technical: string };
  disclaimer: string;
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

export interface QuoteResult {
  fraction: string;
  customsValue: number;
  currency: string;
  origin: string;
  exchangeRate: number;
  valueMXN: number;
  breakdown: {
    igi: { rate: number; amount: number };
    dta: { rate: number; amount: number };
    iva: { rate: number; amount: number };
    ieps: { rate: number; amount: number } | null;
    countervailingDuty: { rate: number; amount: number } | null;
    prevalidation: number;
  };
  totalTaxes: number;
  totalLandedCost: number;
  totalLandedCostUSD: number;
  preferential: { treaty: string; igi: number; savings: number }[] | null;
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
