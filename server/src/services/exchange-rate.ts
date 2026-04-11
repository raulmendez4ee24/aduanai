// Tipo de cambio USD/MXN
// En producción se conectaría a la API de Banxico
// Por ahora usamos un cache simple con fallback

let cachedRate: { rate: number; timestamp: number } | null = null;
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 horas

export async function getExchangeRate(): Promise<number> {
  // Return cached if fresh
  if (cachedRate && Date.now() - cachedRate.timestamp < CACHE_TTL) {
    return cachedRate.rate;
  }

  try {
    // Intentar obtener de una API pública gratuita
    const res = await fetch(
      'https://api.exchangerate-api.com/v4/latest/USD',
      { signal: AbortSignal.timeout(5000) }
    );

    if (res.ok) {
      const data = await res.json() as { rates?: { MXN?: number } };
      const rate = data.rates?.MXN;
      if (rate && typeof rate === 'number') {
        cachedRate = { rate, timestamp: Date.now() };
        console.log(`💱 Tipo de cambio actualizado: $${rate.toFixed(2)} MXN/USD`);
        return rate;
      }
    }
  } catch {
    // Fallback silencioso
  }

  // Fallback
  return cachedRate?.rate ?? 17.5;
}
