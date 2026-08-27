/**
 * IEPS por categoría para el cotizador (Ola 2).
 *
 * Fuente: tabla `IEPSRate` (sembrada en prisma/seed/regimes-programs.ts —
 * combustibles, alcohol, tabaco, bebidas saborizadas, alta densidad calórica,
 * plaguicidas). Esa siembra NO trae nota de cotejo contra la LIEPS/DOF, así
 * que cada tasa aplicada se etiqueta `cotejo: 'sin_verificar'` salvo que la
 * fila diga lo contrario en `notes` ("cotejado"). Si la fracción no tiene
 * tasa cargada → 0 con la nota "IEPS: sin tasa cargada para esta fracción".
 * Nunca se inventa una tasa.
 *
 * Cálculo (LIEPS Art. 14 / LIVA Art. 27): base = valor en aduana + IGI + DTA +
 * cuota compensatoria (preIVABase); ad valorem = base × tasa; específica =
 * cantidad (litros/kg…) × cuota. El IEPS forma parte de la base del IVA.
 */
import { prisma } from '../lib/prisma';

export interface TasaIEPSCargada {
  fractionCode: string;
  matchType: string;
  productCategory: string;
  rate: number;
  rateType: string;   // 'ad_valorem' | 'specific'
  unit: string | null;
  description: string | null;
  decree: string | null;
  notes: string | null;
  effectiveDate: Date;
  expiryDate: Date | null;
}

export interface IEPSResuelto {
  aplica: boolean;
  /** % ad valorem sobre preIVABase (0 si específica o sin tasa). */
  pct: number;
  /** Monto MXN si la tasa es específica (0 si ad valorem o sin tasa). */
  montoEspecificoMXN: number;
  categoria: string | null;
  tasa: number;
  tipoTasa: 'ad_valorem' | 'specific' | null;
  unidad: string | null;
  matchType: string | null;
  cotejo: 'verificado' | 'sin_verificar' | 'sin_tasa';
  nota: string;
  fundamento: string | null;
}

export const NOTA_SIN_TASA = 'IEPS: sin tasa cargada para esta fracción';

/** Puro: aplica una tasa ya resuelta (o null) a cantidad/unidad. */
export function aplicarTasaIEPS(
  tasa: TasaIEPSCargada | null,
  ctx: { quantity?: number; unit?: string | null },
): IEPSResuelto {
  if (!tasa) {
    return { aplica: false, pct: 0, montoEspecificoMXN: 0, categoria: null, tasa: 0, tipoTasa: null, unidad: null, matchType: null, cotejo: 'sin_tasa', nota: NOTA_SIN_TASA, fundamento: null };
  }
  const cotejado = /cotejad/i.test(tasa.notes ?? '');
  const cotejo: IEPSResuelto['cotejo'] = cotejado ? 'verificado' : 'sin_verificar';
  const sufijoCotejo = cotejado ? '' : ' · tasa de catálogo sin cotejo contra LIEPS/DOF — verifica antes de declarar';
  const fundamento = tasa.decree ?? 'LIEPS Art. 2 (tasas) y Art. 14 (base en importación)';
  if (tasa.rateType === 'specific') {
    const qty = ctx.quantity ?? 0;
    const unidadOk = !tasa.unit || !ctx.unit || tasa.unit.toLowerCase().includes((ctx.unit ?? '').toLowerCase().replace(/s$/, '').slice(0, 2));
    const monto = qty > 0 ? Math.round(qty * tasa.rate * 100) / 100 : 0;
    const nota = qty > 0
      ? `IEPS específico ${tasa.productCategory}: ${tasa.rate} ${tasa.unit ?? ''} × ${qty} = $${monto.toFixed(2)} MXN${unidadOk ? '' : ` (unidad declarada "${ctx.unit}" no coincide con ${tasa.unit} — revisa la cantidad)`}${sufijoCotejo}`
      : `IEPS específico ${tasa.productCategory}: ${tasa.rate} ${tasa.unit ?? ''} — declara cantidad en ${tasa.unit ?? 'la unidad de la cuota'} para calcular el monto${sufijoCotejo}`;
    return { aplica: true, pct: 0, montoEspecificoMXN: monto, categoria: tasa.productCategory, tasa: tasa.rate, tipoTasa: 'specific', unidad: tasa.unit, matchType: tasa.matchType, cotejo, nota, fundamento };
  }
  return {
    aplica: true, pct: tasa.rate, montoEspecificoMXN: 0, categoria: tasa.productCategory, tasa: tasa.rate, tipoTasa: 'ad_valorem', unidad: tasa.unit ?? '%', matchType: tasa.matchType, cotejo,
    nota: `IEPS ${tasa.rate}% (${tasa.productCategory}${tasa.description ? ` — ${tasa.description}` : ''}) sobre valor en aduana + IGI + DTA + cuota${tasa.matchType === 'prefix' ? ` · aplicado por prefijo ${tasa.fractionCode}` : ''}${sufijoCotejo}`,
    fundamento,
  };
}

/** Busca la tasa vigente: fracción exacta (8 dígitos) y después prefijos 6/4/2. */
export async function buscarTasaIEPS(fractionCode: string): Promise<TasaIEPSCargada | null> {
  const clean = fractionCode.replace(/[^0-9]/g, '');
  if (!clean) return null;
  const now = new Date();
  const vigente = { active: true, effectiveDate: { lte: now }, OR: [{ expiryDate: null }, { expiryDate: { gte: now } }] };
  let row = await prisma.iEPSRate.findFirst({ where: { ...vigente, fractionCode: clean.slice(0, 8), matchType: 'exact' } });
  if (!row) {
    for (const len of [6, 4, 2]) {
      if (clean.length < len) continue;
      row = await prisma.iEPSRate.findFirst({ where: { ...vigente, fractionCode: clean.slice(0, len), matchType: 'prefix' }, orderBy: { fractionCode: 'desc' } });
      if (row) break;
    }
  }
  return row;
}

export async function resolverIEPS(input: { fractionCode: string; quantity?: number; unit?: string | null }): Promise<IEPSResuelto> {
  const tasa = await buscarTasaIEPS(input.fractionCode);
  return aplicarTasaIEPS(tasa, { quantity: input.quantity, unit: input.unit });
}
