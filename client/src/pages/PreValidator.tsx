import { useState } from 'react';
import { FileCheck, Upload, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

export function PreValidatorPage() {
  const [pedimentoText, setPedimentoText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ valid: boolean; errors: { field: string; message: string; severity: string }[]; warnings: { field: string; message: string }[] } | null>(null);

  const validate = async () => {
    if (!pedimentoText.trim() || loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/prevalidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('aduanai_token')}` },
        body: JSON.stringify({ pedimentoText }),
      });
      if (res.ok) {
        const data = await res.json();
        setResult(data.data);
      }
    } catch { /* handled */ }
    setLoading(false);
  };

  return (
    <div>
      <div className="mb-8 animate-fade-up">
        <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: 'var(--font-display)' }}>Pre-Validador</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Valida pedimentos antes del despacho oficial</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="animate-fade-up delay-100">
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Upload size={16} style={{ color: 'var(--cyan)' }} />
              <h2 className="text-sm font-semibold" style={{ fontFamily: 'var(--font-display)' }}>Datos del Pedimento</h2>
            </div>
            <textarea
              value={pedimentoText}
              onChange={e => setPedimentoText(e.target.value)}
              placeholder="Pega aquí los datos del pedimento para validar..."
              className="input w-full h-64 resize-none text-xs"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            <button onClick={validate} disabled={loading || !pedimentoText.trim()}
              className="btn-primary w-full mt-4 py-3 text-sm justify-center disabled:opacity-40">
              <FileCheck size={16} />{loading ? 'Validando...' : 'Pre-Validar'}
            </button>
          </div>
        </div>

        <div className="animate-fade-up delay-200">
          {result ? (
            <div className="glass rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-5">
                {result.valid ? (
                  <><CheckCircle size={20} style={{ color: 'var(--emerald)' }} /><span className="font-semibold" style={{ color: 'var(--emerald)', fontFamily: 'var(--font-display)' }}>Pedimento válido</span></>
                ) : (
                  <><XCircle size={20} style={{ color: 'var(--rose)' }} /><span className="font-semibold" style={{ color: 'var(--rose)', fontFamily: 'var(--font-display)' }}>Errores encontrados</span></>
                )}
              </div>
              {result.errors.length > 0 && (
                <div className="space-y-2 mb-4">
                  {result.errors.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 p-3 rounded-lg" style={{ background: 'rgba(244,63,94,0.08)' }}>
                      <XCircle size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--rose)' }} />
                      <div>
                        <p className="text-xs font-semibold" style={{ color: 'var(--rose)' }}>{e.field}</p>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{e.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {result.warnings.length > 0 && (
                <div className="space-y-2">
                  {result.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 p-3 rounded-lg" style={{ background: 'rgba(245,158,11,0.08)' }}>
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--amber)' }} />
                      <div>
                        <p className="text-xs font-semibold" style={{ color: 'var(--amber)' }}>{w.field}</p>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{w.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="glass rounded-2xl p-12 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--bg-surface)' }}>
                <FileCheck size={24} style={{ color: 'var(--text-dim)' }} />
              </div>
              <p className="font-medium mb-1" style={{ fontFamily: 'var(--font-display)' }}>Pre-Validación</p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Ingresa los datos del pedimento para validar antes de transmitir</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
