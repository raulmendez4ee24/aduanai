import { useState, useEffect, useCallback } from 'react';
import {
  Shield, Plus, AlertTriangle, DollarSign, Clock, FileText,
  X, RefreshCw, Trash2, CreditCard, ShieldCheck, ShieldAlert,
  TrendingUp, ChevronDown, ChevronRight, Zap,
} from 'lucide-react';
import { api } from '../lib/api';
import type {
  FiscalDashboard, TaxCreditRecord, GuaranteeRecord,
  CertificationProfileRecord, FiscalRiskReport, CertLossSimulation,
  CreateTaxCreditInput, CreateCreditUsageInput, CreateGuaranteeInput,
  CertificationUpdateInput,
} from '../lib/api';

type Tab = 'dashboard' | 'credits' | 'guarantees' | 'certification' | 'risks';

const CREDIT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Activo', PARTIALLY_USED: 'Parcial', FULLY_USED: 'Usado',
  EXPIRED: 'Vencido', IRREGULAR: 'Irregular',
};
const CREDIT_STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'var(--cyan)', PARTIALLY_USED: '#f59e0b', FULLY_USED: '#10b981',
  EXPIRED: '#ef4444', IRREGULAR: '#ef4444',
};
const GUARANTEE_TYPES: Record<string, string> = {
  FIANZA: 'Fianza', CARTA_CREDITO: 'Carta de credito', DEPOSITO: 'Deposito', OTRO: 'Otro',
};
const CERT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Activa', RENEWAL_PENDING: 'Renovacion pendiente',
  AT_RISK: 'En riesgo', SUSPENDED: 'Suspendida', CANCELLED: 'Cancelada', NOT_CONFIGURED: 'Sin configurar',
};
const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: 'var(--cyan)',
};

