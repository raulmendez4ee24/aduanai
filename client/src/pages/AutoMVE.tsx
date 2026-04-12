import { useState, useEffect, useCallback } from 'react';
import {
  FileSignature, Plus, AlertTriangle, CheckCircle, Send,
  X, RefreshCw, Trash2, FileText, Eye, PenTool, Zap,
  ChevronRight, Clock, DollarSign,
} from 'lucide-react';
import { api } from '../lib/api';
import type {
  MVEDashboard, MVERecord, ExtractedInvoiceData, MVEValidation,
  CreateMVEInput,
} from '../lib/api';

type Tab = 'dashboard' | 'manifestaciones' | 'nueva' | 'coves';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador', VALIDATED: 'Validada', SIGNED: 'Firmada',
  TRANSMITTED: 'Transmitida', ERROR: 'Error',
};
const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'var(--text-muted)', VALIDATED: '#f59e0b', SIGNED: 'var(--cyan)',
  TRANSMITTED: '#10b981', ERROR: '#ef4444',
};
const RISK_COLORS: Record<string, string> = { LOW: '#10b981', MEDIUM: '#f59e0b', HIGH: '#ef4444' };

export function AutoMVEPage() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<MVEDashboard | null>(null);
  const [mves, setMves] = useState<MVERecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mvePage, setMvePage] = useState(1);
  const [mveTotal, setMveTotal] = useState(0);
  const [selectedMve, setSelectedMve] = useState<MVERecord | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.mveDashboard();
      setDashboard(res.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMves = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const res = await api.mveList(page);
      setMves(res.data);
      setMveTotal(res.pagination.total);
      setMvePage(page);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'dashboard') loadDashboard();
    if (tab === 'manifestaciones' || tab === 'coves') loadMves();
  }, [tab, loadDashboard, loadMves]);

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminar esta MVE y sus COVEs asociados?')) return;
    try {
      await api.mveDelete(id);
      loadMves(mvePage);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  };

  const handleValidate = async (id: string) => {
    try {
      await api.mveValidate(id);
      loadMves(mvePage);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  };

  const handleSign = async (id: string) => {
    try {
      await api.mveSign(id);
      loadMves(mvePage);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  };

  const handleTransmit = async (id: string) => {
    try {
      await api.mveTransmit(id);
      loadMves(mvePage);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  };

  const tabs: { key: Tab; label: string; icon: typeof FileSignature }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: FileSignature },
    { key: 'manifestaciones', label: 'Manifestaciones', icon: FileText },
    { key: 'nueva', label: 'Nueva MVE', icon: Plus },
    { key: 'coves', label: 'COVEs', icon: CheckCircle },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
            <span style={{ color: 'var(--cyan)' }}>Auto</span> MVE
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Manifestacion de Valor Electronica con IA — Formato E2
          </p>
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

      {loading && !dashboard && tab !== 'nueva' ? (
        <div className="text-center py-20" style={{ color: 'var(--text-muted)' }}>
          <RefreshCw className="animate-spin mx-auto mb-3" size={24} />
          <p className="text-sm">Cargando...</p>
        </div>
      ) : (
        <>
          {tab === 'dashboard' && <DashboardTab dashboard={dashboard} />}
          {tab === 'manifestaciones' && <ManifestacionesTab mves={mves} page={mvePage} total={mveTotal} onPageChange={loadMves} onDelete={handleDelete} onValidate={handleValidate} onSign={handleSign} onTransmit={handleTransmit} onView={setSelectedMve} />}
          {tab === 'nueva' && <NuevaMVETab onCreated={() => { setTab('manifestaciones'); loadMves(); }} setError={setError} />}
          {tab === 'coves' && <COVEsTab mves={mves} />}
        </>
      )}

      {selectedMve && <MVEDetailModal mve={selectedMve} onClose={() => setSelectedMve(null)} />}
    </div>
  );
}

// ============================================
// Dashboard
// ============================================

