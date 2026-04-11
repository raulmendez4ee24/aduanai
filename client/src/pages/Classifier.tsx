import { useState } from 'react';
import { Search, AlertTriangle, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown, AlertCircle, Download } from 'lucide-react';
import { api, type ClassificationResult } from '../lib/api';
import { generateClassificationPDF } from '../lib/pdf-classify';

export function ClassifierPage() {
  const [description, setDescription] = useState('');
  const [context, setContext] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [error, setError] = useState('');
  const [showTechnical, setShowTechnical] = useState(false);
  const [classificationId, setClassificationId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleClassify(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);

    try {
      const res = await api.classify(description, context || undefined);
      setResult(res.data);
      setClassificationId((res as unknown as { classificationId: string }).classificationId);
      setFeedback(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al clasificar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Clasificador Arancelario IA</h1>
        <p className="text-slate-400">Describe tu producto y obtén la fracción TIGIE + NICO</p>
      </div>

      {/* Input */}
      <form onSubmit={handleClassify} className="bg-[#0D1B2A] border border-[#1B2D45] rounded-xl p-6 mb-6">
        <div className="mb-4">
          <label className="block text-sm text-slate-400 mb-1.5">Descripción del producto</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-[#1B2D45] border border-[#243656] rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-[#C9A84C] transition-colors min-h-[100px] resize-y"
            placeholder='Ej: "Tornillos de acero inoxidable de cabeza hexagonal, diámetro 10mm, para uso industrial"'
            required
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm text-slate-400 mb-1.5">Contexto adicional (opcional)</label>
          <input
            type="text"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            className="w-full bg-[#1B2D45] border border-[#243656] rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-[#C9A84C] transition-colors"
            placeholder="Ej: uso, material específico, país de origen..."
          />
        </div>
        <button
          type="submit"
          disabled={loading || description.trim().length < 3}
          className="bg-[#C9A84C] hover:bg-[#A68A3E] text-[#0A1628] font-semibold px-6 py-2.5 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          <Search size={16} />
          {loading ? 'Clasificando...' : 'Clasificar'}
        </button>
      </form>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-5 py-4 mb-6">
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-4">
          {/* Main result */}
          <div className="bg-[#0D1B2A] border border-[#C9A84C]/20 rounded-xl p-6 animate-fade-in">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-sm text-[#C9A84C] font-medium mb-1">Fracción Arancelaria</p>
                <p className="text-3xl font-bold text-white font-mono">{result.fraction.code}</p>
                <p className="text-slate-300 mt-1">{result.fraction.description}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-400">Confianza</p>
                <p className={`text-2xl font-bold ${
                  result.confidence >= 80 ? 'text-green-400' :
                  result.confidence >= 60 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {result.confidence}%
                </p>
              </div>
            </div>

            {result.nico && (
              <p className="text-sm text-slate-400">
                NICO: <span className="text-white font-mono">{result.nico}</span>
              </p>
            )}
          </div>

          {/* Explanation toggle */}
          <div className="bg-[#0D1B2A] border border-[#1B2D45] rounded-xl p-6 animate-fade-in delay-100">
            <button
              onClick={() => setShowTechnical(!showTechnical)}
              className="flex items-center gap-2 text-sm text-[#C9A84C] mb-3"
            >
              {showTechnical ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showTechnical ? 'Ver explicación simple' : 'Ver explicación técnica'}
            </button>
            <p className="text-slate-300 text-sm leading-relaxed">
              {showTechnical ? result.explanation.technical : result.explanation.simple}
            </p>
          </div>

          {/* GRI */}
          {result.griApplied.length > 0 && (
            <div className="bg-[#0D1B2A] border border-[#1B2D45] rounded-xl p-6 animate-fade-in delay-200">
              <h3 className="text-sm font-medium text-white mb-3">Reglas Generales Interpretativas aplicadas</h3>
              <ul className="space-y-1">
                {result.griApplied.map((gri, i) => (
                  <li key={i} className="text-sm text-slate-400">{gri}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Tariffs */}
          <div className="bg-[#0D1B2A] border border-[#1B2D45] rounded-xl p-6 animate-fade-in delay-300">
            <h3 className="text-sm font-medium text-white mb-3">Aranceles</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-slate-500">NMF</p>
                <p className="text-lg font-semibold text-white">{result.tariffs.nmf}%</p>
              </div>
              {Object.entries(result.tariffs.preferential).map(([treaty, rate]) => (
                <div key={treaty}>
                  <p className="text-xs text-slate-500">{treaty}</p>
                  <p className="text-lg font-semibold text-green-400">{rate}%</p>
                </div>
              ))}
            </div>
          </div>

          {/* Regulations */}
          <div className="bg-[#0D1B2A] border border-[#1B2D45] rounded-xl p-6 animate-fade-in delay-400">
            <h3 className="text-sm font-medium text-white mb-3">Regulaciones</h3>
            {result.regulations.rrna.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-slate-500 mb-1">RRNA</p>
                {result.regulations.rrna.map((r, i) => (
                  <span key={i} className="inline-block bg-yellow-500/10 text-yellow-400 text-xs px-2 py-1 rounded mr-2 mb-1">{r}</span>
                ))}
              </div>
            )}
            {result.regulations.noms.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-slate-500 mb-1">NOMs aplicables</p>
                {result.regulations.noms.map((n, i) => (
                  <span key={i} className="inline-block bg-blue-500/10 text-blue-400 text-xs px-2 py-1 rounded mr-2 mb-1">{n}</span>
                ))}
              </div>
            )}
            {result.regulations.sectoralRegistry && (
              <div className="flex items-center gap-2 text-amber-400 text-sm">
                <AlertTriangle size={14} />
                Requiere padrón sectorial
              </div>
            )}
          </div>

          {/* Alternatives */}
          {result.alternatives.length > 0 && (
            <div className="bg-[#0D1B2A] border border-[#1B2D45] rounded-xl p-6 animate-fade-in delay-500">
              <h3 className="text-sm font-medium text-white mb-3">Fracciones alternativas</h3>
              <div className="space-y-3">
                {result.alternatives.map((alt, i) => (
                  <div key={i} className="flex items-start justify-between border-b border-[#1B2D45] pb-3 last:border-0">
                    <div>
                      <p className="font-mono text-white">{alt.code}</p>
                      <p className="text-sm text-slate-400">{alt.description}</p>
                      <p className="text-xs text-slate-500 mt-1">{alt.reason}</p>
                    </div>
                    <span className="text-sm text-slate-400">{alt.confidence}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Feedback */}
          {classificationId && (
            <div className="bg-[#0D1B2A] border border-[#1B2D45] rounded-xl p-6">
              <p className="text-sm text-slate-400 mb-3">¿Esta clasificación es correcta?</p>
              <div className="flex gap-3">
                {[
                  { value: 'correct', label: 'Correcta', icon: ThumbsUp, color: 'green' },
                  { value: 'partial', label: 'Parcial', icon: AlertCircle, color: 'yellow' },
                  { value: 'incorrect', label: 'Incorrecta', icon: ThumbsDown, color: 'red' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={async () => {
                      await api.classifyFeedback(classificationId, opt.value as 'correct' | 'incorrect' | 'partial');
                      setFeedback(opt.value);
                    }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all ${
                      feedback === opt.value
                        ? `bg-${opt.color}-500/20 text-${opt.color}-400 border border-${opt.color}-500/30`
                        : 'bg-[#1B2D45] text-slate-400 hover:text-white'
                    }`}
                  >
                    <opt.icon size={14} />
                    {opt.label}
                  </button>
                ))}
              </div>
              {feedback && (
                <p className="text-xs text-slate-500 mt-3">Gracias por tu feedback. Esto mejora la precisión del clasificador.</p>
              )}
            </div>
          )}

          {/* Export PDF */}
          <button
            onClick={() => generateClassificationPDF(result, description)}
            className="flex items-center gap-2 bg-[#1B2D45] hover:bg-[#243656] text-slate-300 hover:text-white px-4 py-2.5 rounded-lg text-sm transition-colors"
          >
            <Download size={16} />
            Exportar PDF
          </button>

          {/* Disclaimer */}
          <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl px-5 py-4">
            <p className="text-xs text-amber-400/80 flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              {result.disclaimer}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
