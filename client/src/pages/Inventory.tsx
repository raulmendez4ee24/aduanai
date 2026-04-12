import { useState, useEffect, useCallback } from 'react';
import {
  Warehouse, Plus, ArrowDownUp, AlertTriangle, FileText, Clock,
  ChevronDown, ChevronRight, Trash2, Package, TrendingDown,
  ShieldAlert, DollarSign, X, RefreshCw, Download,
} from 'lucide-react';
import { api } from '../lib/api';
import type {
  InventoryStats, InventoryBalance, TemporaryImportRecord,
  DischargeRecord, InconsistencyReport, Annex24ReportRecord,
  Annex30AccountRecord, CreateImportInput, CreateDischargeInput,
} from '../lib/api';

type Tab = 'dashboard' | 'imports' | 'discharges' | 'reports';

const DISCHARGE_TYPES = [
  { value: 'RETURN_EXPORT', label: 'Retorno al extranjero' },
  { value: 'DOMESTIC_SALE', label: 'Venta nacional' },
  { value: 'REGIME_CHANGE', label: 'Cambio de regimen' },
  { value: 'WASTE', label: 'Desperdicio' },
  { value: 'SCRAP', label: 'Merma' },
  { value: 'DESTRUCTION', label: 'Destruccion' },
  { value: 'DONATION', label: 'Donacion' },
  { value: 'TRANSFER', label: 'Transferencia virtual' },
];

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Activa',
  PARTIALLY_DISCHARGED: 'Parcial',
  FULLY_DISCHARGED: 'Descargada',
  EXPIRED: 'Vencida',
  REGULARIZED: 'Regularizada',
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'var(--cyan)',
  PARTIALLY_DISCHARGED: '#f59e0b',
  FULLY_DISCHARGED: '#10b981',
  EXPIRED: '#ef4444',
  REGULARIZED: '#8b5cf6',
};