function DashboardTab({ dashboard }: { dashboard: MVEDashboard | null }) {
  if (!dashboard) return null;

  const riskColor = dashboard.avgRiskScore <= 30 ? '#10b981' : dashboard.avgRiskScore <= 60 ? '#f59e0b' : '#ef4444';
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (dashboard.avgRiskScore / 100) * circumference;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl flex flex-col items-center justify-center" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
          <p className="text-xs uppercase mb-3" style={{ color: 'var(--text-dim)' }}>Riesgo promedio</p>
          <div className="relative w-28 h-28">
            <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="var(--bg-deep)" strokeWidth="8" />
              <circle cx="50" cy="50" r="45" fill="none" stroke={riskColor} strokeWidth="8"
                strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                strokeLinecap="round" className="transition-all duration-1000" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold font-mono" style={{ color: riskColor }}>{dashboard.avgRiskScore}</span>
              <span className="text-[10px] uppercase" style={{ color: 'var(--text-dim)' }}>Score</span>
            </div>
          </div>
          <div className="flex gap-3 mt-3">
            {(['LOW', 'MEDIUM', 'HIGH'] as const).map(level => (
              <div key={level} className="text-center">
                <p className="text-sm font-bold font-mono" style={{ color: RISK_COLORS[level] }}>{dashboard.riskCounts[level]}</p>
                <p className="text-[9px] uppercase" style={{ color: 'var(--text-dim)' }}>{level}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'Total MVEs', value: dashboard.total, icon: FileSignature, color: 'var(--cyan)' },
            { label: 'Pendientes', value: dashboard.pendingAction, icon: Clock, color: dashboard.pendingAction > 0 ? '#f59e0b' : 'var(--text-muted)' },
            { label: 'Transmitidas', value: dashboard.transmitted, icon: Send, color: '#10b981' },
            { label: 'Borradores', value: dashboard.draft, icon: FileText, color: 'var(--text-muted)' },
            { label: 'Firmadas', value: dashboard.signed, icon: PenTool, color: 'var(--cyan)' },
            { label: 'Valor total', value: `$${(dashboard.totalValueUSD / 1000).toFixed(0)}k`, icon: DollarSign, color: '#8b5cf6' },
          ].map((s, i) => (
            <div key={i} className="p-3 rounded-xl" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${s.color}15` }}>
                  <s.icon size={16} style={{ color: s.color }} />
                </div>
              </div>
              <p className="text-xl font-bold font-mono">{s.value}</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Manifestaciones Tab
// ============================================

function ManifestacionesTab({ mves, page, total, onPageChange, onDelete, onValidate, onSign, onTransmit, onView }: {
  mves: MVERecord[];
  page: number;
  total: number;
  onPageChange: (p: number) => void;
  onDelete: (id: string) => void;
  onValidate: (id: string) => void;
  onSign: (id: string) => void;
  onTransmit: (id: string) => void;
  onView: (mve: MVERecord) => void;
}) {
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-3">
      {mves.length === 0 ? (
        <div className="p-10 text-center rounded-xl" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          <FileSignature className="mx-auto mb-3 opacity-30" size={32} />
          <p className="text-sm">No hay manifestaciones de valor</p>
        </div>
      ) : (
        <>
          {mves.map((mve) => (
            <div key={mve.id} className="rounded-xl p-4" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${STATUS_COLORS[mve.status]}15`, color: STATUS_COLORS[mve.status] }}>
                      {STATUS_LABELS[mve.status] || mve.status}
                    </span>
                    {mve.riskLevel && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: `${RISK_COLORS[mve.riskLevel] || 'var(--text-muted)'}15`, color: RISK_COLORS[mve.riskLevel] || 'var(--text-muted)' }}>
                        Riesgo {mve.riskLevel}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium">{mve.providerName}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Factura {mve.invoiceNumber} | {mve.providerCountry} | {mve.incoterm}
                    {mve.pedimento ? ` | Ped: ${mve.pedimento}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono font-bold">${mve.customsValue.toLocaleString()}</p>
                  <p className="text-[10px]" style={{ color: 'var(--text-dim)' }}>{mve.currency} valor aduana</p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3 text-xs mb-3">
                <div><span style={{ color: 'var(--text-dim)' }}>Factura</span><p className="font-mono">${mve.invoiceValue.toLocaleString()}</p></div>
                <div><span style={{ color: 'var(--text-dim)' }}>Flete</span><p className="font-mono">${mve.freightValue.toLocaleString()}</p></div>
                <div><span style={{ color: 'var(--text-dim)' }}>Seguro</span><p className="font-mono">${mve.insuranceValue.toLocaleString()}</p></div>
                <div><span style={{ color: 'var(--text-dim)' }}>Fecha</span><p>{new Date(mve.invoiceDate).toLocaleDateString('es-MX')}</p></div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <button onClick={() => onView(mve)} className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1" style={{ background: 'rgba(6,182,212,0.1)', color: 'var(--cyan)', border: '1px solid rgba(6,182,212,0.2)' }}>
                  <Eye size={12} /> Ver E2
                </button>
                {mve.status === 'DRAFT' && (
                  <button onClick={() => onValidate(mve.id)} className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>
                    <Zap size={12} /> Validar IA
                  </button>
                )}
                {mve.status === 'VALIDATED' && (
                  <button onClick={() => onSign(mve.id)} className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1" style={{ background: 'rgba(6,182,212,0.1)', color: 'var(--cyan)', border: '1px solid rgba(6,182,212,0.2)' }}>
                    <PenTool size={12} /> Firmar
                  </button>
                )}
                {mve.status === 'SIGNED' && (
                  <button onClick={() => onTransmit(mve.id)} className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}>
                    <Send size={12} /> Transmitir
                  </button>
                )}
                {mve.status === 'DRAFT' && (
                  <button onClick={() => onDelete(mve.id)} className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1" style={{ color: 'var(--text-dim)', border: '1px solid var(--border)' }}>
                    <Trash2 size={12} /> Eliminar
                  </button>
                )}
              </div>
            </div>
          ))}

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
// Nueva MVE — Flujo de 3 pasos
// ============================================

function NuevaMVETab({ onCreated, setError }: { onCreated: () => void; setError: (e: string) => void }) {
  const [step, setStep] = useState(1);
  const [invoiceText, setInvoiceText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedInvoiceData | null>(null);
  const [form, setForm] = useState<CreateMVEInput>({
    providerName: '', providerCountry: '', invoiceNumber: '',
    invoiceDate: '', incoterm: 'FOB', currency: 'USD',
    invoiceValue: 0, freightValue: 0, insuranceValue: 0, otherIncrements: 0,
  });
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<MVEValidation | null>(null);
  const [creating, setCreating] = useState(false);

  const handleExtract = async () => {
    if (invoiceText.trim().length < 20) {
      setError('El texto de la factura debe tener al menos 20 caracteres');
      return;
    }
    setExtracting(true);
    try {
      const res = await api.mveExtractInvoice(invoiceText);
      const d = res.data;
      setExtracted(d);
      setForm({
        providerName: d.providerName || '',
        providerCountry: d.providerCountry || '',
        invoiceNumber: d.invoiceNumber || '',
        invoiceDate: d.invoiceDate || '',
        incoterm: d.incoterm || 'FOB',
        currency: d.currency || 'USD',
        invoiceValue: d.subtotal || d.totalValue || 0,
        freightValue: d.freight || 0,
        insuranceValue: d.insurance || 0,
        otherIncrements: d.otherCharges || 0,
      });
      setStep(2);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error extrayendo datos');
    } finally {
      setExtracting(false);
    }
  };

  const handleValidateAndCreate = async () => {
    setCreating(true);
    try {
      const res = await api.mveCreate(form);
      const mveId = res.data.id;

      // Auto-validate
      setValidating(true);
      try {
        const valRes = await api.mveValidate(mveId);
        setValidation(valRes.data);
      } catch {
        // Continue without validation
      }
      setValidating(false);

      setStep(3);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error creando MVE');
    } finally {
      setCreating(false);
    }
  };

  const set = (field: keyof CreateMVEInput, value: string | number | boolean) =>
    setForm(f => ({ ...f, [field]: value }));

  const customsValue = (form.invoiceValue || 0) + (form.freightValue || 0) + (form.insuranceValue || 0) + (form.otherIncrements || 0);

  return (
    <div className="space-y-6">
      {/* Steps indicator */}
      <div className="flex items-center justify-center gap-2">
        {[1, 2, 3].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{
              background: step >= s ? 'var(--cyan)' : 'var(--bg-deep)',
              color: step >= s ? 'var(--bg-deep)' : 'var(--text-muted)',
            }}>{s}</div>
            {s < 3 && <div className="w-12 h-0.5 rounded" style={{ background: step > s ? 'var(--cyan)' : 'var(--bg-deep)' }} />}
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-8 text-xs" style={{ color: 'var(--text-dim)' }}>
        <span>Pegar factura</span>
        <span>Revisar datos</span>
        <span>Validar y generar</span>
      </div>

      {/* Step 1: Paste invoice */}
      {step === 1 && (
        <div className="rounded-xl p-6" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
          <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <Zap size={16} style={{ color: 'var(--cyan)' }} />
            Paso 1: Pega el texto de tu factura comercial
          </h3>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            Copia y pega el contenido de la factura de tu proveedor. La IA extraera automaticamente todos los datos necesarios para la Manifestacion de Valor.
          </p>
          <textarea
            value={invoiceText}
            onChange={e => setInvoiceText(e.target.value)}
            rows={14}
            placeholder="Pega aqui el texto de tu factura comercial...&#10;&#10;Ejemplo:&#10;INVOICE #INV-2026-0451&#10;Date: March 15, 2026&#10;From: Acme Electronics Inc.&#10;123 Industrial Blvd, Shenzhen, China&#10;&#10;To: Empresa IMMEX SA de CV&#10;&#10;Item: Laptop Motherboards Model X500&#10;Qty: 500 pcs&#10;Unit Price: $45.00 USD&#10;Total: $22,500.00 USD&#10;&#10;Incoterm: FOB Shenzhen&#10;Payment: Net 30 days"
            className="w-full p-4 rounded-xl text-sm leading-relaxed resize-none"
            style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
          />
          <div className="flex justify-between items-center mt-4">
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{invoiceText.length} caracteres</span>
            <button onClick={handleExtract} disabled={extracting || invoiceText.length < 20}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{ background: extracting ? 'var(--bg-deep)' : 'var(--cyan)', color: extracting ? 'var(--text-muted)' : 'var(--bg-deep)', opacity: invoiceText.length < 20 ? 0.5 : 1 }}>
              {extracting ? <><RefreshCw className="animate-spin" size={16} /> Leyendo factura...</> : <><Zap size={16} /> Extraer con IA</>}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Review extracted data */}
      {step === 2 && (
        <div className="rounded-xl p-6" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
          <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <FileText size={16} style={{ color: 'var(--cyan)' }} />
            Paso 2: Revisa y corrige los datos extraidos
          </h3>

          {extracted?.notes && (
            <div className="p-3 rounded-lg mb-4 text-xs" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', color: '#f59e0b' }}>
              <AlertTriangle size={12} className="inline mr-1" /> IA: {extracted.notes}
            </div>
          )}

          {extracted?.items && extracted.items.length > 0 && (
            <div className="mb-4 p-3 rounded-lg" style={{ background: 'var(--bg-deep)' }}>
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-dim)' }}>Productos detectados</p>
              {extracted.items.map((item, i) => (
                <div key={i} className="flex justify-between text-xs py-1" style={{ borderBottom: i < extracted.items.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{item.description}</span>
                  <span className="font-mono">{item.quantity} x ${item.unitPrice} = ${item.totalPrice.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Proveedor *</label>
              <input required value={form.providerName} onChange={e => set('providerName', e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Pais proveedor *</label>
              <input required value={form.providerCountry} onChange={e => set('providerCountry', e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>No. factura *</label>
              <input required value={form.invoiceNumber} onChange={e => set('invoiceNumber', e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Fecha factura *</label>
              <input required type="date" value={form.invoiceDate} onChange={e => set('invoiceDate', e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Incoterm</label>
              <select value={form.incoterm} onChange={e => set('incoterm', e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                {['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'].map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Moneda</label>
              <select value={form.currency} onChange={e => set('currency', e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                {['USD', 'EUR', 'CNY', 'JPY', 'GBP', 'CAD', 'MXN'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Valor factura *</label>
              <input required type="number" step="any" min="0" value={form.invoiceValue || ''} onChange={e => set('invoiceValue', Number(e.target.value))} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Flete</label>
              <input type="number" step="any" min="0" value={form.freightValue || ''} onChange={e => set('freightValue', Number(e.target.value))} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Seguro</label>
              <input type="number" step="any" min="0" value={form.insuranceValue || ''} onChange={e => set('insuranceValue', Number(e.target.value))} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Otros</label>
              <input type="number" step="any" min="0" value={form.otherIncrements || ''} onChange={e => set('otherIncrements', Number(e.target.value))} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
          </div>

          <div className="mt-4 p-3 rounded-lg flex items-center justify-between" style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.15)' }}>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Valor en aduana calculado:</span>
            <span className="text-lg font-mono font-bold" style={{ color: 'var(--cyan)' }}>${customsValue.toLocaleString('en-US', { minimumFractionDigits: 2 })} {form.currency}</span>
          </div>

          <div className="mt-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.hasVinculacion || false} onChange={e => set('hasVinculacion', e.target.checked)} className="rounded" />
              <span style={{ color: 'var(--text-secondary)' }}>Existe vinculacion entre importador y proveedor</span>
            </label>
          </div>

          <div className="flex justify-between mt-6">
            <button onClick={() => setStep(1)} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
              Regresar
            </button>
            <button onClick={handleValidateAndCreate} disabled={creating || !form.providerName || !form.invoiceNumber}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium"
              style={{ background: creating ? 'var(--bg-deep)' : 'var(--cyan)', color: creating ? 'var(--text-muted)' : 'var(--bg-deep)' }}>
              {creating ? <><RefreshCw className="animate-spin" size={16} /> Generando E2...</> : <><FileSignature size={16} /> Generar E2 y validar</>}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Validation results */}
      {step === 3 && (
        <div className="rounded-xl p-6" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
          <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <CheckCircle size={16} style={{ color: '#10b981' }} />
            Paso 3: MVE generada — Validacion IA
          </h3>

          {validating ? (
            <div className="text-center py-8">
              <RefreshCw className="animate-spin mx-auto mb-3" size={24} style={{ color: 'var(--cyan)' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Validando con IA...</p>
            </div>
          ) : validation ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-sm font-medium">Nivel de riesgo:</span>
                <span className="text-sm font-bold px-3 py-1 rounded-lg" style={{ background: `${RISK_COLORS[validation.riskLevel] || 'var(--text-muted)'}15`, color: RISK_COLORS[validation.riskLevel] || 'var(--text-muted)' }}>
                  {validation.riskLevel}
                </span>
              </div>

              {validation.summary && (
                <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(6,182,212,0.05)', border: '1px solid rgba(6,182,212,0.15)', color: 'var(--text-secondary)' }}>
                  {validation.summary}
                </div>
              )}

              {validation.warnings.length > 0 && (
                <div className="space-y-2">
                  {validation.warnings.map((w, i) => (
                    <div key={i} className="p-3 rounded-lg flex gap-3" style={{
                      background: `${w.severity === 'critical' || w.severity === 'high' ? 'rgba(239,68,68,0.06)' : 'rgba(245,158,11,0.06)'}`,
                      border: `1px solid ${w.severity === 'critical' || w.severity === 'high' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`,
                    }}>
                      <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" style={{ color: w.severity === 'critical' || w.severity === 'high' ? '#ef4444' : '#f59e0b' }} />
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-deep)', color: w.severity === 'critical' || w.severity === 'high' ? '#ef4444' : '#f59e0b' }}>{w.severity}</span>
                          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{w.category}</span>
                        </div>
                        <p className="text-sm">{w.message}</p>
                        <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--cyan)' }}>
                          <ChevronRight size={10} /> {w.recommendation}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {validation.warnings.length === 0 && (
                <div className="p-4 rounded-lg text-center" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
                  <CheckCircle className="mx-auto mb-2" size={24} style={{ color: '#10b981' }} />
                  <p className="text-sm font-medium" style={{ color: '#10b981' }}>Sin alertas detectadas</p>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 rounded-lg text-center" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
              <CheckCircle className="mx-auto mb-2" size={24} style={{ color: '#10b981' }} />
              <p className="text-sm font-medium" style={{ color: '#10b981' }}>MVE generada exitosamente</p>
            </div>
          )}

          <div className="flex justify-center mt-6">
            <button onClick={onCreated} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium" style={{ background: 'var(--cyan)', color: 'var(--bg-deep)' }}>
              <CheckCircle size={16} /> Ver mis manifestaciones
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// COVEs Tab
// ============================================

function COVEsTab({ mves }: { mves: MVERecord[] }) {
  const allCoves = mves.flatMap(m => (m.coves || []).map(c => ({ ...c, mve: m })));

  return (
    <div className="space-y-4">
      {allCoves.length === 0 ? (
        <div className="p-10 text-center rounded-xl" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          <CheckCircle className="mx-auto mb-3 opacity-30" size={32} />
          <p className="text-sm">No hay COVEs registrados</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>Los COVEs se registran desde el detalle de cada MVE</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="text-left p-3 text-xs font-medium" style={{ color: 'var(--text-dim)' }}>e-Document</th>
                <th className="text-left p-3 text-xs font-medium" style={{ color: 'var(--text-dim)' }}>Factura</th>
                <th className="text-left p-3 text-xs font-medium hidden sm:table-cell" style={{ color: 'var(--text-dim)' }}>MVE</th>
                <th className="text-left p-3 text-xs font-medium" style={{ color: 'var(--text-dim)' }}>Valor</th>
                <th className="text-left p-3 text-xs font-medium" style={{ color: 'var(--text-dim)' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {allCoves.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="p-3 font-mono text-xs">{c.eDocument}</td>
                  <td className="p-3 text-xs">{c.invoiceNumber}</td>
                  <td className="p-3 text-xs hidden sm:table-cell" style={{ color: 'var(--text-muted)' }}>{(c as unknown as { mve: MVERecord }).mve.providerName}</td>
                  <td className="p-3 font-mono text-xs">${c.value.toLocaleString()} {c.currency}</td>
                  <td className="p-3">
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: c.validated ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', color: c.validated ? '#10b981' : '#f59e0b' }}>
                      {c.validated ? 'Validado' : 'Pendiente'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================
// MVE Detail Modal
// ============================================

function MVEDetailModal({ mve, onClose }: { mve: MVERecord; onClose: () => void }) {
  const [e2Text, setE2Text] = useState<string | null>(null);

  useEffect(() => {
    api.mvePdf(mve.id).then(res => setE2Text(res.data.text)).catch(() => {});
  }, [mve.id]);

  const validation = mve.aiValidation as MVEValidation | null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-2xl rounded-2xl p-6 max-h-[90vh] overflow-y-auto" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-lg">Formato E2 — {mve.providerName}</h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Factura {mve.invoiceNumber} | {mve.currency} {mve.customsValue.toLocaleString()}</p>
          </div>
          <button onClick={onClose}><X size={20} style={{ color: 'var(--text-muted)' }} /></button>
        </div>

        <div className="flex gap-2 mb-4">
          <span className="text-xs px-2 py-1 rounded-lg" style={{ background: `${STATUS_COLORS[mve.status]}15`, color: STATUS_COLORS[mve.status] }}>
            {STATUS_LABELS[mve.status]}
          </span>
          {mve.riskLevel && (
            <span className="text-xs px-2 py-1 rounded-lg" style={{ background: `${RISK_COLORS[mve.riskLevel] || 'var(--text-muted)'}15`, color: RISK_COLORS[mve.riskLevel] || 'var(--text-muted)' }}>
              Riesgo {mve.riskLevel}
            </span>
          )}
        </div>

        {/* Validation warnings */}
        {validation && validation.warnings && validation.warnings.length > 0 && (
          <div className="mb-4 space-y-2">
            <p className="text-xs font-medium" style={{ color: 'var(--text-dim)' }}>Alertas de validacion IA</p>
            {validation.warnings.map((w, i) => (
              <div key={i} className="p-2 rounded-lg text-xs flex gap-2" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
                <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" style={{ color: '#f59e0b' }} />
                <div>
                  <p className="font-medium">{w.message}</p>
                  <p style={{ color: 'var(--text-muted)' }}>{w.recommendation}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* E2 text */}
        {e2Text ? (
          <pre className="p-4 rounded-xl text-xs leading-relaxed overflow-x-auto whitespace-pre" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            {e2Text}
          </pre>
        ) : (
          <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
            <RefreshCw className="animate-spin mx-auto mb-2" size={16} />
            <p className="text-xs">Cargando formato E2...</p>
          </div>
        )}

        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
