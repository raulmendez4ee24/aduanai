import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Package, Plus, Trash2, X, RefreshCw, Zap, DollarSign,
  Box, Ruler, ChevronRight, BarChart3, Eye,
} from 'lucide-react';
import * as THREE from 'three';
import { api } from '../lib/api';
import type {
  LoadPlanRecord, ContainerSpec, CubicageResult, LoadOptimization,
  CostAnalysis, CreateLoadItemInput,
} from '../lib/api';

type Tab = 'plans' | 'editor' | 'view3d';

const CONTAINER_LABELS: Record<string, string> = {
  CONTAINER_20FT: "20'", CONTAINER_40FT: "40'", CONTAINER_40FT_HC: "40' HC",
  TRUCK_53FT: "Trailer 53'", TRUCK_48FT: "Trailer 48'", VAN_CLOSED: 'Van', CUSTOM: 'Custom',
};

export function LogisticsPage() {
  const [tab, setTab] = useState<Tab>('plans');
  const [plans, setPlans] = useState<LoadPlanRecord[]>([]);
  const [containers, setContainers] = useState<ContainerSpec[]>([]);
  const [activePlan, setActivePlan] = useState<LoadPlanRecord | null>(null);
  const [cubicage, setCubicage] = useState<CubicageResult | null>(null);
  const [optimization, setOptimization] = useState<LoadOptimization | null>(null);
  const [costs, setCosts] = useState<CostAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAI, setLoadingAI] = useState('');
  const [error, setError] = useState('');
  const [showNewPlan, setShowNewPlan] = useState(false);

  const loadPlans = useCallback(async () => {
    try {
      setLoading(true);
      const [plansRes, contRes] = await Promise.all([
        api.logisticsPlans(),
        api.logisticsContainers(),
      ]);
      setPlans(plansRes.data);
      setContainers(contRes.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPlanDetail = useCallback(async (id: string) => {
    try {
      const res = await api.logisticsPlanDetail(id);
      setActivePlan(res.data);
      setCubicage(null);
      setOptimization(null);
      setCosts(null);
      setTab('editor');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  }, []);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  const handleCreatePlan = async (name: string, containerType: string) => {
    try {
      const res = await api.logisticsPlanCreate({ name, containerType });
      setActivePlan(res.data);
      setShowNewPlan(false);
      setTab('editor');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  };

  const handleAddItem = async (data: CreateLoadItemInput) => {
    if (!activePlan) return;
    try {
      await api.logisticsAddItem(activePlan.id, data);
      const res = await api.logisticsPlanDetail(activePlan.id);
      setActivePlan(res.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!activePlan) return;
    try {
      await api.logisticsRemoveItem(activePlan.id, itemId);
      const res = await api.logisticsPlanDetail(activePlan.id);
      setActivePlan(res.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  };

  const handleCalculate = async () => {
    if (!activePlan) return;
    try {
      setLoadingAI('calc');
      const res = await api.logisticsCalculate(activePlan.id);
      setCubicage(res.data);
      const updated = await api.logisticsPlanDetail(activePlan.id);
      setActivePlan(updated.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoadingAI('');
    }
  };

  const handleOptimize = async () => {
    if (!activePlan) return;
    try {
      setLoadingAI('optimize');
      const res = await api.logisticsOptimize(activePlan.id);
      setOptimization(res.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoadingAI('');
    }
  };

  const handleCosts = async () => {
    if (!activePlan) return;
    try {
      setLoadingAI('costs');
      const res = await api.logisticsCosts(activePlan.id);
      setCosts(res.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoadingAI('');
    }
  };

  const handleDeletePlan = async (id: string) => {
    if (!confirm('Eliminar este plan de carga?')) return;
    try {
      await api.logisticsPlanDelete(id);
      if (activePlan?.id === id) { setActivePlan(null); setTab('plans'); }
      loadPlans();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  };

  const tabs: { key: Tab; label: string; icon: typeof Package }[] = [
    { key: 'plans', label: 'Planes', icon: Package },
    { key: 'editor', label: 'Editor', icon: Box },
    { key: 'view3d', label: '3D', icon: Eye },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
            <span style={{ color: 'var(--cyan)' }}>Logistics</span> Optimizer
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Cubicaje inteligente con optimizacion de costos IA
          </p>
        </div>
        {tab === 'plans' && (
          <button onClick={() => setShowNewPlan(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium" style={{ background: 'var(--cyan)', color: 'var(--bg-deep)' }}>
            <Plus size={16} /> Nuevo plan
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl flex items-center justify-between" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <span className="text-sm" style={{ color: '#ef4444' }}>{error}</span>
          <button onClick={() => setError('')}><X size={16} style={{ color: '#ef4444' }} /></button>
        </div>
      )}

      <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} disabled={t.key !== 'plans' && !activePlan}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium flex-1 justify-center transition-all"
            style={{
              background: tab === t.key ? 'var(--cyan-glow)' : 'transparent',
              color: tab === t.key ? 'var(--cyan)' : 'var(--text-muted)',
              border: tab === t.key ? '1px solid rgba(6,182,212,0.15)' : '1px solid transparent',
              opacity: (t.key !== 'plans' && !activePlan) ? 0.4 : 1,
            }}>
            <t.icon size={15} />{t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-20" style={{ color: 'var(--text-muted)' }}>
          <RefreshCw className="animate-spin mx-auto mb-3" size={24} />
          <p className="text-sm">Cargando...</p>
        </div>
      ) : (
        <>
          {tab === 'plans' && <PlansTab plans={plans} onSelect={loadPlanDetail} onDelete={handleDeletePlan} />}
          {tab === 'editor' && activePlan && <EditorTab plan={activePlan} cubicage={cubicage} optimization={optimization} costs={costs} loadingAI={loadingAI} onAddItem={handleAddItem} onRemoveItem={handleRemoveItem} onCalculate={handleCalculate} onOptimize={handleOptimize} onCosts={handleCosts} />}
          {tab === 'view3d' && activePlan && <View3DTab plan={activePlan} />}
        </>
      )}

      {showNewPlan && <NewPlanModal containers={containers} onClose={() => setShowNewPlan(false)} onCreate={handleCreatePlan} />}
    </div>
  );
}

// ============================================
// Plans Tab
// ============================================

function PlansTab({ plans, onSelect, onDelete }: {
  plans: LoadPlanRecord[];
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      {plans.length === 0 ? (
        <div className="p-10 text-center rounded-xl" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          <Package className="mx-auto mb-3 opacity-30" size={32} />
          <p className="text-sm">No hay planes de carga</p>
        </div>
      ) : plans.map(plan => {
        const volColor = plan.volumeUsed <= 70 ? '#10b981' : plan.volumeUsed <= 95 ? '#f59e0b' : '#ef4444';
        const wgtColor = plan.weightUsed <= 70 ? '#10b981' : plan.weightUsed <= 95 ? '#f59e0b' : '#ef4444';
        return (
          <div key={plan.id} className="rounded-xl p-4 cursor-pointer transition-all hover:brightness-110" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }} onClick={() => onSelect(plan.id)}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-sm font-medium">{plan.name}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {CONTAINER_LABELS[plan.containerType] || plan.containerType} | {plan.totalItems} items | {plan.status}
                </p>
              </div>
              <button onClick={(e) => { e.stopPropagation(); onDelete(plan.id); }} className="p-1" style={{ color: 'var(--text-dim)' }}>
                <Trash2 size={14} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex justify-between text-[10px] mb-1" style={{ color: 'var(--text-dim)' }}>
                  <span>Volumen</span><span style={{ color: volColor }}>{plan.volumeUsed.toFixed(0)}%</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-deep)' }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, plan.volumeUsed)}%`, background: volColor }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[10px] mb-1" style={{ color: 'var(--text-dim)' }}>
                  <span>Peso</span><span style={{ color: wgtColor }}>{plan.weightUsed.toFixed(0)}%</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-deep)' }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, plan.weightUsed)}%`, background: wgtColor }} />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================
// Editor Tab
// ============================================

function EditorTab({ plan, cubicage, optimization, costs, loadingAI, onAddItem, onRemoveItem, onCalculate, onOptimize, onCosts }: {
  plan: LoadPlanRecord;
  cubicage: CubicageResult | null;
  optimization: LoadOptimization | null;
  costs: CostAnalysis | null;
  loadingAI: string;
  onAddItem: (data: CreateLoadItemInput) => void;
  onRemoveItem: (id: string) => void;
  onCalculate: () => void;
  onOptimize: () => void;
  onCosts: () => void;
}) {
  const [newItem, setNewItem] = useState<CreateLoadItemInput>({
    description: '', quantity: 1, length: 0, width: 0, height: 0, weight: 0, stackable: true, fragile: false,
  });

  const items = plan.items || [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Items */}
      <div className="lg:col-span-2 space-y-4">
        <div className="rounded-xl p-4" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Box size={16} style={{ color: 'var(--cyan)' }} />
            {plan.name} — {CONTAINER_LABELS[plan.containerType] || plan.containerType}
          </h3>
          <p className="text-xs mb-4" style={{ color: 'var(--text-dim)' }}>
            {plan.containerLength}x{plan.containerWidth}x{plan.containerHeight}cm | Max {plan.maxWeight.toLocaleString()}kg
          </p>

          {/* Add item form */}
          <div className="p-3 rounded-lg mb-4" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-dim)' }}>Agregar item</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
              <input placeholder="Descripcion" value={newItem.description} onChange={e => setNewItem(n => ({ ...n, description: e.target.value }))} className="col-span-2 p-2 rounded-lg text-xs" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
              <input placeholder="Cant" type="number" min="1" value={newItem.quantity || ''} onChange={e => setNewItem(n => ({ ...n, quantity: Number(e.target.value) }))} className="p-2 rounded-lg text-xs" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
              <input placeholder="Peso kg/pza" type="number" step="any" min="0" value={newItem.weight || ''} onChange={e => setNewItem(n => ({ ...n, weight: Number(e.target.value) }))} className="p-2 rounded-lg text-xs" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
            <div className="grid grid-cols-5 gap-2 mb-2">
              <input placeholder="Largo cm" type="number" step="any" min="0" value={newItem.length || ''} onChange={e => setNewItem(n => ({ ...n, length: Number(e.target.value) }))} className="p-2 rounded-lg text-xs" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
              <input placeholder="Ancho cm" type="number" step="any" min="0" value={newItem.width || ''} onChange={e => setNewItem(n => ({ ...n, width: Number(e.target.value) }))} className="p-2 rounded-lg text-xs" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
              <input placeholder="Alto cm" type="number" step="any" min="0" value={newItem.height || ''} onChange={e => setNewItem(n => ({ ...n, height: Number(e.target.value) }))} className="p-2 rounded-lg text-xs" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
              <label className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                <input type="checkbox" checked={newItem.stackable} onChange={e => setNewItem(n => ({ ...n, stackable: e.target.checked }))} /> Apilable
              </label>
              <label className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                <input type="checkbox" checked={newItem.fragile} onChange={e => setNewItem(n => ({ ...n, fragile: e.target.checked }))} /> Fragil
              </label>
            </div>
            <button onClick={() => {
              if (!newItem.description || !newItem.quantity || !newItem.length || !newItem.width || !newItem.height || !newItem.weight) return;
              onAddItem(newItem);
              setNewItem({ description: '', quantity: 1, length: 0, width: 0, height: 0, weight: 0, stackable: true, fragile: false });
            }} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(6,182,212,0.1)', color: 'var(--cyan)', border: '1px solid rgba(6,182,212,0.2)' }}>
              <Plus size={12} className="inline mr-1" /> Agregar
            </button>
          </div>

          {/* Items list */}
          {items.length === 0 ? (
            <p className="text-xs text-center py-4" style={{ color: 'var(--text-dim)' }}>Sin items. Agrega productos arriba.</p>
          ) : (
            <div className="space-y-1">
              {items.map(item => (
                <div key={item.id} className="flex items-center justify-between p-2 rounded-lg text-xs" style={{ background: 'var(--bg-deep)' }}>
                  <div className="flex items-center gap-3 flex-1">
                    <span className="font-medium" style={{ color: item.fragile ? '#ef4444' : 'var(--text-secondary)' }}>{item.description}</span>
                    <span className="font-mono" style={{ color: 'var(--text-dim)' }}>{item.quantity}x</span>
                    <span className="font-mono" style={{ color: 'var(--text-dim)' }}>{item.length}x{item.width}x{item.height}cm</span>
                    <span className="font-mono" style={{ color: 'var(--text-dim)' }}>{item.weight}kg</span>
                    {!item.stackable && <span className="px-1 rounded" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontSize: '9px' }}>NO APILAR</span>}
                    {item.fragile && <span className="px-1 rounded" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: '9px' }}>FRAGIL</span>}
                  </div>
                  <button onClick={() => onRemoveItem(item.id)} className="p-1 ml-2" style={{ color: 'var(--text-dim)' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Action buttons */}
          {items.length > 0 && (
            <div className="flex gap-2 mt-4 flex-wrap">
              <button onClick={onCalculate} disabled={loadingAI === 'calc'} className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg font-medium" style={{ background: 'var(--cyan)', color: 'var(--bg-deep)' }}>
                {loadingAI === 'calc' ? <RefreshCw className="animate-spin" size={12} /> : <Ruler size={12} />}
                Calcular cubicaje
              </button>
              <button onClick={onOptimize} disabled={loadingAI === 'optimize'} className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg font-medium" style={{ background: 'rgba(6,182,212,0.1)', color: 'var(--cyan)', border: '1px solid rgba(6,182,212,0.2)' }}>
                {loadingAI === 'optimize' ? <RefreshCw className="animate-spin" size={12} /> : <Zap size={12} />}
                Optimizar IA
              </button>
              <button onClick={onCosts} disabled={loadingAI === 'costs'} className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg font-medium" style={{ background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.2)' }}>
                {loadingAI === 'costs' ? <RefreshCw className="animate-spin" size={12} /> : <DollarSign size={12} />}
                Analisis de costos
              </button>
            </div>
          )}
        </div>

        {/* Optimization results */}
        {optimization && (
          <div className="rounded-xl p-4" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Zap size={16} style={{ color: 'var(--cyan)' }} /> Optimizacion IA
            </h3>
            <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>{optimization.arrangement}</p>
            {optimization.loadingOrder.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-dim)' }}>Orden de carga:</p>
                {optimization.loadingOrder.map((step, i) => (
                  <p key={i} className="text-xs flex items-center gap-1 mb-0.5" style={{ color: 'var(--text-muted)' }}>
                    <ChevronRight size={10} style={{ color: 'var(--cyan)' }} /> {step}
                  </p>
                ))}
              </div>
            )}
            {optimization.tips.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-dim)' }}>Tips:</p>
                {optimization.tips.map((tip, i) => (
                  <p key={i} className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>- {tip}</p>
                ))}
              </div>
            )}
            <p className="text-xs" style={{ color: 'var(--cyan)' }}>{optimization.spaceOptimization}</p>
            {optimization.alternativeContainer && (
              <p className="text-xs mt-2" style={{ color: '#f59e0b' }}>Alternativa: {optimization.alternativeContainer}</p>
            )}
          </div>
        )}

        {/* Cost analysis */}
        {costs && (
          <div className="rounded-xl p-4" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <DollarSign size={16} style={{ color: '#8b5cf6' }} /> Analisis de costos
            </h3>
            <div className="space-y-3 mb-4">
              {costs.options.map((opt, i) => (
                <div key={i} className="p-3 rounded-lg" style={{ background: 'var(--bg-deep)', border: i === 0 ? '1px solid rgba(6,182,212,0.3)' : '1px solid var(--border)' }}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-sm font-medium">{opt.name}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{opt.containers}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-mono font-bold" style={{ color: i === 0 ? 'var(--cyan)' : 'var(--text-primary)' }}>${opt.estimatedCost.toLocaleString()}</p>
                      <p className="text-[10px]" style={{ color: 'var(--text-dim)' }}>${opt.costPerPiece}/pza</p>
                    </div>
                  </div>
                  <div className="flex gap-4 text-[10px]">
                    <div>
                      <span style={{ color: '#10b981' }}>{opt.pros.join(', ')}</span>
                    </div>
                    {opt.cons.length > 0 && (
                      <div>
                        <span style={{ color: '#ef4444' }}>{opt.cons.join(', ')}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(6,182,212,0.05)', border: '1px solid rgba(6,182,212,0.15)', color: 'var(--text-secondary)' }}>
              {costs.recommendation}
            </div>
            {costs.savingsVsWorst > 0 && (
              <p className="text-xs mt-2 text-center" style={{ color: '#10b981' }}>
                Ahorro vs peor opcion: ${costs.savingsVsWorst.toLocaleString()} USD
              </p>
            )}
          </div>
        )}
      </div>

      {/* Right: Results panel */}
      <div className="space-y-4">
        <div className="rounded-xl p-4 sticky top-4" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
          <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <BarChart3 size={16} style={{ color: 'var(--cyan)' }} /> Cubicaje
          </h3>

          {/* Volume bar */}
          <div className="mb-4">
            <div className="flex justify-between text-xs mb-1">
              <span style={{ color: 'var(--text-dim)' }}>Volumen</span>
              <span className="font-mono" style={{ color: (cubicage?.volumeUsedPct || plan.volumeUsed) > 95 ? '#ef4444' : (cubicage?.volumeUsedPct || plan.volumeUsed) > 70 ? '#f59e0b' : '#10b981' }}>
                {(cubicage?.volumeUsedPct || plan.volumeUsed).toFixed(1)}%
              </span>
            </div>
            <div className="h-4 rounded-full overflow-hidden" style={{ background: 'var(--bg-deep)' }}>
              <div className="h-full rounded-full transition-all" style={{
                width: `${Math.min(100, cubicage?.volumeUsedPct || plan.volumeUsed)}%`,
                background: (cubicage?.volumeUsedPct || plan.volumeUsed) > 95 ? '#ef4444' : (cubicage?.volumeUsedPct || plan.volumeUsed) > 70 ? '#f59e0b' : '#10b981',
              }} />
            </div>
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-dim)' }}>
              {(cubicage?.itemsVolume || plan.totalVolume).toFixed(2)} / {(cubicage?.containerVolume || (plan.containerLength * plan.containerWidth * plan.containerHeight / 1_000_000)).toFixed(1)} m3
            </p>
          </div>

          {/* Weight bar */}
          <div className="mb-4">
            <div className="flex justify-between text-xs mb-1">
              <span style={{ color: 'var(--text-dim)' }}>Peso</span>
              <span className="font-mono" style={{ color: (cubicage?.weightUsedPct || plan.weightUsed) > 95 ? '#ef4444' : (cubicage?.weightUsedPct || plan.weightUsed) > 70 ? '#f59e0b' : '#10b981' }}>
                {(cubicage?.weightUsedPct || plan.weightUsed).toFixed(1)}%
              </span>
            </div>
            <div className="h-4 rounded-full overflow-hidden" style={{ background: 'var(--bg-deep)' }}>
              <div className="h-full rounded-full transition-all" style={{
                width: `${Math.min(100, cubicage?.weightUsedPct || plan.weightUsed)}%`,
                background: (cubicage?.weightUsedPct || plan.weightUsed) > 95 ? '#ef4444' : (cubicage?.weightUsedPct || plan.weightUsed) > 70 ? '#f59e0b' : '#10b981',
              }} />
            </div>
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-dim)' }}>
              {(cubicage?.totalWeight || plan.totalWeight).toFixed(0)} / {plan.maxWeight.toLocaleString()} kg
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 rounded-lg text-center" style={{ background: 'var(--bg-deep)' }}>
              <p className="text-lg font-mono font-bold">{cubicage?.totalPieces || plan.totalItems}</p>
              <p className="text-[10px]" style={{ color: 'var(--text-dim)' }}>Piezas totales</p>
            </div>
            <div className="p-2 rounded-lg text-center" style={{ background: 'var(--bg-deep)' }}>
              <p className="text-lg font-mono font-bold" style={{ color: cubicage?.fitsAll === false ? '#ef4444' : '#10b981' }}>
                {cubicage ? (cubicage.fitsAll ? 'SI' : 'NO') : '-'}
              </p>
              <p className="text-[10px]" style={{ color: 'var(--text-dim)' }}>Cabe todo</p>
            </div>
          </div>

          {cubicage && !cubicage.fitsAll && (
            <div className="mt-3 p-2 rounded-lg text-xs text-center" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
              {cubicage.overflow} piezas NO caben
            </div>
          )}

          {cubicage?.limitingFactor && cubicage.limitingFactor !== 'none' && (
            <div className="mt-3 p-2 rounded-lg text-xs text-center" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', color: '#f59e0b' }}>
              Factor limitante: {cubicage.limitingFactor === 'volume' ? 'VOLUMEN' : cubicage.limitingFactor === 'weight' ? 'PESO' : 'AMBOS'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// 3D View
// ============================================

function View3DTab({ plan }: { plan: LoadPlanRecord }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Cleanup previous
    if (rendererRef.current) {
      container.removeChild(rendererRef.current.domElement);
      rendererRef.current.dispose();
    }

    const w = container.clientWidth;
    const h = 500;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a1a);

    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 10000);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Scale: convert cm to scene units (1 unit = 10cm)
    const scale = 0.01;
    const cL = plan.containerLength * scale;
    const cW = plan.containerWidth * scale;
    const cH = plan.containerHeight * scale;

    // Container wireframe
    const containerGeo = new THREE.BoxGeometry(cL, cH, cW);
    const containerEdges = new THREE.EdgesGeometry(containerGeo);
    const containerLine = new THREE.LineSegments(containerEdges, new THREE.LineBasicMaterial({ color: 0x06b6d4, linewidth: 2 }));
    containerLine.position.set(cL / 2, cH / 2, cW / 2);
    scene.add(containerLine);

    // Floor grid
    const floorGeo = new THREE.PlaneGeometry(cL, cW);
    const floorMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.05, side: THREE.DoubleSide });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cL / 2, 0.01, cW / 2);
    scene.add(floor);

    // Place items
    const items = plan.items || [];
    const colors = [0x06b6d4, 0x8b5cf6, 0x10b981, 0xf59e0b, 0xec4899, 0xf97316];
    let curX = 0;
    let curZ = 0;
    let curY = 0;
    let rowMaxH = 0;
    let rowMaxZ = 0;

    items.forEach((item, idx) => {
      const iL = item.length * scale;
      const iW = item.width * scale;
      const iH = item.height * scale;
      const color = item.fragile ? 0xef4444 : colors[idx % colors.length];

      for (let q = 0; q < Math.min(item.quantity, 50); q++) {
        // Check if fits in current row
        if (curX + iL > cL) {
          curX = 0;
          curZ += rowMaxZ;
          rowMaxZ = 0;
        }
        if (curZ + iW > cW) {
          curZ = 0;
          curX = 0;
          curY += rowMaxH;
          rowMaxH = 0;
        }
        if (curY + iH > cH) break; // no more space

        const boxGeo = new THREE.BoxGeometry(iL * 0.95, iH * 0.95, iW * 0.95);
        const boxMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75 });
        const box = new THREE.Mesh(boxGeo, boxMat);
        box.position.set(curX + iL / 2, curY + iH / 2, curZ + iW / 2);
        scene.add(box);

        // Box edges
        const edges = new THREE.EdgesGeometry(boxGeo);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 }));
        line.position.copy(box.position);
        scene.add(line);

        curX += iL;
        rowMaxH = Math.max(rowMaxH, iH);
        rowMaxZ = Math.max(rowMaxZ, iW);
      }
    });

    // Ambient light
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    // Camera position
    const maxDim = Math.max(cL, cW, cH);
    camera.position.set(cL * 1.2, cH * 1.5, cW * 2);
    camera.lookAt(cL / 2, cH / 3, cW / 2);

    // Manual rotation
    let isDragging = false;
    let prevX = 0;
    let prevY = 0;
    let rotY = 0;
    let rotX = 0.3;

    const pivot = new THREE.Vector3(cL / 2, cH / 3, cW / 2);

    const onMouseDown = (e: MouseEvent) => { isDragging = true; prevX = e.clientX; prevY = e.clientY; };
    const onMouseUp = () => { isDragging = false; };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      rotY += dx * 0.005;
      rotX = Math.max(-0.5, Math.min(1.2, rotX + dy * 0.005));
      prevX = e.clientX;
      prevY = e.clientY;
    };

    renderer.domElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('mousemove', onMouseMove);

    // Animate
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      const dist = maxDim * 2.5;
      camera.position.x = pivot.x + dist * Math.sin(rotY) * Math.cos(rotX);
      camera.position.y = pivot.y + dist * Math.sin(rotX);
      camera.position.z = pivot.z + dist * Math.cos(rotY) * Math.cos(rotX);
      camera.lookAt(pivot);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [plan]);

  return (
    <div>
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <div ref={mountRef} style={{ width: '100%', height: 500, cursor: 'grab' }} />
      </div>
      <div className="flex items-center justify-center gap-6 mt-3">
        <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-dim)' }}>
          <span>Arrastra para rotar</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: '#06b6d4' }} /> Contenedor</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: '#ef4444' }} /> Fragil</span>
          {(plan.items || []).slice(0, 4).map((item, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="w-3 h-3 rounded" style={{ background: [0x06b6d4, 0x8b5cf6, 0x10b981, 0xf59e0b][i] ? `#${[0x06b6d4, 0x8b5cf6, 0x10b981, 0xf59e0b][i].toString(16).padStart(6, '0')}` : '#888' }} />
              {item.description}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================
// New Plan Modal
// ============================================

function NewPlanModal({ containers, onClose, onCreate }: {
  containers: ContainerSpec[];
  onClose: () => void;
  onCreate: (name: string, type: string) => void;
}) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-lg rounded-2xl p-6 max-h-[90vh] overflow-y-auto" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-lg">Nuevo plan de carga</h3>
          <button onClick={onClose}><X size={20} style={{ color: 'var(--text-muted)' }} /></button>
        </div>

        <div className="mb-4">
          <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Nombre del plan *</label>
          <input value={name} onChange={e => setName(e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} placeholder="Ej: Embarque China Q2 2026" />
        </div>

        <p className="text-xs mb-3" style={{ color: 'var(--text-dim)' }}>Selecciona tipo de contenedor</p>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {containers.map(c => (
            <button key={c.type} onClick={() => setSelected(c.type)}
              className="p-3 rounded-xl text-left transition-all"
              style={{
                background: selected === c.type ? 'var(--cyan-glow)' : 'var(--bg-deep)',
                border: selected === c.type ? '1px solid rgba(6,182,212,0.4)' : '1px solid var(--border)',
              }}>
              <p className="text-sm font-medium" style={{ color: selected === c.type ? 'var(--cyan)' : 'var(--text-secondary)' }}>{c.label}</p>
              <p className="text-[10px] font-mono" style={{ color: 'var(--text-dim)' }}>{c.length}x{c.width}x{c.height}cm</p>
              <p className="text-[10px]" style={{ color: 'var(--text-dim)' }}>{c.volumeM3}m3 | {c.maxWeight.toLocaleString()}kg</p>
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
          <button onClick={() => { if (name && selected) onCreate(name, selected); }} disabled={!name || !selected}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'var(--cyan)', color: 'var(--bg-deep)', opacity: (!name || !selected) ? 0.5 : 1 }}>
            Crear plan
          </button>
        </div>
      </div>
    </div>
  );
}
