/**
 * Servicio único de tipo de cambio USD/MXN.
 *
 * Política:
 *  - Fuente oficial: Banxico SIE serie SF43718 (FIX USD/MXN para solventar
 *    obligaciones, publicado por el DOF). Requiere BANXICO_TOKEN.
 *  - Fallback: exchangerate-api.com (referencial, source='fallback') si
 *    Banxico no responde o no hay token configurado.
 *  - Persistencia: tabla `ExchangeRate` con `source` ∈ {banxico, fallback,
 *    synthetic, manual}. La lectura siempre prefiere el row más reciente
 *    en DB; sólo si no hay nada del día y se necesita refresh, se llama al
 *    proveedor externo.
 *  - TODOS los módulos consumen este módulo (cotizador, pre-validador,
 *    MVE, etc.). Garantiza que un mismo día → mismo TC en todo el sistema.
 *  - Cron diario (`refreshOfficialRate()`) corre en index.ts para mantener
 *    la tabla al día sin depender de la primera consulta del usuario.
 */

import { prisma } from '../lib/prisma';
import { logger } from './../lib/logger';

const FALLBACK_RATE = 17.5;

/** Resultado enriquecido con metadatos para UI. */
export interface OfficialRate {
  rate: number;
  source: 'banxico' | 'fallback' | 'synthetic' | 'manual';
  asOf: Date;
  /** true si el row leído proviene de Banxico (DOF). */
  isOfficial: boolean;
  /** Si tuvimos que usar un rate desactualizado o sintético. */
  warning: string | null;
}

