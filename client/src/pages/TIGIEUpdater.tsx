import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, AlertTriangle, CheckCircle, Send,
  X, FileText, Clock, ChevronDown, ChevronRight,
  Zap, Bell, ArrowRight, Filter,
} from 'lucide-react';
import { api } from '../lib/api';
import type {
  TIGIEUpdateRecord, UpdateNotificationRecord, ChangelogEntry,
  WeeklyDigest,
} from '../lib/api';

type Tab = 'dashboard' | 'updates' | 'analyze' | 'changelog';

const STATUS_LABELS: Record<string, string> = {
  DETECTED: 'Detectado', ANALYZED: 'Analizado', APPROVED: 'Aprobado',
  APPLIED: 'Aplicado', REJECTED: 'Rechazado',
};
const STATUS_COLORS: Record<string, string> = {
  DETECTED: 'var(--text-muted)', ANALYZED: '#f59e0b', APPROVED: 'var(--cyan)',
  APPLIED: '#10b981', REJECTED: '#ef4444',
};
const CHANGE_LABELS: Record<string, string> = {
  created: 'Creada', modified: 'Modificada', suppressed: 'Suprimida', nom_update: 'NOM actualizada',
};
const CHANGE_COLORS: Record<string, string> = {
  created: '#10b981', modified: '#f59e0b', suppressed: '#ef4444', nom_update: '#8b5cf6',
};

