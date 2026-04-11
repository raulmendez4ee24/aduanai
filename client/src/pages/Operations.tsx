import { useEffect, useState } from 'react';
import { FolderOpen, Plus, FileText, CheckCircle, Clock, AlertTriangle, X, Upload, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';

interface Document {
  id: string;
  name: string;
  type: string;
  status: string;
  required: boolean;
  fileName?: string;
  expiresAt?: string;
}

interface Operation {
  id: string;
  reference: string;
  type: string;
  status: string;
  description?: string;
  fractionCode?: string;
  origin?: string;
  completeness: number;
  createdAt: string;
  documents: Document[];
  missingDocuments?: { type: string; name: string; required: boolean }[];
}

// Extend API for operations
const opsApi = {
  list: (status?: string) =>
    api.stats().then(() =>
      fetch(`/api/operations${status ? `?status=${status}` : ''}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('aduanai_token')}` },
      }).then(r => r.json())
    ).catch(() =>
      fetch(`/api/operations${status ? `?status=${status}` : ''}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('aduanai_token')}` },
      }).then(r => r.json())
    ),

  get: (id: string) =>
    fetch(`/api/operations/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('aduanai_token')}` },
    }).then(r => r.json()),

  create: (data: Record<string, unknown>) =>
    fetch('/api/operations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('aduanai_token')}`,
      },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  updateDoc: (opId: string, docId: string, data: Record<string, unknown>) =>
    fetch(`/api/operations/${opId}/documents/${docId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('aduanai_token')}`,
      },
      body: JSON.stringify(data),
    }).then(r => r.json()),
};

const statusColors: Record<string, string> = {
  DRAFT: 'text-slate-400 bg-slate-400/10',
  IN_PROGRESS: 'text-yellow-400 bg-yellow-400/10',
  COMPLETE: 'text-green-400 bg-green-400/10',
  ARCHIVED: 'text-slate-500 bg-slate-500/10',
};

const statusLabels: Record<string, string> = {
  DRAFT: 'Borrador',
  IN_PROGRESS: 'En progreso',
  COMPLETE: 'Completo',
  ARCHIVED: 'Archivado',
};

const docStatusIcon = (status: string) => {
  if (status === 'VERIFIED') return <CheckCircle size={14} className="text-green-400" />;
  if (status === 'UPLOADED') return <Upload size={14} className="text-blue-400" />;
  if (status === 'EXPIRED') return <AlertTriangle size={14} className="text-red-400" />;
  if (status === 'REJECTED') return <X size={14} className="text-red-400" />;
  return <Clock size={14} className="text-slate-500" />;
};