export function InventoryPage() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [imports, setImports] = useState<TemporaryImportRecord[]>([]);
  const [discharges, setDischarges] = useState<DischargeRecord[]>([]);
  const [inconsistencies, setInconsistencies] = useState<InconsistencyReport | null>(null);
  const [annex24Reports, setAnnex24Reports] = useState<Annex24ReportRecord[]>([]);
  const [annex30, setAnnex30] = useState<Annex30AccountRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingInconsistencies, setLoadingInconsistencies] = useState(false);
  const [showImportForm, setShowImportForm] = useState(false);
  const [showDischargeForm, setShowDischargeForm] = useState(false);
  const [selectedImport, setSelectedImport] = useState<TemporaryImportRecord | null>(null);
  const [expandedBalance, setExpandedBalance] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [importPage, setImportPage] = useState(1);
  const [importTotal, setImportTotal] = useState(0);
  const [dischargePage, setDischargePage] = useState(1);
  const [dischargeTotal, setDischargeTotal] = useState(0);

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const [statsRes, balRes] = await Promise.all([
        api.inventoryStats(),
        api.inventoryBalances(),
      ]);
      setStats(statsRes.data);
      setBalances(balRes.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error cargando datos');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadImports = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const res = await api.inventoryImports(page);
      setImports(res.data);
      setImportTotal(res.pagination.total);
      setImportPage(page);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDischarges = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const res = await api.inventoryDischarges(page);
      setDischarges(res.data);
      setDischargeTotal(res.pagination.total);
      setDischargePage(page);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      const [a24, a30] = await Promise.all([
        api.inventoryAnnex24Reports(),
        api.inventoryAnnex30Account(),
      ]);
      setAnnex24Reports(a24.data);
      setAnnex30(a30.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadInconsistencies = useCallback(async () => {
    try {
      setLoadingInconsistencies(true);
      const res = await api.inventoryInconsistencies();
      setInconsistencies(res.data);
    } catch {
      // silently fail
    } finally {
      setLoadingInconsistencies(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'dashboard') { loadDashboard(); loadInconsistencies(); }
    if (tab === 'imports') loadImports();
    if (tab === 'discharges') loadDischarges();
    if (tab === 'reports') loadReports();
  }, [tab, loadDashboard, loadImports, loadDischarges, loadReports, loadInconsistencies]);

  const handleCreateImport = async (data: CreateImportInput) => {
    try {
      await api.inventoryImportCreate(data);
      setShowImportForm(false);
      if (tab === 'imports') loadImports();
      else loadDashboard();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error creando importacion');
    }
  };

  const handleCreateDischarge = async (data: CreateDischargeInput) => {
    try {
      await api.inventoryDischargeCreate(data);
      setShowDischargeForm(false);
      setSelectedImport(null);
      if (tab === 'discharges') loadDischarges();
      else if (tab === 'imports') loadImports();
      else loadDashboard();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error creando descargo');
    }
  };

  const handleDeleteImport = async (id: string) => {
    if (!confirm('Eliminar esta importacion temporal?')) return;
    try {
      await api.inventoryImportDelete(id);
      loadImports();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  };

  const handleDeleteDischarge = async (id: string) => {
    if (!confirm('Eliminar este descargo? Se revertira la cantidad en la importacion.')) return;
    try {
      await api.inventoryDischargeDelete(id);
      loadDischarges();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  };

  const handleGenerateAnnex24 = async () => {
    const now = new Date();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    const year = now.getFullYear();
    const periodStart = new Date(year, (quarter - 1) * 3, 1);
    const periodEnd = new Date(year, quarter * 3, 0);

    try {
      await api.inventoryAnnex24Generate({
        period: `${year}-Q${quarter}`,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
      });
      loadReports();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error generando reporte');
    }
  };

  const tabs: { key: Tab; label: string; icon: typeof Warehouse }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: Warehouse },
    { key: 'imports', label: 'Importaciones', icon: Package },
    { key: 'discharges', label: 'Descargos', icon: ArrowDownUp },
    { key: 'reports', label: 'Reportes', icon: FileText },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
            <span style={{ color: 'var(--cyan)' }}>Inventario</span> IMMEX
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Control de importaciones temporales - Anexo 24 / 30
          </p>
        </div>
        <div className="flex gap-2">
          {tab === 'imports' && (
            <button onClick={() => setShowImportForm(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium" style={{ background: 'var(--cyan)', color: 'var(--bg-deep)' }}>
              <Plus size={16} /> Nueva importacion
            </button>
          )}
          {tab === 'discharges' && (
            <button onClick={() => { setSelectedImport(null); setShowDischargeForm(true); }} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium" style={{ background: 'var(--cyan)', color: 'var(--bg-deep)' }}>
              <Plus size={16} /> Nuevo descargo
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 rounded-xl flex items-center justify-between" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <span className="text-sm" style={{ color: '#ef4444' }}>{error}</span>
          <button onClick={() => setError('')}><X size={16} style={{ color: '#ef4444' }} /></button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium flex-1 justify-center transition-all"
            style={{
              background: tab === t.key ? 'var(--cyan-glow)' : 'transparent',
              color: tab === t.key ? 'var(--cyan)' : 'var(--text-muted)',
              border: tab === t.key ? '1px solid rgba(6,182,212,0.15)' : '1px solid transparent',
            }}>
            <t.icon size={16} /><span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && !stats ? (
        <div className="text-center py-20" style={{ color: 'var(--text-muted)' }}>
          <RefreshCw className="animate-spin mx-auto mb-3" size={24} />
          <p className="text-sm">Cargando inventario...</p>
        </div>
      ) : (
        <>
          {tab === 'dashboard' && <DashboardTab stats={stats} balances={balances} inconsistencies={inconsistencies} loadingInconsistencies={loadingInconsistencies} expandedBalance={expandedBalance} setExpandedBalance={setExpandedBalance} onDischarge={(imp) => { setSelectedImport(imp as unknown as TemporaryImportRecord); setShowDischargeForm(true); }} />}
          {tab === 'imports' && <ImportsTab imports={imports} page={importPage} total={importTotal} onPageChange={loadImports} onDelete={handleDeleteImport} onDischarge={(imp) => { setSelectedImport(imp); setShowDischargeForm(true); }} />}
          {tab === 'discharges' && <DischargesTab discharges={discharges} page={dischargePage} total={dischargeTotal} onPageChange={loadDischarges} onDelete={handleDeleteDischarge} />}
          {tab === 'reports' && <ReportsTab annex24Reports={annex24Reports} annex30={annex30} onGenerate={handleGenerateAnnex24} />}
        </>
      )}

      {/* Modals */}
      {showImportForm && <ImportFormModal onClose={() => setShowImportForm(false)} onSubmit={handleCreateImport} />}
      {showDischargeForm && <DischargeFormModal onClose={() => { setShowDischargeForm(false); setSelectedImport(null); }} onSubmit={handleCreateDischarge} preselectedImport={selectedImport} />}
    </div>
  );
}

// ============================================
// Dashboard Tab
// ============================================

function DashboardTab({ stats, balances, inconsistencies, loadingInconsistencies, expandedBalance, setExpandedBalance, onDischarge }: {
  stats: InventoryStats | null;
  balances: InventoryBalance[];
  inconsistencies: InconsistencyReport | null;
  loadingInconsistencies: boolean;
  expandedBalance: string | null;
  setExpandedBalance: (v: string | null) => void;
  onDischarge: (b: InventoryBalance) => void;
}) {
  if (!stats) return null;

  const statCards = [
    { label: 'Importaciones activas', value: stats.activeImports, icon: Package, color: 'var(--cyan)' },
    { label: 'Total descargos', value: stats.totalDischarges, icon: ArrowDownUp, color: '#10b981' },
    { label: 'Vencen en 90 dias', value: stats.expiringIn90Days, icon: Clock, color: stats.expiringIn90Days > 0 ? '#ef4444' : '#f59e0b' },
    { label: 'Valor activo USD', value: `$${stats.totalValueActive.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, icon: DollarSign, color: '#8b5cf6' },
  ];

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s, i) => (
          <div key={i} className="p-4 rounded-xl" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${s.color}15` }}>
                <s.icon size={18} style={{ color: s.color }} />
              </div>
            </div>
            <p className="text-2xl font-bold" style={{ fontFamily: 'var(--font-mono)' }}>{s.value}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Inconsistencias IA */}
      {(loadingInconsistencies || (inconsistencies && inconsistencies.total > 0)) && (
        <div className="rounded-xl p-5" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert size={18} style={{ color: '#ef4444' }} />
            <h3 className="font-semibold text-sm">Deteccion de inconsistencias con IA</h3>
            {loadingInconsistencies && <RefreshCw className="animate-spin ml-2" size={14} style={{ color: 'var(--text-muted)' }} />}
          </div>

          {inconsistencies?.aiSummary && (
            <div className="p-3 rounded-lg mb-4 text-sm leading-relaxed" style={{ background: 'rgba(6,182,212,0.05)', border: '1px solid rgba(6,182,212,0.15)', color: 'var(--text-secondary)' }}>
              {inconsistencies.aiSummary}
            </div>
          )}

          <div className="space-y-2">
            {inconsistencies?.issues.map((issue, i) => (
              <div key={i} className="p-3 rounded-lg flex gap-3" style={{
                background: issue.severity === 'critical' ? 'rgba(239,68,68,0.06)' : issue.severity === 'warning' ? 'rgba(245,158,11,0.06)' : 'rgba(6,182,212,0.06)',
                border: `1px solid ${issue.severity === 'critical' ? 'rgba(239,68,68,0.2)' : issue.severity === 'warning' ? 'rgba(245,158,11,0.2)' : 'rgba(6,182,212,0.2)'}`,
              }}>
                <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" style={{
                  color: issue.severity === 'critical' ? '#ef4444' : issue.severity === 'warning' ? '#f59e0b' : 'var(--cyan)',
                }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-deep)', color: 'var(--cyan)' }}>{issue.fractionCode}</span>
                    <span className="text-sm font-medium">{issue.message}</span>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{issue.detail}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{issue.recommendation}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Saldos por fraccion */}
      <div className="rounded-xl" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
        <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <TrendingDown size={16} style={{ color: 'var(--cyan)' }} />
            Saldos por fraccion arancelaria
          </h3>
          <span className="text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--bg-deep)', color: 'var(--text-muted)' }}>
            {balances.length} fracciones activas
          </span>
        </div>

        {balances.length === 0 ? (
          <div className="p-10 text-center" style={{ color: 'var(--text-muted)' }}>
            <Warehouse className="mx-auto mb-3 opacity-30" size={32} />
            <p className="text-sm">No hay importaciones temporales registradas</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {balances.map((b) => {
              const pct = b.totalImported > 0 ? (b.totalDischarged / b.totalImported) * 100 : 0;
              const isExpanded = expandedBalance === b.fractionCode;
              const isUrgent = b.daysRemaining !== null && b.daysRemaining <= 30;
              const isWarning = b.daysRemaining !== null && b.daysRemaining <= 90 && b.daysRemaining > 30;

              return (
                <div key={b.fractionCode}>
                  <button onClick={() => setExpandedBalance(isExpanded ? null : b.fractionCode)} className="w-full p-4 flex items-center gap-4 text-left transition-colors hover:brightness-110">
                    {isExpanded ? <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm font-bold" style={{ color: 'var(--cyan)' }}>{b.fractionCode}</span>
                        {isUrgent && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>URGENTE</span>}
                        {isWarning && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>ATENCION</span>}
                      </div>
                      <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{b.description}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-mono font-bold">{b.balance.toLocaleString()} <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>{b.unit}</span></p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {b.daysRemaining !== null ? `${b.daysRemaining} dias` : '-'}
                      </p>
                    </div>
                    <div className="w-24 flex-shrink-0 hidden sm:block">
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-deep)' }}>
                        <div className="h-full rounded-full transition-all" style={{
                          width: `${Math.min(100, pct)}%`,
                          background: pct >= 100 ? '#10b981' : pct >= 50 ? '#f59e0b' : 'var(--cyan)',
                        }} />
                      </div>
                      <p className="text-[10px] mt-1 text-right" style={{ color: 'var(--text-dim)' }}>{pct.toFixed(0)}% descargado</p>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 pl-10 grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-2 rounded-lg" style={{ background: 'var(--bg-deep)' }}>
                        <p className="text-[10px] uppercase" style={{ color: 'var(--text-dim)' }}>Importado</p>
                        <p className="text-sm font-mono font-bold">{b.totalImported.toLocaleString()} {b.unit}</p>
                      </div>
                      <div className="p-2 rounded-lg" style={{ background: 'var(--bg-deep)' }}>
                        <p className="text-[10px] uppercase" style={{ color: 'var(--text-dim)' }}>Descargado</p>
                        <p className="text-sm font-mono font-bold">{b.totalDischarged.toLocaleString()} {b.unit}</p>
                      </div>
                      <div className="p-2 rounded-lg" style={{ background: 'var(--bg-deep)' }}>
                        <p className="text-[10px] uppercase" style={{ color: 'var(--text-dim)' }}>Valor activo</p>
                        <p className="text-sm font-mono font-bold">${b.totalValueUSD.toLocaleString()}</p>
                      </div>
                      <div className="p-2 rounded-lg" style={{ background: 'var(--bg-deep)' }}>
                        <p className="text-[10px] uppercase" style={{ color: 'var(--text-dim)' }}>Pedimentos</p>
                        <p className="text-sm font-mono font-bold">{b.importCount}</p>
                      </div>
                      <div className="col-span-2 sm:col-span-4 flex justify-end">
                        <button onClick={(e) => { e.stopPropagation(); onDischarge(b); }} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(6,182,212,0.1)', color: 'var(--cyan)', border: '1px solid rgba(6,182,212,0.2)' }}>
                          + Registrar descargo
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Imports Tab
// ============================================

function ImportsTab({ imports, page, total, onPageChange, onDelete, onDischarge }: {
  imports: TemporaryImportRecord[];
  page: number;
  total: number;
  onPageChange: (p: number) => void;
  onDelete: (id: string) => void;
  onDischarge: (imp: TemporaryImportRecord) => void;
}) {
  const totalPages = Math.ceil(total / 20);
  const now = new Date();

  return (
    <div className="space-y-4">
      {imports.length === 0 ? (
        <div className="p-10 text-center rounded-xl" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          <Package className="mx-auto mb-3 opacity-30" size={32} />
          <p className="text-sm">No hay importaciones temporales registradas</p>
        </div>
      ) : (
        <>
          {imports.map((imp) => {
            const daysLeft = Math.ceil((new Date(imp.expirationDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            const available = imp.quantity - imp.quantityDischarged;
            const pct = imp.quantity > 0 ? (imp.quantityDischarged / imp.quantity) * 100 : 0;

            return (
              <div key={imp.id} className="rounded-xl p-4" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-bold" style={{ color: 'var(--cyan)' }}>{imp.fractionCode}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${STATUS_COLORS[imp.status] || 'var(--cyan)'}15`, color: STATUS_COLORS[imp.status] || 'var(--cyan)' }}>
                        {STATUS_LABELS[imp.status] || imp.status}
                      </span>
                    </div>
                    <p className="text-sm font-medium">{imp.description || 'Sin descripcion'}</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      Pedimento: {imp.pedimento} | {imp.supplier || 'Sin proveedor'} | {imp.originCountry || '-'}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {available > 0 && (
                      <button onClick={() => onDischarge(imp)} className="p-2 rounded-lg transition-colors" style={{ color: 'var(--cyan)' }} title="Registrar descargo">
                        <ArrowDownUp size={16} />
                      </button>
                    )}
                    <button onClick={() => onDelete(imp.id)} className="p-2 rounded-lg transition-colors" style={{ color: 'var(--text-dim)' }} title="Eliminar">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                  <div>
                    <span style={{ color: 'var(--text-dim)' }}>Cantidad</span>
                    <p className="font-mono font-bold">{imp.quantity.toLocaleString()} {imp.unit}</p>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-dim)' }}>Disponible</span>
                    <p className="font-mono font-bold">{available.toLocaleString()} {imp.unit}</p>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-dim)' }}>Valor USD</span>
                    <p className="font-mono font-bold">${imp.customsValue.toLocaleString()}</p>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-dim)' }}>Entrada</span>
                    <p className="font-mono">{new Date(imp.entryDate).toLocaleDateString('es-MX')}</p>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-dim)' }}>Vencimiento</span>
                    <p className="font-mono" style={{ color: daysLeft <= 30 ? '#ef4444' : daysLeft <= 90 ? '#f59e0b' : 'inherit' }}>
                      {new Date(imp.expirationDate).toLocaleDateString('es-MX')} ({daysLeft}d)
                    </p>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-deep)' }}>
                    <div className="h-full rounded-full" style={{
                      width: `${Math.min(100, pct)}%`,
                      background: pct >= 100 ? '#10b981' : pct >= 50 ? '#f59e0b' : 'var(--cyan)',
                    }} />
                  </div>
                  <p className="text-[10px] mt-1 text-right" style={{ color: 'var(--text-dim)' }}>{pct.toFixed(1)}% descargado</p>
                </div>
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
// Discharges Tab
// ============================================

function DischargesTab({ discharges, page, total, onPageChange, onDelete }: {
  discharges: DischargeRecord[];
  page: number;
  total: number;
  onPageChange: (p: number) => void;
  onDelete: (id: string) => void;
}) {
  const totalPages = Math.ceil(total / 20);
  const typeLabels: Record<string, string> = Object.fromEntries(DISCHARGE_TYPES.map(d => [d.value, d.label]));

  return (
    <div className="space-y-4">
      {discharges.length === 0 ? (
        <div className="p-10 text-center rounded-xl" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          <ArrowDownUp className="mx-auto mb-3 opacity-30" size={32} />
          <p className="text-sm">No hay descargos registrados</p>
        </div>
      ) : (
        <>
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th className="text-left p-3 text-xs font-medium" style={{ color: 'var(--text-dim)' }}>Tipo</th>
                  <th className="text-left p-3 text-xs font-medium hidden sm:table-cell" style={{ color: 'var(--text-dim)' }}>Importacion origen</th>
                  <th className="text-left p-3 text-xs font-medium" style={{ color: 'var(--text-dim)' }}>Cantidad</th>
                  <th className="text-left p-3 text-xs font-medium hidden sm:table-cell" style={{ color: 'var(--text-dim)' }}>Pedimento</th>
                  <th className="text-left p-3 text-xs font-medium" style={{ color: 'var(--text-dim)' }}>Fecha</th>
                  <th className="p-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {discharges.map((d) => (
                  <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="p-3">
                      <span className="text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--bg-deep)', color: 'var(--cyan)' }}>
                        {typeLabels[d.type] || d.type}
                      </span>
                    </td>
                    <td className="p-3 hidden sm:table-cell">
                      <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                        {d.temporaryImport?.pedimento || '-'}
                      </span>
                    </td>
                    <td className="p-3 font-mono">{d.quantity.toLocaleString()} {d.unit}</td>
                    <td className="p-3 font-mono text-xs hidden sm:table-cell" style={{ color: 'var(--text-muted)' }}>{d.pedimento || 'S/N'}</td>
                    <td className="p-3 text-xs" style={{ color: 'var(--text-muted)' }}>{new Date(d.dischargeDate).toLocaleDateString('es-MX')}</td>
                    <td className="p-3">
                      <button onClick={() => onDelete(d.id)} className="p-1 rounded" style={{ color: 'var(--text-dim)' }}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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
// Reports Tab
// ============================================

function ReportsTab({ annex24Reports, annex30, onGenerate }: {
  annex24Reports: Annex24ReportRecord[];
  annex30: Annex30AccountRecord | null;
  onGenerate: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* Anexo 30 */}
      {annex30 && (
        <div className="rounded-xl p-5" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
          <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <DollarSign size={16} style={{ color: '#8b5cf6' }} />
            Anexo 30 - Estado de cuenta de creditos fiscales
            <span className="text-xs px-2 py-0.5 rounded-lg ml-auto" style={{ background: 'var(--bg-deep)', color: 'var(--text-muted)' }}>{annex30.period}</span>
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-3 rounded-lg" style={{ background: 'var(--bg-deep)' }}>
              <p className="text-[10px] uppercase" style={{ color: 'var(--text-dim)' }}>IGI diferido</p>
              <p className="text-lg font-mono font-bold" style={{ color: 'var(--cyan)' }}>${annex30.igiDeferred.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
            </div>
            <div className="p-3 rounded-lg" style={{ background: 'var(--bg-deep)' }}>
              <p className="text-[10px] uppercase" style={{ color: 'var(--text-dim)' }}>DTA diferido</p>
              <p className="text-lg font-mono font-bold" style={{ color: '#f59e0b' }}>${annex30.dtaDeferred.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
            </div>
            <div className="p-3 rounded-lg" style={{ background: 'var(--bg-deep)' }}>
              <p className="text-[10px] uppercase" style={{ color: 'var(--text-dim)' }}>IVA diferido</p>
              <p className="text-lg font-mono font-bold" style={{ color: '#10b981' }}>${annex30.ivaDeferred.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
            </div>
            <div className="p-3 rounded-lg" style={{ background: 'var(--bg-deep)' }}>
              <p className="text-[10px] uppercase" style={{ color: 'var(--text-dim)' }}>Saldo total</p>
              <p className="text-lg font-mono font-bold" style={{ color: '#8b5cf6' }}>${annex30.balance.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div className="p-3 rounded-lg" style={{ background: 'var(--bg-deep)' }}>
              <p className="text-[10px] uppercase" style={{ color: 'var(--text-dim)' }}>Total creditos</p>
              <p className="text-sm font-mono">${annex30.totalCredits.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
            </div>
            <div className="p-3 rounded-lg" style={{ background: 'var(--bg-deep)' }}>
              <p className="text-[10px] uppercase" style={{ color: 'var(--text-dim)' }}>Garantias</p>
              <p className="text-sm font-mono">${annex30.totalGuarantees.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
            </div>
            <div className="p-3 rounded-lg" style={{ background: 'var(--bg-deep)' }}>
              <p className="text-[10px] uppercase" style={{ color: 'var(--text-dim)' }}>Pagos realizados</p>
              <p className="text-sm font-mono">${annex30.totalDebits.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
            </div>
          </div>
        </div>
      )}

      {/* Anexo 24 */}
      <div className="rounded-xl" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
        <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <FileText size={16} style={{ color: 'var(--cyan)' }} />
            Anexo 24 - Reportes de inventario
          </h3>
          <button onClick={onGenerate} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'var(--cyan)', color: 'var(--bg-deep)' }}>
            <Download size={14} /> Generar trimestre actual
          </button>
        </div>

        {annex24Reports.length === 0 ? (
          <div className="p-10 text-center" style={{ color: 'var(--text-muted)' }}>
            <FileText className="mx-auto mb-3 opacity-30" size={32} />
            <p className="text-sm">No hay reportes generados</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {annex24Reports.map((r) => (
              <div key={r.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{r.period}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {r.totalImports} importaciones, {r.totalDischarges} descargos | ${r.totalValueUSD.toLocaleString()} USD
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs px-2 py-1 rounded-lg" style={{
                    background: r.status === 'TRANSMITTED' || r.status === 'ACCEPTED' ? 'rgba(16,185,129,0.1)' : 'rgba(6,182,212,0.1)',
                    color: r.status === 'TRANSMITTED' || r.status === 'ACCEPTED' ? '#10b981' : 'var(--cyan)',
                  }}>
                    {r.status === 'GENERATED' ? 'Generado' : r.status === 'TRANSMITTED' ? 'Transmitido' : r.status === 'ACCEPTED' ? 'Aceptado' : r.status}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{new Date(r.createdAt).toLocaleDateString('es-MX')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Import Form Modal
// ============================================

function ImportFormModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (data: CreateImportInput) => void }) {
  const [form, setForm] = useState<CreateImportInput>({
    pedimento: '', fractionCode: '', description: '', quantity: 0, unit: 'PZA',
    customsValue: 0, entryDate: new Date().toISOString().split('T')[0], expirationMonths: 18,
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    await onSubmit(form);
    setSubmitting(false);
  };

  const set = (field: keyof CreateImportInput, value: string | number) => setForm(f => ({ ...f, [field]: value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-lg rounded-2xl p-6 max-h-[90vh] overflow-y-auto" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-lg">Nueva importacion temporal</h3>
          <button onClick={onClose}><X size={20} style={{ color: 'var(--text-muted)' }} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Pedimento *</label>
              <input required value={form.pedimento} onChange={e => set('pedimento', e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} placeholder="24 47 3461 4000123" />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Fraccion arancelaria *</label>
              <input required value={form.fractionCode} onChange={e => set('fractionCode', e.target.value)} className="w-full p-2.5 rounded-lg text-sm font-mono" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} placeholder="84713001" />
            </div>
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Descripcion de la mercancia *</label>
            <input required value={form.description} onChange={e => set('description', e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} placeholder="Laptops para ensamble" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Cantidad *</label>
              <input required type="number" step="any" min="0" value={form.quantity || ''} onChange={e => set('quantity', Number(e.target.value))} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Unidad *</label>
              <select value={form.unit} onChange={e => set('unit', e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                <option value="PZA">Piezas</option>
                <option value="KG">Kilogramos</option>
                <option value="L">Litros</option>
                <option value="M">Metros</option>
                <option value="M2">Metros cuadrados</option>
                <option value="M3">Metros cubicos</option>
                <option value="PAR">Pares</option>
                <option value="JGO">Juegos</option>
              </select>
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Valor USD *</label>
              <input required type="number" step="any" min="0" value={form.customsValue || ''} onChange={e => set('customsValue', Number(e.target.value))} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Proveedor</label>
              <input value={form.supplier || ''} onChange={e => set('supplier', e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} placeholder="Nombre del proveedor" />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Pais de origen</label>
              <input value={form.originCountry || ''} onChange={e => set('originCountry', e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} placeholder="USA, China, etc." />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Fecha de entrada *</label>
              <input required type="date" value={form.entryDate} onChange={e => set('entryDate', e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Plazo de permanencia</label>
              <select value={form.expirationMonths || 18} onChange={e => set('expirationMonths', Number(e.target.value))} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                <option value={18}>18 meses (general)</option>
                <option value={36}>36 meses (con certificacion)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Notas</label>
            <textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} className="w-full p-2.5 rounded-lg text-sm resize-none" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--cyan)', color: 'var(--bg-deep)', opacity: submitting ? 0.7 : 1 }}>
              {submitting ? 'Guardando...' : 'Registrar importacion'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================
// Discharge Form Modal
// ============================================

function DischargeFormModal({ onClose, onSubmit, preselectedImport }: {
  onClose: () => void;
  onSubmit: (data: CreateDischargeInput) => void;
  preselectedImport: TemporaryImportRecord | null;
}) {
  const [imports, setImports] = useState<TemporaryImportRecord[]>([]);
  const [form, setForm] = useState<CreateDischargeInput>({
    temporaryImportId: preselectedImport?.id || '',
    type: 'RETURN_EXPORT',
    quantity: 0,
    unit: preselectedImport?.unit || 'PZA',
    dischargeDate: new Date().toISOString().split('T')[0],
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!preselectedImport) {
      api.inventoryImports(1, 'ACTIVE').then(res => setImports(res.data)).catch(() => {});
      api.inventoryImports(1, 'PARTIALLY_DISCHARGED').then(res => setImports(prev => [...prev, ...res.data])).catch(() => {});
    }
  }, [preselectedImport]);

  const selectedImp = preselectedImport || imports.find(i => i.id === form.temporaryImportId);
  const available = selectedImp ? selectedImp.quantity - selectedImp.quantityDischarged : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    await onSubmit(form);
    setSubmitting(false);
  };

  const set = (field: keyof CreateDischargeInput, value: string | number) => setForm(f => ({ ...f, [field]: value }));
  const showTaxFields = form.type === 'DOMESTIC_SALE' || form.type === 'REGIME_CHANGE';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-lg rounded-2xl p-6 max-h-[90vh] overflow-y-auto" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-lg">Registrar descargo</h3>
          <button onClick={onClose}><X size={20} style={{ color: 'var(--text-muted)' }} /></button>
        </div>

        {selectedImp && (
          <div className="p-3 rounded-lg mb-4" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)' }}>
            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Importacion seleccionada</p>
            <p className="text-sm font-mono" style={{ color: 'var(--cyan)' }}>{selectedImp.pedimento} - {selectedImp.fractionCode}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Disponible: {available.toLocaleString()} {selectedImp.unit} de {selectedImp.quantity.toLocaleString()}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!preselectedImport && (
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Importacion temporal *</label>
              <select required value={form.temporaryImportId} onChange={e => {
                const imp = imports.find(i => i.id === e.target.value);
                setForm(f => ({ ...f, temporaryImportId: e.target.value, unit: imp?.unit || f.unit }));
              }} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                <option value="">Seleccionar importacion...</option>
                {imports.map(i => (
                  <option key={i.id} value={i.id}>{i.pedimento} - {i.fractionCode} ({(i.quantity - i.quantityDischarged).toLocaleString()} {i.unit} disponibles)</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Tipo de descargo *</label>
            <select required value={form.type} onChange={e => set('type', e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
              {DISCHARGE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Cantidad * {available > 0 && <span className="text-[10px]">(max {available.toLocaleString()})</span>}</label>
              <input required type="number" step="any" min="0" max={available || undefined} value={form.quantity || ''} onChange={e => set('quantity', Number(e.target.value))} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Pedimento de descargo</label>
              <input value={form.pedimento || ''} onChange={e => set('pedimento', e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} placeholder="Pedimento de retorno" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Fecha de descargo *</label>
              <input required type="date" value={form.dischargeDate} onChange={e => set('dischargeDate', e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Valor USD</label>
              <input type="number" step="any" min="0" value={form.customsValue || ''} onChange={e => set('customsValue', Number(e.target.value))} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
          </div>

          {form.type === 'RETURN_EXPORT' && (
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Pais destino</label>
              <input value={form.destinationCountry || ''} onChange={e => set('destinationCountry', e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} placeholder="USA, Canada, etc." />
            </div>
          )}

          {form.type === 'DOMESTIC_SALE' && (
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Comprador nacional</label>
              <input value={form.buyerName || ''} onChange={e => set('buyerName', e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} placeholder="Nombre o RFC del comprador" />
            </div>
          )}

          {showTaxFields && (
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Impuestos pagados (MXN)</label>
              <input type="number" step="any" min="0" value={form.taxesPaid || ''} onChange={e => set('taxesPaid', Number(e.target.value))} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} placeholder="IGI + DTA + IVA pagados" />
            </div>
          )}

          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Notas</label>
            <textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} className="w-full p-2.5 rounded-lg text-sm resize-none" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--cyan)', color: 'var(--bg-deep)', opacity: submitting ? 0.7 : 1 }}>
              {submitting ? 'Guardando...' : 'Registrar descargo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
