/**
 * VIGILANTE DE DECRETOS DE TARIFA (P1, aprobado por Raúl 19-ago-2026).
 *
 * Vigila la página de reformas de la LIGIE en Diputados (la lista consolidada
 * oficial de "Decretos que modifican la Tarifa" — la misma fuente del cotejo
 * del lote 0.5) y detecta decretos con fecha DOF POSTERIOR a
 * TARIFF_VERSION.cotejoDate.
 *
 * REGLA DURA: este módulo SOLO AVISA — jamás escribe en Fraction ni aplica
 * cambios (el catálogo se toca con cotejo humano aprobado; un test de imports
 * lo garantiza, mismo patrón que el productor-sin-LLM). Alerta doble:
 *   1. SystemLog WARN action='tarifa_decreto_nuevo' {fechaDOF, url}
 *   2. Alerta IN_APP severity critical vía el generador existente
 *      (fingerprint = fecha del decreto → un aviso por decreto, sin spam).
 *
 * FAIL-CLOSED DEL PROPIO VIGILANTE: si Diputados no responde o el parse no
 * encuentra la sección, se registra 'tarifa_vigilante_fallo' — un vigilante
 * que calla cuando está ciego es el mismo bug que se mató en Pre-Glosa.
 */

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { TARIFF_VERSION } from '../lib/tariff-version';

export const URL_REFORMAS_LIGIE = 'https://www.diputados.gob.mx/LeyesBiblio/ref/ligie_2022.htm';

export interface DecretoDetectado {
  fechaDOF: string; // ISO (yyyy-mm-dd)
  url: string;      // enlace al PDF del decreto en Diputados
}

/** Parse determinista del HTML de la página de reformas: pares fecha DOF +
 *  href de decretos de tarifa (LIGIE_2022_tarifa*.pdf) y de reforma
 *  (LIGIE_2022_ref*.pdf). Exportado puro para test con fixture. */
export function parsearReformasLigie(html: string): DecretoDetectado[] {
  const out = new Map<string, DecretoDetectado>();
  // Los enlaces de Diputados: href="ligie_2022/LIGIE_2022_tarifa15_23abr26.pdf"
  const rePdf = /href="([^"]*LIGIE_2022_(?:tarifa|ref)[^"]*?(\d{2})([a-z]{3})(\d{2})\.pdf)"/gi;
  const MESES: Record<string, string> = {
    ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06',
    jul: '07', ago: '08', sep: '09', oct: '10', nov: '11', dic: '12',
  };
  let m: RegExpExecArray | null;
  while ((m = rePdf.exec(html)) !== null) {
    const [, href, dd, mesTxt, yy] = m;
    const mes = MESES[mesTxt!.toLowerCase()];
    if (!mes) continue;
    const fechaDOF = `20${yy}-${mes}-${dd}`;
    const url = href!.startsWith('http')
      ? href!
      : `https://www.diputados.gob.mx/LeyesBiblio/ref/${href}`;
    out.set(fechaDOF, { fechaDOF, url });
  }
  return [...out.values()].sort((a, b) => a.fechaDOF.localeCompare(b.fechaDOF));
}

/** Corre un ciclo de vigilancia. Devuelve los decretos nuevos detectados. */
export async function vigilarDecretosTarifa(
  fetchFn: typeof fetch = fetch,
): Promise<DecretoDetectado[]> {
  let html: string;
  try {
    const res = await fetchFn(URL_REFORMAS_LIGIE, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    logger.warn(`Vigilante de tarifa CIEGO: no pude leer la página de reformas — ${motivo}`, {
      action: 'tarifa_vigilante_fallo',
      metadata: { url: URL_REFORMAS_LIGIE, motivo },
    });
    return [];
  }

  const decretos = parsearReformasLigie(html);
  if (decretos.length === 0) {
    logger.warn('Vigilante de tarifa CIEGO: la página respondió pero el parse no encontró decretos (¿cambió el formato?)', {
      action: 'tarifa_vigilante_fallo',
      metadata: { url: URL_REFORMAS_LIGIE, motivo: 'parse vacío' },
    });
    return [];
  }

  const nuevos = decretos.filter(d => d.fechaDOF > TARIFF_VERSION.cotejoDate);
  for (const d of nuevos) {
    logger.warn(`DECRETO DE TARIFA NUEVO sin cotejar: DOF ${d.fechaDOF} — el catálogo (cotejo ${TARIFF_VERSION.cotejoDate}) puede estar desactualizado`, {
      action: 'tarifa_decreto_nuevo',
      metadata: { fechaDOF: d.fechaDOF, url: d.url, cotejoDate: TARIFF_VERSION.cotejoDate },
    });
    await crearAlertaSuperadmin(d);
  }
  return nuevos;
}

/** Alerta IN_APP para los tenants con algún SUPERADMIN, dedupeada por decreto. */
async function crearAlertaSuperadmin(d: DecretoDetectado): Promise<void> {
  try {
    const superadmins = await prisma.user.findMany({
      where: { role: 'SUPERADMIN', active: true },
      select: { tenantId: true },
      distinct: ['tenantId'],
    });
    for (const { tenantId } of superadmins) {
      const fingerprint = `tarifa_decreto_nuevo|${d.fechaDOF}|${tenantId}`;
      const existente = await prisma.alert.findFirst({ where: { tenantId, fingerprint } });
      if (existente) continue;
      await prisma.alert.create({
        data: {
          tenantId,
          type: 'tarifa_decreto_nuevo',
          channel: 'IN_APP',
          severity: 'critical',
          title: `Decreto de tarifa nuevo en DOF ${d.fechaDOF} — catálogo sin cotejar`,
          content: `Diputados lista un decreto que modifica la Tarifa LIGIE publicado en DOF ${d.fechaDOF}, POSTERIOR al último cotejo del catálogo (${TARIFF_VERSION.cotejoDate}). Las tasas del catálogo pueden estar desactualizadas. NO se aplicó ningún cambio automático: revisa el decreto y ordena el cotejo. Enlace: ${d.url}`,
          fingerprint,
        },
      });
    }
  } catch (err) {
    logger.warn(`Vigilante de tarifa: no pude crear la alerta IN_APP — ${err instanceof Error ? err.message : err}`, {
      action: 'tarifa_vigilante_fallo',
      metadata: { fase: 'alerta', fechaDOF: d.fechaDOF },
    });
  }
}