export function TIGIEUpdaterPage() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [updates, setUpdates] = useState<TIGIEUpdateRecord[]>([]);
  const [notifications, setNotifications] = useState<UpdateNotificationRecord[]>([]);
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([]);
  const [digest, setDigest] = useState<WeeklyDigest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedUpdate, setExpandedUpdate] = useState<string | null>(null);
  const [chapterFilter, setChapterFilter] = useState('');

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const [updRes, notifRes] = await Promise.all([
        api.updaterUpdates(),
        api.updaterNotifications(),
      ]);
      setUpdates(updRes.data);
      setNotifications(notifRes.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadChangelog = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.updaterChangelog(1, chapterFilter || undefined);
      setChangelog(res.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [chapterFilter]);

  useEffect(() => {
    if (tab === 'dashboard' || tab === 'updates') loadDashboard();
    if (tab === 'changelog') loadChangelog();
  }, [tab, loadDashboard, loadChangelog]);

  const handleApply = async (id: string) => {
    if (!confirm('Aplicar estos cambios a la base de datos de fracciones?')) return;
    try {
      const res = await api.updaterApply(id);
      setError('');
      alert(`Aplicados ${res.data.applied} de ${res.data.total} cambios`);
      loadDashboard();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  };

  const handleNotify = async (id: string) => {
    try {
      const res = await api.updaterNotify(id);
      alert(`${res.data.sent} notificaciones enviadas`);
      loadDashboard();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  };

  const handleDigest = async () => {
    try {
      const res = await api.updaterWeeklyDigest();
      setDigest(res.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await api.updaterMarkRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch {
      // silent
    }
  };

  const tabs: { key: Tab; label: string; icon: typeof RefreshCw }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: RefreshCw },
    { key: 'updates', label: 'Actualizaciones', icon: FileText },
    { key: 'analyze', label: 'Analizar decreto', icon: Zap },
    { key: 'changelog', label: 'Changelog', icon: Clock },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
            <span style={{ color: 'var(--cyan)' }}>TIGIE</span> Auto-Update
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Agente de actualizacion automatica con IA
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

      {loading && tab !== 'analyze' ? (
        <div className="text-center py-20" style={{ color: 'var(--text-muted)' }}>
          <RefreshCw className="animate-spin mx-auto mb-3" size={24} />
          <p className="text-sm">Cargando...</p>
        </div>
      ) : (
        <>
          {tab === 'dashboard' && <DashboardTab updates={updates} notifications={notifications} digest={digest} onDigest={handleDigest} onMarkRead={handleMarkRead} />}
          {tab === 'updates' && <UpdatesTab updates={updates} expandedUpdate={expandedUpdate} setExpandedUpdate={setExpandedUpdate} onApply={handleApply} onNotify={handleNotify} />}
          {tab === 'analyze' && <AnalyzeTab setError={setError} onSuccess={loadDashboard} />}
          {tab === 'changelog' && <ChangelogTab changelog={changelog} chapterFilter={chapterFilter} setChapterFilter={setChapterFilter} onFilter={loadChangelog} />}
        </>
      )}
    </div>
  );
}

// ============================================
// Dashboard
// ============================================

function DashboardTab({ updates, notifications, digest, onDigest, onMarkRead }: {
  updates: TIGIEUpdateRecord[];
  notifications: UpdateNotificationRecord[];
  digest: WeeklyDigest | null;
  onDigest: () => void;
  onMarkRead: (id: string) => void;
}) {
  const latestUpdate = updates[0];
  const totalChanges = updates.reduce((s, u) => s + u.fractionsCreated + u.fractionsModified + u.fractionsSuppressed, 0);
  const unread = notifications.filter(n => !n.read).length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Decretos procesados', value: updates.length, icon: FileText, color: 'var(--cyan)' },
          { label: 'Cambios totales', value: totalChanges, icon: RefreshCw, color: '#8b5cf6' },
          { label: 'Notificaciones', value: unread, icon: Bell, color: unread > 0 ? '#ef4444' : '#10b981', suffix: ' sin leer' },
          { label: 'Ultimo decreto', value: latestUpdate ? new Date(latestUpdate.publishDate).toLocaleDateString('es-MX') : 'N/A', icon: Clock, color: '#f59e0b' },
        ].map((s, i) => (
          <div key={i} className="p-4 rounded-xl" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${s.color}15` }}>
                <s.icon size={16} style={{ color: s.color }} />
              </div>
            </div>
            <p className="text-xl font-bold font-mono">{s.value}</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.label}{s.suffix || ''}</p>
          </div>
        ))}
      </div>

      {/* Latest update */}
      {latestUpdate && (
        <div className="rounded-xl p-5" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <FileText size={16} style={{ color: 'var(--cyan)' }} />
            Ultima actualizacion
          </h3>
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="text-sm font-medium">{latestUpdate.decree || 'Decreto DOF'}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {latestUpdate.source} | Publicado: {new Date(latestUpdate.publishDate).toLocaleDateString('es-MX')} | Vigencia: {new Date(latestUpdate.effectiveDate).toLocaleDateString('es-MX')}
              </p>
            </div>
            <span className="text-xs px-2 py-1 rounded-lg" style={{ background: `${STATUS_COLORS[latestUpdate.status]}15`, color: STATUS_COLORS[latestUpdate.status] }}>
              {STATUS_LABELS[latestUpdate.status]}
            </span>
          </div>
          <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>{latestUpdate.summary}</p>
          <div className="flex gap-4 text-xs">
            <span style={{ color: '#10b981' }}>+{latestUpdate.fractionsCreated} creadas</span>
            <span style={{ color: '#f59e0b' }}>{latestUpdate.fractionsModified} modificadas</span>
            <span style={{ color: '#ef4444' }}>{latestUpdate.fractionsSuppressed} suprimidas</span>
          </div>
        </div>
      )}

      {/* Notifications */}
      {notifications.length > 0 && (
        <div className="rounded-xl" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
          <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Bell size={16} style={{ color: '#f59e0b' }} />
              Notificaciones de cambios
              {unread > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: '#ef4444', color: 'white' }}>{unread}</span>}
            </h3>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {notifications.slice(0, 8).map(n => (
              <div key={n.id} className="p-3 flex items-start gap-3" style={{ opacity: n.read ? 0.6 : 1 }}>
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" style={{ color: CHANGE_COLORS[n.changeType] || '#f59e0b' }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono text-xs" style={{ color: 'var(--cyan)' }}>{n.fractionCode}</span>
                    <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>{new Date(n.createdAt).toLocaleDateString('es-MX')}</span>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{n.message}</p>
                </div>
                {!n.read && (
                  <button onClick={() => onMarkRead(n.id)} className="text-[10px] px-2 py-1 rounded" style={{ color: 'var(--cyan)', border: '1px solid rgba(6,182,212,0.2)' }}>
                    Leida
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weekly digest */}
      <div className="rounded-xl p-5" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Zap size={16} style={{ color: '#8b5cf6' }} /> Resumen semanal IA
          </h3>
          <button onClick={onDigest} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.2)' }}>
            Generar
          </button>
        </div>
        {digest ? (
          <div>
            <p className="text-[10px] mb-2" style={{ color: 'var(--text-dim)' }}>{digest.period} | {digest.updatesCount} actualizaciones</p>
            <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--text-secondary)' }}>{digest.digest}</p>
            {digest.affectedFractions.length > 0 && (
              <div className="mt-3 flex gap-1 flex-wrap">
                <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>Tus fracciones:</span>
                {digest.affectedFractions.map(f => (
                  <span key={f} className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-deep)', color: 'var(--cyan)' }}>{f}</span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Presiona "Generar" para crear el resumen semanal</p>
        )}
      </div>
    </div>
  );
}

// ============================================
// Updates Tab
// ============================================

function UpdatesTab({ updates, expandedUpdate, setExpandedUpdate, onApply, onNotify }: {
  updates: TIGIEUpdateRecord[];
  expandedUpdate: string | null;
  setExpandedUpdate: (v: string | null) => void;
  onApply: (id: string) => void;
  onNotify: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      {updates.length === 0 ? (
        <div className="p-10 text-center rounded-xl" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          <FileText className="mx-auto mb-3 opacity-30" size={32} />
          <p className="text-sm">No hay actualizaciones procesadas</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>Ve a "Analizar decreto" para procesar uno</p>
        </div>
      ) : updates.map(u => {
        const isExpanded = expandedUpdate === u.id;
        const changes = u.changes || [];
        const totalChanges = u.fractionsCreated + u.fractionsModified + u.fractionsSuppressed + u.nomsUpdated;

        return (
          <div key={u.id} className="rounded-xl" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
            <button onClick={() => setExpandedUpdate(isExpanded ? null : u.id)} className="w-full p-4 text-left">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  {isExpanded ? <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
                  <div>
                    <p className="text-sm font-medium">{u.decree || 'Decreto DOF'}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {u.source} | {new Date(u.publishDate).toLocaleDateString('es-MX')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>{totalChanges} cambios</span>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${STATUS_COLORS[u.status]}15`, color: STATUS_COLORS[u.status] }}>
                    {STATUS_LABELS[u.status]}
                  </span>
                </div>
              </div>
              <p className="text-xs ml-6" style={{ color: 'var(--text-muted)' }}>{u.summary}</p>
              <div className="flex gap-4 text-[10px] ml-6 mt-2">
                {u.fractionsCreated > 0 && <span style={{ color: '#10b981' }}>+{u.fractionsCreated} creadas</span>}
                {u.fractionsModified > 0 && <span style={{ color: '#f59e0b' }}>{u.fractionsModified} modificadas</span>}
                {u.fractionsSuppressed > 0 && <span style={{ color: '#ef4444' }}>{u.fractionsSuppressed} suprimidas</span>}
                {u.nomsUpdated > 0 && <span style={{ color: '#8b5cf6' }}>{u.nomsUpdated} NOMs</span>}
              </div>
            </button>

            {isExpanded && (
              <div className="px-4 pb-4 space-y-3" style={{ borderTop: '1px solid var(--border)' }}>
                {/* Actions */}
                <div className="flex gap-2 mt-3">
                  {(u.status === 'ANALYZED' || u.status === 'APPROVED') && (
                    <button onClick={() => onApply(u.id)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg" style={{ background: 'var(--cyan)', color: 'var(--bg-deep)' }}>
                      <CheckCircle size={12} /> Aplicar cambios
                    </button>
                  )}
                  {u.status === 'APPLIED' && (
                    <button onClick={() => onNotify(u.id)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>
                      <Send size={12} /> Notificar usuarios
                    </button>
                  )}
                  {u.usersNotified > 0 && (
                    <span className="text-xs py-1.5 px-2" style={{ color: '#10b981' }}>
                      <Bell size={12} className="inline mr-1" />{u.usersNotified} notificados
                    </span>
                  )}
                </div>

                {/* Changes detail */}
                <div className="space-y-1">
                  <p className="text-xs font-medium" style={{ color: 'var(--text-dim)' }}>Detalle de cambios</p>
                  {changes.map((c, i) => (
                    <div key={i} className="p-2 rounded-lg flex items-center gap-3 text-xs" style={{ background: 'var(--bg-deep)' }}>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: `${CHANGE_COLORS[c.type] || 'var(--text-muted)'}15`, color: CHANGE_COLORS[c.type] || 'var(--text-muted)' }}>
                        {CHANGE_LABELS[c.type] || c.type}
                      </span>
                      <span className="font-mono" style={{ color: 'var(--cyan)' }}>{c.fractionCode}</span>
                      {c.oldValue && c.newValue && (
                        <span style={{ color: 'var(--text-muted)' }}>
                          {c.field}: {c.oldValue} <ArrowRight size={10} className="inline" /> {c.newValue}
                        </span>
                      )}
                      {c.description && <span className="truncate" style={{ color: 'var(--text-dim)' }}>{c.description}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================
// Analyze Tab
// ============================================

function AnalyzeTab({ setError, onSuccess }: { setError: (e: string) => void; onSuccess: () => void }) {
  const [decreeText, setDecreeText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<{ update: TIGIEUpdateRecord; analysis: { context: string; impactedSectors: string[] } } | null>(null);

  const handleAnalyze = async () => {
    if (decreeText.trim().length < 50) {
      setError('El texto debe tener al menos 50 caracteres');
      return;
    }
    setAnalyzing(true);
    try {
      const res = await api.updaterAnalyzeDecree(decreeText);
      setResult(res.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error analizando decreto');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6">
      {!result ? (
        <div className="rounded-xl p-6" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
          <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <Zap size={16} style={{ color: 'var(--cyan)' }} />
            Analizar decreto del DOF
          </h3>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            Pega el texto de un decreto del Diario Oficial de la Federacion que modifique la TIGIE. La IA extraera automaticamente todos los cambios.
          </p>
          <textarea
            value={decreeText}
            onChange={e => setDecreeText(e.target.value)}
            rows={16}
            placeholder="Pega aqui el texto del decreto del DOF...&#10;&#10;Ejemplo:&#10;DECRETO por el que se modifican diversos aranceles de la Tarifa de la Ley de los Impuestos Generales de Importacion y de Exportacion.&#10;&#10;ARTICULO UNICO.- Se MODIFICAN los aranceles de las fracciones arancelarias de la Tarifa de la Ley de los Impuestos Generales de Importacion y de Exportacion, publicada en el DOF...&#10;&#10;8471.30.01  Maquinas automaticas para tratamiento o procesamiento de datos...  Ex.  15%&#10;8471.41.01  Las demas maquinas...  Ex.  10%"
            className="w-full p-4 rounded-xl text-sm leading-relaxed resize-none"
            style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
          />
          <div className="flex justify-between items-center mt-4">
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{decreeText.length} caracteres</span>
            <button onClick={handleAnalyze} disabled={analyzing || decreeText.length < 50}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium"
              style={{ background: analyzing ? 'var(--bg-deep)' : 'var(--cyan)', color: analyzing ? 'var(--text-muted)' : 'var(--bg-deep)', opacity: decreeText.length < 50 ? 0.5 : 1 }}>
              {analyzing ? <><RefreshCw className="animate-spin" size={16} /> Analizando decreto...</> : <><Zap size={16} /> Analizar con IA</>}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Result header */}
          <div className="rounded-xl p-5" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <CheckCircle size={16} style={{ color: '#10b981' }} />
                Decreto analizado exitosamente
              </h3>
              <span className="text-xs px-2 py-1 rounded-lg" style={{ background: `${STATUS_COLORS[result.update.status]}15`, color: STATUS_COLORS[result.update.status] }}>
                {STATUS_LABELS[result.update.status]}
              </span>
            </div>
            <p className="text-sm font-medium mb-1">{result.update.decree || 'Decreto DOF'}</p>
            <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>{result.update.summary}</p>

            {result.analysis.context && (
              <p className="text-xs mb-3 p-3 rounded-lg" style={{ background: 'rgba(6,182,212,0.05)', border: '1px solid rgba(6,182,212,0.15)', color: 'var(--text-muted)' }}>
                {result.analysis.context}
              </p>
            )}

            <div className="flex gap-4 text-xs mb-4">
              <span style={{ color: '#10b981' }}>+{result.update.fractionsCreated} creadas</span>
              <span style={{ color: '#f59e0b' }}>{result.update.fractionsModified} modificadas</span>
              <span style={{ color: '#ef4444' }}>{result.update.fractionsSuppressed} suprimidas</span>
              <span style={{ color: '#8b5cf6' }}>{result.update.nomsUpdated} NOMs</span>
            </div>

            {result.analysis.impactedSectors.length > 0 && (
              <div className="flex gap-1 flex-wrap mb-4">
                <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>Sectores:</span>
                {result.analysis.impactedSectors.map((s, i) => (
                  <span key={i} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-deep)', color: 'var(--text-muted)' }}>{s}</span>
                ))}
              </div>
            )}

            {/* Changes */}
            <div className="space-y-1">
              {result.update.changes.map((c, i) => (
                <div key={i} className="p-2 rounded-lg flex items-center gap-3 text-xs" style={{ background: 'var(--bg-deep)' }}>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: `${CHANGE_COLORS[c.type]}15`, color: CHANGE_COLORS[c.type] }}>
                    {CHANGE_LABELS[c.type]}
                  </span>
                  <span className="font-mono" style={{ color: 'var(--cyan)' }}>{c.fractionCode}</span>
                  {c.oldValue && c.newValue && (
                    <span style={{ color: 'var(--text-muted)' }}>{c.oldValue} <ArrowRight size={10} className="inline" /> {c.newValue}</span>
                  )}
                  <span className="truncate flex-1" style={{ color: 'var(--text-dim)' }}>{c.details || c.description || ''}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 justify-center">
            <button onClick={() => setResult(null)} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
              Analizar otro
            </button>
            <button onClick={() => { onSuccess(); }} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--cyan)', color: 'var(--bg-deep)' }}>
              Ver en actualizaciones
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Changelog Tab
// ============================================

function ChangelogTab({ changelog, chapterFilter, setChapterFilter, onFilter }: {
  changelog: ChangelogEntry[];
  chapterFilter: string;
  setChapterFilter: (v: string) => void;
  onFilter: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1">
          <Filter size={14} style={{ color: 'var(--text-dim)' }} />
          <input
            placeholder="Filtrar por capitulo (ej: 84)"
            value={chapterFilter}
            onChange={e => setChapterFilter(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onFilter()}
            className="flex-1 p-2 rounded-lg text-sm"
            style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          />
          <button onClick={onFilter} className="px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(6,182,212,0.1)', color: 'var(--cyan)', border: '1px solid rgba(6,182,212,0.2)' }}>
            Filtrar
          </button>
        </div>
      </div>

      {changelog.length === 0 ? (
        <div className="p-10 text-center rounded-xl" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          <Clock className="mx-auto mb-3 opacity-30" size={32} />
          <p className="text-sm">Sin cambios en el changelog</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="text-left p-3 text-xs font-medium" style={{ color: 'var(--text-dim)' }}>Fraccion</th>
                <th className="text-left p-3 text-xs font-medium" style={{ color: 'var(--text-dim)' }}>Cambio</th>
                <th className="text-left p-3 text-xs font-medium hidden sm:table-cell" style={{ color: 'var(--text-dim)' }}>Antes</th>
                <th className="text-left p-3 text-xs font-medium hidden sm:table-cell" style={{ color: 'var(--text-dim)' }}>Despues</th>
                <th className="text-left p-3 text-xs font-medium" style={{ color: 'var(--text-dim)' }}>Decreto</th>
                <th className="text-left p-3 text-xs font-medium" style={{ color: 'var(--text-dim)' }}>Vigencia</th>
              </tr>
            </thead>
            <tbody>
              {changelog.map((c, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="p-3 font-mono text-xs" style={{ color: 'var(--cyan)' }}>{c.fractionCode}</td>
                  <td className="p-3">
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: `${CHANGE_COLORS[c.changeType]}15`, color: CHANGE_COLORS[c.changeType] }}>
                      {CHANGE_LABELS[c.changeType] || c.changeType}
                    </span>
                  </td>
                  <td className="p-3 text-xs hidden sm:table-cell" style={{ color: 'var(--text-dim)' }}>{c.oldValue || '-'}</td>
                  <td className="p-3 text-xs hidden sm:table-cell font-medium">{c.newValue || '-'}</td>
                  <td className="p-3 text-xs" style={{ color: 'var(--text-muted)' }}>{c.decree || '-'}</td>
                  <td className="p-3 text-xs" style={{ color: 'var(--text-muted)' }}>{new Date(c.effectiveDate).toLocaleDateString('es-MX')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