export function OperationsPage() {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [selected, setSelected] = useState<Operation | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);

  // Create form
  const [newRef, setNewRef] = useState('');
  const [newType, setNewType] = useState('IMPORT');
  const [newDesc, setNewDesc] = useState('');
  const [newFraction, setNewFraction] = useState('');
  const [newOrigin, setNewOrigin] = useState('');

  const fetchOps = async () => {
    setLoading(true);
    try {
      const res = await opsApi.list();
      setOperations(res.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchOps(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await opsApi.create({
      reference: newRef,
      type: newType,
      description: newDesc,
      fractionCode: newFraction || undefined,
      origin: newOrigin || undefined,
    });
    setShowCreate(false);
    setNewRef(''); setNewDesc(''); setNewFraction(''); setNewOrigin('');
    fetchOps();
  };

  const selectOp = async (id: string) => {
    const res = await opsApi.get(id);
    setSelected(res.data);
  };

  const markDocUploaded = async (docId: string) => {
    if (!selected) return;
    await opsApi.updateDoc(selected.id, docId, {
      status: 'UPLOADED',
      fileName: 'documento.pdf',
    });
    selectOp(selected.id);
    fetchOps();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
            <FolderOpen size={24} className="text-[#C9A84C]" />
            Expediente Electrónico
          </h1>
          <p className="text-slate-400">Gestiona documentos por operación de comercio exterior</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-[#C9A84C] hover:bg-[#A68A3E] text-[#0A1628] font-semibold px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2"
        >
          <Plus size={16} />
          Nueva operación
        </button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0D1B2A] border border-[#1B2D45] rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">Nueva Operación</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-500 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Referencia / Pedimento</label>
                <input value={newRef} onChange={e => setNewRef(e.target.value)} required
                  className="w-full bg-[#1B2D45] border border-[#243656] rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-[#C9A84C]"
                  placeholder="Ej: PED-2026-00123" />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Tipo de operación</label>
                <select value={newType} onChange={e => setNewType(e.target.value)}
                  className="w-full bg-[#1B2D45] border border-[#243656] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-[#C9A84C]">
                  <option value="IMPORT">Importación</option>
                  <option value="EXPORT">Exportación</option>
                  <option value="TRANSIT">Tránsito</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Descripción</label>
                <input value={newDesc} onChange={e => setNewDesc(e.target.value)}
                  className="w-full bg-[#1B2D45] border border-[#243656] rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-[#C9A84C]"
                  placeholder="Descripción de la mercancía" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Fracción</label>
                  <input value={newFraction} onChange={e => setNewFraction(e.target.value)}
                    className="w-full bg-[#1B2D45] border border-[#243656] rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-[#C9A84C] font-mono"
                    placeholder="8471.30.01" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Origen</label>
                  <input value={newOrigin} onChange={e => setNewOrigin(e.target.value)}
                    className="w-full bg-[#1B2D45] border border-[#243656] rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-[#C9A84C]"
                    placeholder="China, USA..." />
                </div>
              </div>
              <button type="submit"
                className="w-full bg-[#C9A84C] hover:bg-[#A68A3E] text-[#0A1628] font-semibold py-3 rounded-lg transition-colors">
                Crear operación
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Operations list */}
        <div className="lg:col-span-1">
          {loading ? (
            <div className="text-center text-slate-500 py-12">Cargando...</div>
          ) : operations.length === 0 ? (
            <div className="bg-[#0D1B2A] border border-[#1B2D45] rounded-xl p-8 text-center">
              <FolderOpen size={36} className="text-[#1B2D45] mx-auto mb-3" />
              <p className="text-slate-500 text-sm">No hay operaciones</p>
              <p className="text-xs text-slate-600 mt-1">Crea tu primera operación para comenzar</p>
            </div>
          ) : (
            <div className="space-y-2">
              {operations.map(op => (
                <button
                  key={op.id}
                  onClick={() => selectOp(op.id)}
                  className={`w-full text-left bg-[#0D1B2A] border rounded-xl p-4 transition-all ${
                    selected?.id === op.id ? 'border-[#C9A84C]/30' : 'border-[#1B2D45] hover:border-[#243656]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-white text-sm font-semibold">{op.reference}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${statusColors[op.status]}`}>
                      {statusLabels[op.status]}
                    </span>
                  </div>
                  {op.description && <p className="text-xs text-slate-400 truncate mb-2">{op.description}</p>}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-[#1B2D45] rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all ${
                          op.completeness === 100 ? 'bg-green-400' : op.completeness > 50 ? 'bg-yellow-400' : 'bg-[#C9A84C]'
                        }`}
                        style={{ width: `${op.completeness}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500">{op.completeness}%</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Operation detail */}
        <div className="lg:col-span-2">
          {selected ? (
            <div className="bg-[#0D1B2A] border border-[#1B2D45] rounded-xl p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold text-white font-mono">{selected.reference}</h2>
                  <p className="text-sm text-slate-400 mt-1">{selected.description || 'Sin descripción'}</p>
                  <div className="flex gap-4 mt-2 text-xs text-slate-500">
                    {selected.fractionCode && <span>Fracción: <span className="text-white font-mono">{selected.fractionCode}</span></span>}
                    {selected.origin && <span>Origen: {selected.origin}</span>}
                  </div>
                </div>
                <span className={`text-sm px-3 py-1 rounded-lg ${statusColors[selected.status]}`}>
                  {statusLabels[selected.status]}
                </span>
              </div>

              {/* Completeness */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400">Completeness</span>
                  <span className="text-sm font-semibold text-white">{selected.completeness}%</span>
                </div>
                <div className="bg-[#1B2D45] rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      selected.completeness === 100 ? 'bg-green-400' : 'bg-[#C9A84C]'
                    }`}
                    style={{ width: `${selected.completeness}%` }}
                  />
                </div>
              </div>

              {/* Missing docs alert */}
              {selected.missingDocuments && selected.missingDocuments.filter(d => d.required).length > 0 && (
                <div className="bg-amber-500/5 border border-amber-500/10 rounded-lg px-4 py-3 mb-4">
                  <p className="text-xs text-amber-400 font-semibold mb-1 flex items-center gap-1">
                    <AlertTriangle size={12} />
                    Documentos obligatorios faltantes
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {selected.missingDocuments.filter(d => d.required).map(d => (
                      <span key={d.type} className="text-xs bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded">{d.name}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Documents list */}
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <FileText size={14} className="text-[#C9A84C]" />
                Documentos ({selected.documents.length})
              </h3>
              <div className="space-y-2">
                {selected.documents.map(doc => (
                  <div key={doc.id} className="flex items-center justify-between bg-[#1B2D45]/50 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-3">
                      {docStatusIcon(doc.status)}
                      <div>
                        <p className="text-sm text-white">{doc.name}</p>
                        <p className="text-xs text-slate-500">
                          {doc.required ? 'Obligatorio' : 'Opcional'}
                          {doc.fileName && ` — ${doc.fileName}`}
                        </p>
                      </div>
                    </div>
                    {doc.status === 'PENDING' && (
                      <button
                        onClick={() => markDocUploaded(doc.id)}
                        className="text-xs text-[#C9A84C] hover:text-[#E8D48B] flex items-center gap-1 transition-colors"
                      >
                        <Upload size={12} />
                        Subir
                      </button>
                    )}
                    {doc.status === 'UPLOADED' && (
                      <span className="text-xs text-blue-400">Subido</span>
                    )}
                    {doc.status === 'VERIFIED' && (
                      <span className="text-xs text-green-400">Verificado</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-[#0D1B2A] border border-[#1B2D45] rounded-xl p-12 text-center">
              <ChevronRight size={36} className="text-[#1B2D45] mx-auto mb-3" />
              <p className="text-slate-500">Selecciona una operación para ver sus documentos</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
