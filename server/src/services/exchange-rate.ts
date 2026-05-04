// Tipo de cambio USD/MXN — Banxico SIE en producción.
// Por ahora: cache en memoria + tabla ExchangeRate como historia persistente.

import { prisma } from '../lib/prisma';

let cachedRate: { rate: number; timestamp: number } | null = null;
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 horas

export async function getExchangeRate(): Promise<number> {
  if (cachedRate && Date.now() - cachedRate.timestamp < CACHE_TTL) {
    return cachedRate.rate;
  }

  try {
    const res = await fetch(
      'https://api.exchangerate-api.com/v4/latest/USD',
      { signal: AbortSignal.timeout(5000) }
    );

    if (res.ok) {
      const data = await res.json() as { rates?: { MXN?: number } };
      const rate = data.rates?.MXN;
      if (rate && typeof rate === 'number') {
        cachedRate = { rate, timestamp: Date.now() };
        // Persistir el rate del día en la tabla histórica
        const today = todayUTC();
        await prisma.exchangeRate.upsert({
          where: { date: today },
          update: { rate, source: 'live' },
          create: { date: today, rate, source: 'live' },
        }).catch(() => {});
        return rate;
      }
    }
  } catch { /* fallback */ }

  return cachedRate?.rate ?? 17.5;
}

function todayUTC(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Devuelve el TC para una fecha específica. Si no hay registro exacto,
 * busca el más reciente <= fecha. Si tampoco hay nada, usa rate actual.
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

/**
 * Promedio del último mes (30 días).
 */
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

/**
 * Rates últimos N días (orden cronológico ASC).
 */
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
 * Para demo / fallback hasta integrar Banxico real.
 */
export async function seedSyntheticHistory(daysBack = 90): Promise<number> {
  const baseRate = await getExchangeRate();
  let inserted = 0;
  for (let d = daysBack; d >= 0; d--) {
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    day.setUTCDate(day.getUTCDate() - d);
    // Drift suave determinista basado en day-index
    const driftPct = Math.sin(d * 0.13) * 0.02 + (d / daysBack) * -0.01; // ±2% + leve tendencia
    const rate = Math.round(baseRate * (1 + driftPct) * 10000) / 10000;
    await prisma.exchangeRate.upsert({
      where: { date: day },
      update: {}, // si ya existe (live), no sobrescribir
      create: { date: day, rate, source: d === 0 ? 'live' : 'synthetic' },
    });
    inserted++;
  }
  return inserted;
}
