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
