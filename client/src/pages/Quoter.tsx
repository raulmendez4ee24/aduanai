import { useState, useEffect, useRef } from 'react';
import { Calculator, Download } from 'lucide-react';
import { api, type QuoteResult, type FractionSearchResult } from '../lib/api';
import { generateQuotePDF } from '../lib/pdf';

export function QuoterPage() {
  const [fractionCode, setFractionCode] = useState('');
  const [customsValue, setCustomsValue] = useState('');
  const [origin, setOrigin] = useState('');
  const [incoterm, setIncoterm] = useState('CIF');
  const [currency, setCurrency] = useState('USD');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QuoteResult | null>(null);
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState<FractionSearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    function handleClickOutside(e: Event) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFractionSearch = (value: string) => {
    setFractionCode(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.length < 2) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.searchFractions(value);
        setSuggestions(res.data);
        setShowSuggestions(true);
      } catch { /* ignore */ }
    }, 300);
  };

  async function handleQuote(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);

    try {
      const res = await api.quote({
        fractionCode,
        customsValue: Number(customsValue),
        origin,
        incoterm,
        currency,
      });
      setResult(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cotizar');
    } finally {
      setLoading(false);
    }
  }

  const fmt = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
  const fmtUSD = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Cotizador de Importación</h1>
        <p className="text-slate-400">Calcula el costo total de importación con desglose de impuestos</p>
      </div>

      <form onSubmit={handleQuote} className="bg-[#0D1B2A] border border-[#1B2D45] rounded-xl p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="relative" ref={suggestionsRef}>
            <label className="block text-sm text-slate-400 mb-1.5">Fracción arancelaria</label>
            <input
              type="text"
              value={fractionCode}
              onChange={(e) => handleFractionSearch(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              className="w-full bg-[#1B2D45] border border-[#243656] rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-[#C9A84C] transition-colors font-mono"
              placeholder="Buscar fracción..."
              required
              autoComplete="off"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-[#0D1B2A] border border-[#1B2D45] rounded-lg shadow-xl max-h-48 overflow-y-auto">
                {suggestions.map((f) => (
                  <button
                    key={f.code}
                    type="button"
                    onClick={() => {
                      setFractionCode(f.codeFormatted);
                      setShowSuggestions(false);
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-[#1B2D45] transition-colors"
                  >
                    <span className="font-mono text-white text-sm">{f.codeFormatted}</span>
                    <span className="text-xs text-slate-500 ml-2">NMF: {f.tariffNMF}%</span>
                    <p className="text-xs text-slate-400 truncate">{f.description}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1.5">Valor en aduana</label>
            <input
              type="number"
              value={customsValue}
              onChange={(e) => setCustomsValue(e.target.value)}
              className="w-full bg-[#1B2D45] border border-[#243656] rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-[#C9A84C] transition-colors"
              placeholder="10000"
              min="0"
              step="0.01"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1.5">País de origen</label>
            <input
              type="text"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              className="w-full bg-[#1B2D45] border border-[#243656] rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-[#C9A84C] transition-colors"
              placeholder="China, USA, Alemania..."
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">Incoterm</label>
              <select
                value={incoterm}
                onChange={(e) => setIncoterm(e.target.value)}
                className="w-full bg-[#1B2D45] border border-[#243656] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-[#C9A84C] transition-colors"
              >
                {['EXW', 'FOB', 'CIF', 'DDP', 'DAP', 'FCA', 'CFR'].map(i => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">Moneda</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full bg-[#1B2D45] border border-[#243656] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-[#C9A84C] transition-colors"
              >
                <option value="USD">USD</option>
                <option value="MXN">MXN</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="bg-[#C9A84C] hover:bg-[#A68A3E] text-[#0A1628] font-semibold px-6 py-2.5 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          <Calculator size={16} />
          {loading ? 'Calculando...' : 'Cotizar'}
        </button>
      </form>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-5 py-4 mb-6">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-[#0D1B2A] border border-[#C9A84C]/20 rounded-xl p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="text-xs text-slate-500">Valor en aduana</p>
                <p className="text-lg font-semibold text-white">{fmt(result.valueMXN)}</p>
                <p className="text-xs text-slate-500">{fmtUSD(result.customsValue)} {result.currency}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Total impuestos</p>
                <p className="text-lg font-semibold text-red-400">{fmt(result.totalTaxes)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Landed Cost MXN</p>
                <p className="text-xl font-bold text-[#C9A84C]">{fmt(result.totalLandedCost)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Landed Cost USD</p>
                <p className="text-xl font-bold text-white">{fmtUSD(result.totalLandedCostUSD)}</p>
              </div>
            </div>
          </div>

          {/* Export PDF */}
          <button
            onClick={() => generateQuotePDF(result)}
            className="flex items-center gap-2 bg-[#1B2D45] hover:bg-[#243656] text-slate-300 hover:text-white px-4 py-2.5 rounded-lg text-sm transition-colors"
          >
            <Download size={16} />
            Exportar PDF
          </button>

          {/* Breakdown */}
          <div className="bg-[#0D1B2A] border border-[#1B2D45] rounded-xl p-6">
            <h3 className="text-sm font-medium text-white mb-4">Desglose de impuestos</h3>
            <div className="space-y-3">
              {[
                { label: 'IGI (Impuesto General de Importación)', ...result.breakdown.igi },
                { label: 'DTA (Derecho de Trámite Aduanero)', ...result.breakdown.dta },
                { label: 'IVA', ...result.breakdown.iva },
              ].map((tax) => (
                <div key={tax.label} className="flex items-center justify-between border-b border-[#1B2D45] pb-2">
                  <div>
                    <p className="text-sm text-slate-300">{tax.label}</p>
                    <p className="text-xs text-slate-500">{tax.rate}%</p>
                  </div>
                  <p className="text-sm font-medium text-white">{fmt(tax.amount)}</p>
                </div>
              ))}
              {result.breakdown.ieps && (
                <div className="flex items-center justify-between border-b border-[#1B2D45] pb-2">
                  <div>
                    <p className="text-sm text-slate-300">IEPS</p>
                    <p className="text-xs text-slate-500">{result.breakdown.ieps.rate}%</p>
                  </div>
                  <p className="text-sm font-medium text-white">{fmt(result.breakdown.ieps.amount)}</p>
                </div>
              )}
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-300">Prevalidación</p>
                <p className="text-sm font-medium text-white">{fmt(result.breakdown.prevalidation)}</p>
              </div>
            </div>
          </div>

          {/* Preferential */}
          {result.preferential && result.preferential.length > 0 && (
            <div className="bg-green-500/5 border border-green-500/15 rounded-xl p-6">
              <h3 className="text-sm font-medium text-green-400 mb-3">Preferencias arancelarias disponibles</h3>
              {result.preferential.map((pref) => (
                <div key={pref.treaty} className="flex items-center justify-between">
                  <p className="text-sm text-slate-300">
                    {pref.treaty} — IGI preferencial: <span className="text-green-400 font-semibold">{pref.igi}%</span>
                  </p>
                  <p className="text-sm text-green-400">Ahorro: {(pref.savings * result.valueMXN).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