export function FiscalGuardianPage() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<FiscalDashboard | null>(null);
  const [credits, setCredits] = useState<TaxCreditRecord[]>([]);
  const [guarantees, setGuarantees] = useState<GuaranteeRecord[]>([]);
  const [certification, setCertification] = useState<CertificationProfileRecord | null>(null);
  const [risks, setRisks] = useState<FiscalRiskReport | null>(null);
  const [simulation, setSimulation] = useState<CertLossSimulation | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingRisks, setLoadingRisks] = useState(false);
  const [loadingSim, setLoadingSim] = useState(false);
  const [showCreditForm, setShowCreditForm] = useState(false);
  const [showUsageForm, setShowUsageForm] = useState<string | null>(null);
  const [showGuaranteeForm, setShowGuaranteeForm] = useState(false);
  const [showCertForm, setShowCertForm] = useState(false);
  const [expandedCredit, setExpandedCredit] = useState<string | null>(null);
  const [creditPage, setCreditPage] = useState(1);
  const [creditTotal, setCreditTotal] = useState(0);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.fiscalDashboard();
      setDashboard(res.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCredits = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const res = await api.fiscalCredits(page);
      setCredits(res.data);
      setCreditTotal(res.pagination.total);
      setCreditPage(page);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadGuarantees = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.fiscalGuarantees();
      setGuarantees(res.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCertification = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.fiscalCertification();
      setCertification(res.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRisks = useCallback(async () => {
    try {
      setLoadingRisks(true);
      const res = await api.fiscalRisks();
      setRisks(res.data);
    } catch {
      // silent
    } finally {
      setLoadingRisks(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'dashboard') loadDashboard();
    if (tab === 'credits') loadCredits();
    if (tab === 'guarantees') loadGuarantees();
    if (tab === 'certification') loadCertification();
    if (tab === 'risks') loadRisks();
  }, [tab, loadDashboard, loadCredits, loadGuarantees, loadCertification, loadRisks]);

  const handleSimulate = async () => {
    setLoadingSim(true);
    try {
      const res = await api.fiscalSimulateLoss();
      setSimulation(res.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoadingSim(false);
    }
  };

  const tabs: { key: Tab; label: string; icon: typeof Shield }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: Shield },
    { key: 'credits', label: 'Creditos', icon: CreditCard },
    { key: 'guarantees', label: 'Garantias', icon: ShieldCheck },
    { key: 'certification', label: 'Certificacion', icon: FileText },
    { key: 'risks', label: 'Riesgos IA', icon: ShieldAlert },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
            <span style={{ color: 'var(--cyan)' }}>Fiscal</span> Guardian
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Control 31 — Creditos fiscales IVA/IEPS y certificacion
          </p>
        </div>
        <div className="flex gap-2">
          {tab === 'credits' && (
            <button onClick={() => setShowCreditForm(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium" style={{ background: 'var(--cyan)', color: 'var(--bg-deep)' }}>
              <Plus size={16} /> Nuevo credito
            </button>
          )}
          {tab === 'guarantees' && (
            <button onClick={() => setShowGuaranteeForm(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium" style={{ background: 'var(--cyan)', color: 'var(--bg-deep)' }}>
              <Plus size={16} /> Nueva garantia
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl flex items-center justify-between" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <span className="text-sm" style={{ color: '#ef4444' }}>{error}</span>
          <button onClick={() => setError('')}><X size={16} style={{ color: '#ef4444' }} /></button>
        </div>
      )}

      <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium flex-1 justify-center transition-all"
            style={{
              background: tab === t.key ? 'var(--cyan-glow)' : 'transparent',
              color: tab === t.key ? 'var(--cyan)' : 'var(--text-muted)',
              border: tab === t.key ? '1px solid rgba(6,182,212,0.15)' : '1px solid transparent',
            }}>
            <t.icon size={15} /><span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {loading && !dashboard ? (
        <div className="text-center py-20" style={{ color: 'var(--text-muted)' }}>
          <RefreshCw className="animate-spin mx-auto mb-3" size={24} />
          <p className="text-sm">Cargando datos fiscales...</p>
        </div>
      ) : (
        <>
          {tab === 'dashboard' && <DashboardTab dashboard={dashboard} />}
          {tab === 'credits' && <CreditsTab credits={credits} page={creditPage} total={creditTotal} onPageChange={loadCredits} expandedCredit={expandedCredit} setExpandedCredit={setExpandedCredit} onUse={(id) => setShowUsageForm(id)} onDelete={async (id) => { await api.fiscalCreditDelete(id); loadCredits(creditPage); }} />}
          {tab === 'guarantees' && <GuaranteesTab guarantees={guarantees} onDelete={async (id) => { await api.fiscalGuaranteeDelete(id); loadGuarantees(); }} />}
          {tab === 'certification' && <CertificationTab certification={certification} simulation={simulation} loadingSim={loadingSim} onSimulate={handleSimulate} onEdit={() => setShowCertForm(true)} />}
          {tab === 'risks' && <RisksTab risks={risks} loading={loadingRisks} onRefresh={loadRisks} />}
        </>
      )}

      {showCreditForm && <CreditFormModal onClose={() => setShowCreditForm(false)} onSubmit={async (d) => { await api.fiscalCreditCreate(d); setShowCreditForm(false); loadCredits(); }} setError={setError} />}
      {showUsageForm && <UsageFormModal onClose={() => setShowUsageForm(null)} onSubmit={async (d) => { await api.fiscalCreditUse(showUsageForm, d); setShowUsageForm(null); loadCredits(creditPage); }} setError={setError} />}
      {showGuaranteeForm && <GuaranteeFormModal onClose={() => setShowGuaranteeForm(false)} onSubmit={async (d) => { await api.fiscalGuaranteeCreate(d); setShowGuaranteeForm(false); loadGuarantees(); }} setError={setError} />}
      {showCertForm && <CertFormModal current={certification} onClose={() => setShowCertForm(false)} onSubmit={async (d) => { await api.fiscalCertificationUpdate(d); setShowCertForm(false); loadCertification(); }} setError={setError} />}
    </div>
  );
}

// ============================================
// Dashboard Tab
// ============================================

function DashboardTab({ dashboard }: { dashboard: FiscalDashboard | null }) {
  if (!dashboard) return null;

  const riskColor = dashboard.riskScore <= 20 ? '#10b981' : dashboard.riskScore <= 50 ? '#f59e0b' : dashboard.riskScore <= 75 ? '#f97316' : '#ef4444';
  const riskLabel = dashboard.riskScore <= 20 ? 'Bajo' : dashboard.riskScore <= 50 ? 'Moderado' : dashboard.riskScore <= 75 ? 'Alto' : 'Critico';
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (dashboard.riskScore / 100) * circumference;

  return (
    <div className="space-y-6">
      {/* Risk gauge + stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Risk score gauge */}
        <div className="p-5 rounded-xl flex flex-col items-center justify-center" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
          <p className="text-xs uppercase mb-3" style={{ color: 'var(--text-dim)' }}>Score de riesgo</p>
          <div className="relative w-28 h-28">
            <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="var(--bg-deep)" strokeWidth="8" />
              <circle cx="50" cy="50" r="45" fill="none" stroke={riskColor} strokeWidth="8"
                strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                strokeLinecap="round" className="transition-all duration-1000" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold font-mono" style={{ color: riskColor }}>{dashboard.riskScore}</span>
              <span className="text-[10px] uppercase" style={{ color: 'var(--text-dim)' }}>{riskLabel}</span>
            </div>
          </div>
          {dashboard.riskFactors.length > 0 && (
            <div className="mt-3 space-y-1 w-full">
              {dashboard.riskFactors.slice(0, 3).map((f, i) => (
                <p key={i} className="text-[11px] flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                  <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: riskColor }} />
                  {f}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* KPI cards */}
        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'Creditos activos', value: dashboard.activeCredits, icon: CreditCard, color: 'var(--cyan)' },
            { label: 'Creditos por vencer', value: dashboard.expiringCredits, icon: Clock, color: dashboard.expiringCredits > 0 ? '#ef4444' : '#f59e0b' },
            { label: 'Garantias activas', value: dashboard.activeGuarantees, icon: ShieldCheck, color: '#10b981' },
            { label: 'Saldo pendiente', value: `$${(dashboard.totalPending / 1000).toFixed(0)}k`, icon: DollarSign, color: '#8b5cf6' },
            { label: 'Tasa utilizacion', value: `${dashboard.utilizationRate.toFixed(0)}%`, icon: TrendingUp, color: 'var(--cyan)' },
            { label: 'Certificacion', value: CERT_STATUS_LABELS[dashboard.certificationStatus] || dashboard.certificationStatus, icon: Shield, color: dashboard.certificationStatus === 'ACTIVE' ? '#10b981' : '#ef4444', small: true },
          ].map((s, i) => (
            <div key={i} className="p-3 rounded-xl" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${s.color}15` }}>
                  <s.icon size={16} style={{ color: s.color }} />
                </div>
              </div>
              <p className={`font-bold font-mono ${s.small ? 'text-sm' : 'text-xl'}`}>{s.value}</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Certification modality */}
      {dashboard.certificationModality && (
        <div className="p-4 rounded-xl flex items-center gap-4" style={{ background: 'rgba(6,182,212,0.05)', border: '1px solid rgba(6,182,212,0.15)' }}>
          <Shield size={20} style={{ color: 'var(--cyan)' }} />
          <div>
            <p className="text-sm font-medium">Certificacion IVA/IEPS — Modalidad {dashboard.certificationModality}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Total creditos otorgados: ${dashboard.totalGranted.toLocaleString()} MXN</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Credits Tab
// ============================================

function CreditsTab({ credits, page, total, onPageChange, expandedCredit, setExpandedCredit, onUse, onDelete }: {
  credits: TaxCreditRecord[];
  page: number;
  total: number;
  onPageChange: (p: number) => void;
  expandedCredit: string | null;
  setExpandedCredit: (v: string | null) => void;
  onUse: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const totalPages = Math.ceil(total / 20);
  const now = new Date();

  return (
    <div className="space-y-3">
      {credits.length === 0 ? (
        <div className="p-10 text-center rounded-xl" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          <CreditCard className="mx-auto mb-3 opacity-30" size={32} />
          <p className="text-sm">No hay creditos fiscales registrados</p>
        </div>
      ) : (
        <>
          {credits.map((c) => {
            const daysLeft = Math.ceil((new Date(c.dischargeDeadline).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            const totalCredit = c.ivaAmount + c.iepsAmount;
            const pct = totalCredit > 0 ? (c.discharged / totalCredit) * 100 : 0;
            const isExpanded = expandedCredit === c.id;

            return (
              <div key={c.id} className="rounded-xl" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                <button onClick={() => setExpandedCredit(isExpanded ? null : c.id)} className="w-full p-4 text-left">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {isExpanded ? <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
                      <span className="font-mono text-sm font-bold" style={{ color: 'var(--cyan)' }}>{c.pedimento}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${CREDIT_STATUS_COLORS[c.status] || 'var(--cyan)'}15`, color: CREDIT_STATUS_COLORS[c.status] || 'var(--cyan)' }}>
                        {CREDIT_STATUS_LABELS[c.status] || c.status}
                      </span>
                      {daysLeft <= 30 && daysLeft > 0 && c.remaining > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>VENCE EN {daysLeft}d</span>
                      )}
                    </div>
                    <span className="text-sm font-mono font-bold" style={{ color: c.remaining > 0 ? 'var(--text-primary)' : '#10b981' }}>
                      ${c.remaining.toLocaleString()} <span className="text-xs font-normal" style={{ color: 'var(--text-dim)' }}>MXN</span>
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-3 text-xs ml-6">
                    <div><span style={{ color: 'var(--text-dim)' }}>Fraccion</span><p className="font-mono">{c.fractionCode}</p></div>
                    <div><span style={{ color: 'var(--text-dim)' }}>IVA</span><p className="font-mono">${c.ivaAmount.toLocaleString()}</p></div>
                    <div><span style={{ color: 'var(--text-dim)' }}>Usado</span><p className="font-mono">${c.discharged.toLocaleString()}</p></div>
                    <div><span style={{ color: 'var(--text-dim)' }}>Vencimiento</span><p className="font-mono" style={{ color: daysLeft <= 30 ? '#ef4444' : 'inherit' }}>{new Date(c.dischargeDeadline).toLocaleDateString('es-MX')}</p></div>
                  </div>
                  <div className="mt-2 ml-6">
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-deep)' }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: pct >= 100 ? '#10b981' : 'var(--cyan)' }} />
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 ml-6 space-y-3" style={{ borderTop: '1px solid var(--border)' }}>
                    <div className="flex gap-2 mt-3">
                      {c.remaining > 0 && (
                        <button onClick={() => onUse(c.id)} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(6,182,212,0.1)', color: 'var(--cyan)', border: '1px solid rgba(6,182,212,0.2)' }}>
                          Registrar uso
                        </button>
                      )}
                      <button onClick={() => { if (confirm('Eliminar este credito?')) onDelete(c.id); }} className="text-xs px-3 py-1.5 rounded-lg" style={{ color: 'var(--text-dim)', border: '1px solid var(--border)' }}>
                        <Trash2 size={12} className="inline mr-1" />Eliminar
                      </button>
                    </div>

                    {c.usages && c.usages.length > 0 && (
                      <div>
                        <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-dim)' }}>Historial de usos</p>
                        <div className="space-y-1">
                          {c.usages.map(u => (
                            <div key={u.id} className="flex items-center justify-between p-2 rounded-lg text-xs" style={{ background: 'var(--bg-deep)' }}>
                              <span className="font-mono" style={{ color: 'var(--text-muted)' }}>{u.pedimentoDescargo}</span>
                              <span className="font-mono">${u.ivaApplied.toLocaleString()}</span>
                              <span style={{ color: 'var(--text-dim)' }}>{new Date(u.usageDate).toLocaleDateString('es-MX')}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              <button disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="px-3 py-1 rounded-lg text-sm" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-muted)', opacity: page <= 1 ? 0.5 : 1 }}>Anterior</button>
              <span className="px-3 py-1 text-sm" style={{ color: 'var(--text-muted)' }}>{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="px-3 py-1 rounded-lg text-sm" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-muted)', opacity: page >= totalPages ? 0.5 : 1 }}>Siguiente</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================
// Guarantees Tab
// ============================================

function GuaranteesTab({ guarantees, onDelete }: {
  guarantees: GuaranteeRecord[];
  onDelete: (id: string) => void;
}) {
  const alertColors: Record<string, string> = { ok: '#10b981', warning: '#f59e0b', danger: '#ef4444', expired: '#ef4444' };

  return (
    <div className="space-y-4">
      {guarantees.length === 0 ? (
        <div className="p-10 text-center rounded-xl" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          <ShieldCheck className="mx-auto mb-3 opacity-30" size={32} />
          <p className="text-sm">No hay garantias registradas</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {guarantees.map((g) => {
            const color = alertColors[g.alertLevel || 'ok'];
            return (
              <div key={g.id} className="p-4 rounded-xl" style={{ background: 'var(--bg-base)', border: `1px solid ${g.alertLevel === 'ok' ? 'var(--border)' : color}40` }}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${color}15` }}>
                      <ShieldCheck size={18} style={{ color }} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{GUARANTEE_TYPES[g.type] || g.type}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{g.institution}</p>
                    </div>
                  </div>
                  <button onClick={() => { if (confirm('Eliminar garantia?')) onDelete(g.id); }} className="p-1" style={{ color: 'var(--text-dim)' }}>
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                  <div>
                    <span style={{ color: 'var(--text-dim)' }}>Monto</span>
                    <p className="font-mono font-bold text-sm">${g.amount.toLocaleString()}</p>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-dim)' }}>Referencia</span>
                    <p className="font-mono">{g.referenceNumber || 'S/N'}</p>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-dim)' }}>Emision</span>
                    <p>{new Date(g.issueDate).toLocaleDateString('es-MX')}</p>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-dim)' }}>Vencimiento</span>
                    <p style={{ color }}>{new Date(g.expiryDate).toLocaleDateString('es-MX')}</p>
                  </div>
                </div>

                {g.daysLeft !== undefined && (
                  <div className="p-2 rounded-lg text-xs text-center font-medium" style={{ background: `${color}10`, color }}>
                    {g.daysLeft <= 0 ? 'VENCIDA' : `${g.daysLeft} dias restantes`}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================
// Certification Tab
// ============================================

function CertificationTab({ certification, simulation, loadingSim, onSimulate, onEdit }: {
  certification: CertificationProfileRecord | null;
  simulation: CertLossSimulation | null;
  loadingSim: boolean;
  onSimulate: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* Profile */}
      <div className="rounded-xl p-5" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Shield size={16} style={{ color: 'var(--cyan)' }} />
            Perfil de certificacion IVA/IEPS
          </h3>
          <button onClick={onEdit} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(6,182,212,0.1)', color: 'var(--cyan)', border: '1px solid rgba(6,182,212,0.2)' }}>
            {certification ? 'Editar' : 'Configurar'}
          </button>
        </div>

        {!certification ? (
          <div className="p-6 text-center rounded-lg" style={{ background: 'var(--bg-deep)' }}>
            <Shield className="mx-auto mb-3 opacity-30" size={32} style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No hay perfil de certificacion configurado</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>Configura tu certificacion para activar el monitoreo fiscal</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-3 rounded-lg" style={{ background: 'var(--bg-deep)' }}>
              <p className="text-[10px] uppercase" style={{ color: 'var(--text-dim)' }}>Modalidad</p>
              <p className="text-lg font-bold" style={{ color: 'var(--cyan)' }}>{certification.modality}</p>
            </div>
            <div className="p-3 rounded-lg" style={{ background: 'var(--bg-deep)' }}>
              <p className="text-[10px] uppercase" style={{ color: 'var(--text-dim)' }}>No. Certificado</p>
              <p className="text-sm font-mono">{certification.certNumber || 'S/N'}</p>
            </div>
            <div className="p-3 rounded-lg" style={{ background: 'var(--bg-deep)' }}>
              <p className="text-[10px] uppercase" style={{ color: 'var(--text-dim)' }}>Status</p>
              <p className="text-sm font-medium" style={{
                color: certification.status === 'ACTIVE' ? '#10b981' :
                  certification.status === 'AT_RISK' || certification.status === 'SUSPENDED' ? '#ef4444' : '#f59e0b'
              }}>
                {CERT_STATUS_LABELS[certification.status] || certification.status}
              </p>
            </div>
            <div className="p-3 rounded-lg" style={{ background: 'var(--bg-deep)' }}>
              <p className="text-[10px] uppercase" style={{ color: 'var(--text-dim)' }}>Renovacion</p>
              <p className="text-sm font-mono">{certification.renewalDeadline ? new Date(certification.renewalDeadline).toLocaleDateString('es-MX') : 'N/A'}</p>
            </div>
          </div>
        )}
      </div>

      {/* Simulate loss */}
      <div className="rounded-xl p-5" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Zap size={16} style={{ color: '#f59e0b' }} />
            Simulador de impacto — Perdida de certificacion
          </h3>
          <button onClick={onSimulate} disabled={loadingSim} className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg font-medium" style={{ background: loadingSim ? 'var(--bg-deep)' : 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>
            {loadingSim ? <><RefreshCw className="animate-spin" size={12} /> Calculando...</> : <><Zap size={12} /> Simular perdida</>}
          </button>
        </div>

        {!simulation ? (
          <div className="p-6 text-center rounded-lg" style={{ background: 'var(--bg-deep)' }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Presiona "Simular perdida" para calcular el impacto financiero</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                <p className="text-[10px] uppercase" style={{ color: '#ef4444' }}>Impacto inmediato</p>
                <p className="text-lg font-mono font-bold" style={{ color: '#ef4444' }}>${(simulation.immediateImpact / 1000).toFixed(0)}k</p>
                <p className="text-[10px]" style={{ color: 'var(--text-dim)' }}>Pago IVA diferido</p>
              </div>
              <div className="p-3 rounded-lg" style={{ background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.15)' }}>
                <p className="text-[10px] uppercase" style={{ color: '#f97316' }}>Costo mensual extra</p>
                <p className="text-lg font-mono font-bold" style={{ color: '#f97316' }}>${(simulation.monthlyExtraCost / 1000).toFixed(0)}k</p>
                <p className="text-[10px]" style={{ color: 'var(--text-dim)' }}>IVA anticipado</p>
              </div>
              <div className="p-3 rounded-lg" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
                <p className="text-[10px] uppercase" style={{ color: '#f59e0b' }}>Costo anual</p>
                <p className="text-lg font-mono font-bold" style={{ color: '#f59e0b' }}>${(simulation.annualExtraCost / 1000).toFixed(0)}k</p>
                <p className="text-[10px]" style={{ color: 'var(--text-dim)' }}>Sin certificacion</p>
              </div>
              <div className="p-3 rounded-lg" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)' }}>
                <p className="text-[10px] uppercase" style={{ color: '#8b5cf6' }}>Impacto flujo 3m</p>
                <p className="text-lg font-mono font-bold" style={{ color: '#8b5cf6' }}>${(simulation.cashFlowImpact / 1000).toFixed(0)}k</p>
                <p className="text-[10px]" style={{ color: 'var(--text-dim)' }}>Cash flow impact</p>
              </div>
            </div>

            {simulation.aiAnalysis && (
              <div className="p-4 rounded-lg text-sm leading-relaxed whitespace-pre-line" style={{ background: 'rgba(6,182,212,0.05)', border: '1px solid rgba(6,182,212,0.15)', color: 'var(--text-secondary)' }}>
                {simulation.aiAnalysis}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Risks Tab
// ============================================

function RisksTab({ risks, loading, onRefresh }: {
  risks: FiscalRiskReport | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {risks && risks.total > 0 && (
            <>
              {risks.critical > 0 && <span className="text-xs px-2 py-1 rounded-lg font-medium" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>{risks.critical} criticos</span>}
              {risks.high > 0 && <span className="text-xs px-2 py-1 rounded-lg font-medium" style={{ background: 'rgba(249,115,22,0.1)', color: '#f97316' }}>{risks.high} altos</span>}
            </>
          )}
        </div>
        <button onClick={onRefresh} disabled={loading} className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg font-medium" style={{ background: 'rgba(6,182,212,0.1)', color: 'var(--cyan)', border: '1px solid rgba(6,182,212,0.2)' }}>
          {loading ? <><RefreshCw className="animate-spin" size={12} /> Analizando...</> : <><ShieldAlert size={12} /> Analizar ahora</>}
        </button>
      </div>

      {risks?.aiSummary && (
        <div className="p-4 rounded-xl text-sm leading-relaxed" style={{ background: 'rgba(6,182,212,0.05)', border: '1px solid rgba(6,182,212,0.15)', color: 'var(--text-secondary)' }}>
          <p className="text-xs font-medium mb-2 flex items-center gap-1.5" style={{ color: 'var(--cyan)' }}>
            <Zap size={12} /> Diagnostico IA
          </p>
          {risks.aiSummary}
        </div>
      )}

      {!risks || risks.total === 0 ? (
        <div className="p-10 text-center rounded-xl" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
          {loading ? (
            <>
              <RefreshCw className="animate-spin mx-auto mb-3" size={24} style={{ color: 'var(--text-muted)' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Analizando riesgos fiscales con IA...</p>
            </>
          ) : (
            <>
              <ShieldCheck className="mx-auto mb-3 opacity-50" size={32} style={{ color: '#10b981' }} />
              <p className="text-sm" style={{ color: '#10b981' }}>Sin riesgos detectados</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Tu situacion fiscal se ve bien</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {risks.risks.map((r, i) => (
            <div key={i} className="p-4 rounded-xl" style={{ background: 'var(--bg-base)', border: `1px solid ${SEVERITY_COLORS[r.severity]}25` }}>
              <div className="flex items-start gap-3">
                <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" style={{ color: SEVERITY_COLORS[r.severity] }} />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded" style={{ background: `${SEVERITY_COLORS[r.severity]}15`, color: SEVERITY_COLORS[r.severity] }}>
                      {r.severity}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{r.category}</span>
                  </div>
                  <p className="text-sm font-medium mb-1">{r.message}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{r.detail}</p>
                  <p className="text-xs mt-2 flex items-center gap-1" style={{ color: 'var(--cyan)' }}>
                    <ChevronRight size={12} /> {r.action}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// Modals
// ============================================

function CreditFormModal({ onClose, onSubmit, setError }: { onClose: () => void; onSubmit: (d: CreateTaxCreditInput) => void; setError: (e: string) => void }) {
  const [form, setForm] = useState<CreateTaxCreditInput>({
    pedimento: '', fractionCode: '', ivaAmount: 0, iepsAmount: 0,
    creditDate: new Date().toISOString().split('T')[0],
    dischargeDeadline: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const set = (f: keyof CreateTaxCreditInput, v: string | number) => setForm(prev => ({ ...prev, [f]: v }));

  // Auto-calculate deadline (18 months from credit date)
  useEffect(() => {
    if (form.creditDate && !form.dischargeDeadline) {
      const d = new Date(form.creditDate);
      d.setMonth(d.getMonth() + 18);
      set('dischargeDeadline', d.toISOString().split('T')[0]);
    }
  }, [form.creditDate]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-lg rounded-2xl p-6" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-lg">Nuevo credito fiscal</h3>
          <button onClick={onClose}><X size={20} style={{ color: 'var(--text-muted)' }} /></button>
        </div>
        <form onSubmit={async (e) => { e.preventDefault(); setSubmitting(true); try { await onSubmit(form); } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Error'); } setSubmitting(false); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Pedimento *</label>
              <input required value={form.pedimento} onChange={e => set('pedimento', e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Fraccion arancelaria *</label>
              <input required value={form.fractionCode} onChange={e => set('fractionCode', e.target.value)} className="w-full p-2.5 rounded-lg text-sm font-mono" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>IVA credito (MXN) *</label>
              <input required type="number" step="any" min="0" value={form.ivaAmount || ''} onChange={e => set('ivaAmount', Number(e.target.value))} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>IEPS credito (MXN)</label>
              <input type="number" step="any" min="0" value={form.iepsAmount || ''} onChange={e => set('iepsAmount', Number(e.target.value))} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Fecha del credito *</label>
              <input required type="date" value={form.creditDate} onChange={e => set('creditDate', e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Fecha limite descargo *</label>
              <input required type="date" value={form.dischargeDeadline} onChange={e => set('dischargeDeadline', e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Notas</label>
            <textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} className="w-full p-2.5 rounded-lg text-sm resize-none" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--cyan)', color: 'var(--bg-deep)', opacity: submitting ? 0.7 : 1 }}>
              {submitting ? 'Guardando...' : 'Registrar credito'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UsageFormModal({ onClose, onSubmit, setError }: { onClose: () => void; onSubmit: (d: CreateCreditUsageInput) => void; setError: (e: string) => void }) {
  const [form, setForm] = useState<CreateCreditUsageInput>({
    pedimentoDescargo: '', ivaApplied: 0, iepsApplied: 0,
    usageDate: new Date().toISOString().split('T')[0],
  });
  const [submitting, setSubmitting] = useState(false);
  const set = (f: keyof CreateCreditUsageInput, v: string | number) => setForm(prev => ({ ...prev, [f]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-md rounded-2xl p-6" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-lg">Registrar uso de credito</h3>
          <button onClick={onClose}><X size={20} style={{ color: 'var(--text-muted)' }} /></button>
        </div>
        <form onSubmit={async (e) => { e.preventDefault(); setSubmitting(true); try { await onSubmit(form); } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Error'); } setSubmitting(false); }} className="space-y-4">
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Pedimento de descargo *</label>
            <input required value={form.pedimentoDescargo} onChange={e => set('pedimentoDescargo', e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>IVA aplicado (MXN) *</label>
              <input required type="number" step="any" min="0" value={form.ivaApplied || ''} onChange={e => set('ivaApplied', Number(e.target.value))} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>IEPS aplicado (MXN)</label>
              <input type="number" step="any" min="0" value={form.iepsApplied || ''} onChange={e => set('iepsApplied', Number(e.target.value))} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Fecha de uso *</label>
            <input required type="date" value={form.usageDate} onChange={e => set('usageDate', e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--cyan)', color: 'var(--bg-deep)', opacity: submitting ? 0.7 : 1 }}>
              {submitting ? 'Guardando...' : 'Registrar uso'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function GuaranteeFormModal({ onClose, onSubmit, setError }: { onClose: () => void; onSubmit: (d: CreateGuaranteeInput) => void; setError: (e: string) => void }) {
  const [form, setForm] = useState<CreateGuaranteeInput>({
    type: 'FIANZA', amount: 0, institution: '',
    issueDate: new Date().toISOString().split('T')[0],
    expiryDate: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const set = (f: keyof CreateGuaranteeInput, v: string | number) => setForm(prev => ({ ...prev, [f]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-md rounded-2xl p-6" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-lg">Nueva garantia</h3>
          <button onClick={onClose}><X size={20} style={{ color: 'var(--text-muted)' }} /></button>
        </div>
        <form onSubmit={async (e) => { e.preventDefault(); setSubmitting(true); try { await onSubmit(form); } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Error'); } setSubmitting(false); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Tipo *</label>
              <select required value={form.type} onChange={e => set('type', e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                <option value="FIANZA">Fianza</option>
                <option value="CARTA_CREDITO">Carta de credito</option>
                <option value="DEPOSITO">Deposito</option>
                <option value="OTRO">Otro</option>
              </select>
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Monto (MXN) *</label>
              <input required type="number" step="any" min="0" value={form.amount || ''} onChange={e => set('amount', Number(e.target.value))} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Institucion *</label>
              <input required value={form.institution} onChange={e => set('institution', e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} placeholder="Afianzadora, banco, etc." />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>No. Referencia</label>
              <input value={form.referenceNumber || ''} onChange={e => set('referenceNumber', e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Fecha emision *</label>
              <input required type="date" value={form.issueDate} onChange={e => set('issueDate', e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Fecha vencimiento *</label>
              <input required type="date" value={form.expiryDate} onChange={e => set('expiryDate', e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Notas</label>
            <textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} className="w-full p-2.5 rounded-lg text-sm resize-none" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--cyan)', color: 'var(--bg-deep)', opacity: submitting ? 0.7 : 1 }}>
              {submitting ? 'Guardando...' : 'Registrar garantia'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CertFormModal({ current, onClose, onSubmit, setError }: { current: CertificationProfileRecord | null; onClose: () => void; onSubmit: (d: CertificationUpdateInput) => void; setError: (e: string) => void }) {
  const [form, setForm] = useState<CertificationUpdateInput>({
    modality: current?.modality || 'A',
    certNumber: current?.certNumber || '',
    issueDate: current?.issueDate ? new Date(current.issueDate).toISOString().split('T')[0] : '',
    expiryDate: current?.expiryDate ? new Date(current.expiryDate).toISOString().split('T')[0] : '',
    renewalDeadline: current?.renewalDeadline ? new Date(current.renewalDeadline).toISOString().split('T')[0] : '',
    status: current?.status || 'ACTIVE',
  });
  const [submitting, setSubmitting] = useState(false);
  const set = (f: keyof CertificationUpdateInput, v: string) => setForm(prev => ({ ...prev, [f]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-md rounded-2xl p-6" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-lg">{current ? 'Editar' : 'Configurar'} certificacion</h3>
          <button onClick={onClose}><X size={20} style={{ color: 'var(--text-muted)' }} /></button>
        </div>
        <form onSubmit={async (e) => { e.preventDefault(); setSubmitting(true); try { await onSubmit(form); } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Error'); } setSubmitting(false); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Modalidad *</label>
              <select required value={form.modality} onChange={e => set('modality', e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                <option value="A">A</option>
                <option value="AA">AA</option>
                <option value="AAA">AAA</option>
                <option value="OEA">Operador Economico Autorizado</option>
              </select>
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>No. Certificado</label>
              <input value={form.certNumber || ''} onChange={e => set('certNumber', e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Status</label>
            <select value={form.status || 'ACTIVE'} onChange={e => set('status', e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
              <option value="ACTIVE">Activa</option>
              <option value="RENEWAL_PENDING">Renovacion pendiente</option>
              <option value="AT_RISK">En riesgo</option>
              <option value="SUSPENDED">Suspendida</option>
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Emision</label>
              <input type="date" value={form.issueDate || ''} onChange={e => set('issueDate', e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Vencimiento</label>
              <input type="date" value={form.expiryDate || ''} onChange={e => set('expiryDate', e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Renovacion</label>
              <input type="date" value={form.renewalDeadline || ''} onChange={e => set('renewalDeadline', e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Notas</label>
            <textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} className="w-full p-2.5 rounded-lg text-sm resize-none" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--cyan)', color: 'var(--bg-deep)', opacity: submitting ? 0.7 : 1 }}>
              {submitting ? 'Guardando...' : 'Guardar certificacion'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