function todayUTC(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * TC más reciente en DB (cualquier fuente). Si no hay registros se
 * intenta un refresh externo. Si todo falla, FALLBACK_RATE.
 *
 * SHARED entry-point — debe ser la única forma en que los módulos
 * resuelven "el TC del día" para mantener consistencia entre cotizador,
 * pre-validador, MVE y demás.
 */
export async function getExchangeRate(): Promise<number> {
  const today = todayUTC();
  const latest = await prisma.exchangeRate.findFirst({
    where: { date: { lte: today } },
    orderBy: { date: 'desc' },
  });
  if (latest) return latest.rate;

  const refreshed = await refreshOfficialRate().catch(() => null);
  if (refreshed) return refreshed.rate;

  return FALLBACK_RATE;
}

/**
 * Devuelve el rate con metadatos (source, asOf, isOfficial, warning).
 * Para UI: para mostrar "TC DOF $17.4920 (Banxico, 13/may/2026)" o
 * advertir cuando se está usando un sintético.
 */
export async function getOfficialRate(): Promise<OfficialRate> {
  const today = todayUTC();
  const latest = await prisma.exchangeRate.findFirst({
    where: { date: { lte: today } },
    orderBy: { date: 'desc' },
  });

  if (latest) {
    const source = (['banxico', 'fallback', 'synthetic', 'manual'].includes(latest.source)
      ? latest.source : 'manual') as OfficialRate['source'];
    const ageDays = Math.floor((today.getTime() - latest.date.getTime()) / 86400000);
    let warning: string | null = null;
    if (source === 'synthetic') {
      warning = 'TC referencial sintético — no es DOF. Verifica con tu agente aduanal antes de pagar contribuciones.';
    } else if (source === 'fallback') {
      warning = 'TC obtenido de fuente alternativa (no Banxico). Para pagos oficiales usa el DOF del día.';
    } else if (ageDays >= 2) {
      warning = `Último TC oficial es de hace ${ageDays} días (${latest.date.toISOString().slice(0, 10)}). Banxico no ha respondido recientemente.`;
    }
    return {
      rate: latest.rate,
      source,
      asOf: latest.date,
      isOfficial: source === 'banxico',
      warning,
    };
  }

  const refreshed = await refreshOfficialRate().catch(() => null);
  if (refreshed) return refreshed;

  return {
    rate: FALLBACK_RATE,
    source: 'fallback',
    asOf: today,
    isOfficial: false,
    warning: 'No hay datos de TC en la base ni se pudo contactar a Banxico. Usando valor por defecto.',
  };
}

/** Banxico SIE — serie SF43718 (FIX USD/MXN). */
async function fetchBanxicoFIX(token: string): Promise<{ rate: number; asOf: Date } | null> {
  const url = `https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF43718/datos/oportuno?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const data = await res.json() as {
    bmx?: { series?: { datos?: { fecha: string; dato: string }[] }[] };
  };
  const datos = data.bmx?.series?.[0]?.datos;
  if (!datos || datos.length === 0) return null;
  const last = datos[datos.length - 1];
  const rate = parseFloat(last.dato.replace(/,/g, ''));
  if (!Number.isFinite(rate) || rate <= 0) return null;
  // Banxico devuelve fecha dd/mm/aaaa
  const [day, month, year] = last.fecha.split('/').map(n => parseInt(n, 10));
  const asOf = new Date(Date.UTC(year, month - 1, day));
  return { rate, asOf };
}

/** Provider de respaldo cuando Banxico no responde. Marcado como 'fallback'. */
async function fetchFallbackRate(): Promise<{ rate: number; asOf: Date } | null> {
  const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD', { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return null;
  const data = await res.json() as { rates?: { MXN?: number } };
  const rate = data.rates?.MXN;
  if (!rate || typeof rate !== 'number') return null;
  return { rate, asOf: todayUTC() };
}

/**
 * Refresca el TC oficial desde Banxico (preferente) o proveedor de
 * respaldo. Persiste en DB con la fuente correcta. Idempotente por día.
 * Usado por el cron diario y como fallback cuando no hay datos.
 */
export async function refreshOfficialRate(): Promise<OfficialRate | null> {
  const token = process.env.BANXICO_TOKEN;

  let result: { rate: number; asOf: Date } | null = null;
  let source: OfficialRate['source'] = 'fallback';

  if (token) {
    try {
      result = await fetchBanxicoFIX(token);
      if (result) source = 'banxico';
    } catch (err) {
      logger.warn('Banxico FIX fetch failed; falling back', {
        action: 'exchange_rate_banxico_fail',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (!result) {
    try {
      result = await fetchFallbackRate();
      if (result) source = 'fallback';
    } catch (err) {
      logger.warn('Fallback exchange-rate provider failed', {
        action: 'exchange_rate_fallback_fail',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (!result) return null;

  await prisma.exchangeRate.upsert({
    where: { date: result.asOf },
    update: { rate: result.rate, source },
    create: { date: result.asOf, rate: result.rate, source },
  });

  return {
    rate: result.rate,
    source,
    asOf: result.asOf,
    isOfficial: source === 'banxico',
    warning: source === 'fallback'
      ? 'TC obtenido de fuente alternativa (no Banxico). Para pagos oficiales usa el DOF del día.'
      : null,
  };
}

/**
 * TC para una fecha específica. Si no hay registro exacto, el inmediatamente
 * anterior (no devuelve nada futuro). Si no hay nada → rate actual.
 */
export async function getHistoricalRate(date: Date): Promise<number> {
  const target = new Date(date);
  target.setUTCHours(0, 0, 0, 0);

  const exact = await prisma.exchangeRate.findUnique({ where: { date: target } });
  if (exact) return exact.rate;

  const previous = await prisma.exchangeRate.findFirst({
    where: { date: { lte: target } },
    orderBy: { date: 'desc' },
  });
  if (previous) return previous.rate;

  return await getExchangeRate();
}

/** Promedio del último mes (30 días). */
export async function getMonthlyAverageRate(): Promise<number> {
  const since = new Date(Date.now() - 30 * 86400000);
  since.setUTCHours(0, 0, 0, 0);
  const rates = await prisma.exchangeRate.findMany({
    where: { date: { gte: since } },
    orderBy: { date: 'desc' },
  });
  if (rates.length === 0) return await getExchangeRate();
  const sum = rates.reduce((s, r) => s + r.rate, 0);
  return Math.round((sum / rates.length) * 10000) / 10000;
}

/** Rates últimos N días (orden cronológico ASC). */
export async function getRecentRates(days = 90): Promise<{ date: string; rate: number; source: string }[]> {
  const since = new Date(Date.now() - days * 86400000);
  since.setUTCHours(0, 0, 0, 0);
  const rates = await prisma.exchangeRate.findMany({
    where: { date: { gte: since } },
    orderBy: { date: 'asc' },
  });
  return rates.map(r => ({ date: r.date.toISOString().slice(0, 10), rate: r.rate, source: r.source }));
}

/**
 * Sembrado de 90 días sintéticos anclados al TC actual ± deriva pequeña.
 * Para demo / fallback hasta integrar Banxico real. Marca source='synthetic'
 * para que getOfficialRate() pueda advertir.
 */
export async function seedSyntheticHistory(daysBack = 90): Promise<number> {
  const baseRate = await getExchangeRate();
  let inserted = 0;
  for (let d = daysBack; d >= 0; d--) {
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    day.setUTCDate(day.getUTCDate() - d);
    const driftPct = Math.sin(d * 0.13) * 0.02 + (d / daysBack) * -0.01;
    const rate = Math.round(baseRate * (1 + driftPct) * 10000) / 10000;
    await prisma.exchangeRate.upsert({
      where: { date: day },
      update: {}, // si ya existe (banxico/fallback), no sobrescribir con sintético
      create: { date: day, rate, source: 'synthetic' },
    });
    inserted++;
  }
  return inserted;
}
