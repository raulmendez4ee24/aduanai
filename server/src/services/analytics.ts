/**
 * Analytics real (Ola 3): tres preguntas por cliente y periodo, todo derivado
 * de tablas del tenant. Cada cifra sale con su FÓRMULA visible y sus
 * conteos base, para que "cuadre con el Historial":
 *
 *   totales.clasificaciones === count(Classification where tenantId [+clienteId])
 *   (el MISMO where que GET /api/classify/history)
 *   totales.cotizaciones    === count(Quote where tenantId [+clienteId])
 *
 * (a) AHORRO — T-MEC no aplicado, PROSEC no usado, ahorro aplicado.
 * (b) RIESGO — fracciones sensibles presentes en MIS operaciones, aduanas con
 *     reconocimiento alto según MIS simulaciones de Pre-Glosa y Risk Scorer.
 * (c) EQUIPO — clasificaciones por usuario, tiempo medio de job, % validado.
 *
 * Nada se estima "a ojo": si falta la tasa de la fracción en el catálogo, la
 * partida se cuenta en `sinTasa` y NO suma al ahorro.
 */
import { prisma } from '../lib/prisma';
import { esMiembroTMEC } from '../lib/treaties';

export interface FiltroAnalytics {
  tenantId: string;
  clienteId?: string;
  desde: Date;
  hasta: Date;
}

export interface LineaAhorro {
  origen: 'clasificacion' | 'cotizacion';
  id: string;
  fecha: string;
  fractionCode: string;
  pais: string;
  valorUSD: number;
  tasaAplicada: number | null;
  tasaGeneral: number | null;
  tasaPreferencial: number | null;
  ahorroUSD: number;
  detalle: string;
}

export interface AnalyticsReal {
  filtro: { tenantId: string; clienteId: string | null; desde: string; hasta: string };
  totales: {
    clasificaciones: number;
    cotizaciones: number;
    clasificacionesPeriodo: number;
    cotizacionesPeriodo: number;
    formula: string;
  };
  ahorro: {
    tmecNoAplicado: { totalUSD: number; lineas: LineaAhorro[]; sinTasa: number; formula: string };
    prosecNoUsado: { totalUSD: number; lineas: (LineaAhorro & { sector: string; cotejado: boolean })[]; formula: string; nota: string };
    aplicado: { totalUSD: number; lineas: LineaAhorro[]; formula: string };
  };
  riesgo: {
    fraccionesSensibles: {
      fractionCode: string;
      apariciones: number;
      valorUSD: number;
      cuotaCompensatoria: { paises: string[]; count: number };
      nomObligatoria: string[];
      precioEstimado: boolean;
      anexo10: string | null;
    }[];
    formula: string;
    aduanas: { customsCode: string; simulaciones: number; raPromedio: number; riesgoPromedio: number; nivelAlto: number }[];
    formulaAduanas: string;
    riskScorer: { evaluaciones: number; bandas: Record<string, number>; exposicionPromedio: number | null };
  };
  equipo: {
    porUsuario: { userId: string; nombre: string; email: string; clasificaciones: number; validadas: number; correctas: number; pctValidado: number | null; pctCorrecto: number | null; tiempoMedioSeg: number | null; jobs: number }[];
    formula: string;
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const iso = (d: Date) => d.toISOString();

export async function calcularAnalytics(f: FiltroAnalytics): Promise<AnalyticsReal> {
  const baseCls = { tenantId: f.tenantId, ...(f.clienteId ? { clienteId: f.clienteId } : {}) };
  const baseQuote = { tenantId: f.tenantId, ...(f.clienteId ? { clienteId: f.clienteId } : {}) };
  const periodo = { gte: f.desde, lte: f.hasta };

  const [totalCls, totalQuotes, clsPeriodo, quotesPeriodo] = await Promise.all([
    prisma.classification.count({ where: baseCls }),
    prisma.quote.count({ where: baseQuote }),
    prisma.classification.findMany({
      where: { ...baseCls, createdAt: periodo },
      select: { id: true, createdAt: true, fractionCode: true, inputCountryOfOrigin: true, inputDeclaredValueUSD: true, userId: true, feedback: true },
    }),
    prisma.quote.findMany({
      where: { ...baseQuote, createdAt: periodo },
      select: { id: true, createdAt: true, origin: true, items: { select: { id: true, fractionCode: true, countryOfOrigin: true, customsValueUSD: true, igiRate: true } } },
    }),
  ]);

  // ── Catálogo de tasas para las fracciones que aparecen ──
  const codes = new Set<string>();
  for (const c of clsPeriodo) codes.add(c.fractionCode.replace(/\D/g, ''));
  for (const q of quotesPeriodo) for (const it of q.items) codes.add(it.fractionCode.replace(/\D/g, ''));
  const codeList = [...codes];
  const prefijos = new Set<string>();
  for (const c of codeList) { prefijos.add(c.slice(0, 2)); prefijos.add(c.slice(0, 4)); prefijos.add(c.slice(0, 6)); }

  const [fracciones, prosecRows, cuotas, regsNom, precios, padrones] = await Promise.all([
    codeList.length ? prisma.fraction.findMany({ where: { code: { in: codeList } }, select: { code: true, tariffNMF: true, tariffTMEC: true } }) : [],
    codeList.length ? prisma.pROSECEligibility.findMany({ where: { active: true, OR: [{ matchType: 'exact', fractionCode: { in: codeList } }, { matchType: 'prefix', fractionCode: { in: [...prefijos] } }] } }) : [],
    codeList.length ? prisma.antidumpingDuty.findMany({ where: { active: true, status: 'vigente', fractionCode: { in: codeList } }, select: { fractionCode: true, countryOfOrigin: true } }) : [],
    codeList.length ? prisma.fractionRegulation.findMany({ where: { active: true, type: 'NOM', required: true, OR: [{ matchType: 'exact', fractionCode: { in: codeList } }, { matchType: 'prefix', fractionCode: { in: [...prefijos] } }] }, select: { fractionCode: true, matchType: true, code: true } }) : [],
    codeList.length ? prisma.estimatedPrice.findMany({ where: { active: true, fractionCode: { in: codeList } }, select: { fractionCode: true } }) : [],
    codeList.length ? prisma.fractionRegulation.findMany({ where: { active: true, type: 'padron_sectorial', OR: [{ matchType: 'exact', fractionCode: { in: codeList } }, { matchType: 'prefix', fractionCode: { in: [...prefijos] } }] }, select: { fractionCode: true, matchType: true, code: true } }) : [],
  ]);
  const tasas = new Map(fracciones.map(x => [x.code, x]));
  const prosecDe = (code: string) => prosecRows.find(p => (p.matchType === 'exact' && p.fractionCode === code) || (p.matchType === 'prefix' && code.startsWith(p.fractionCode)));
  const coincide = <R extends { fractionCode: string; matchType: string }>(rows: R[], code: string): R[] => rows.filter(r => (r.matchType === 'exact' && r.fractionCode === code) || (r.matchType === 'prefix' && code.startsWith(r.fractionCode)));

  // ── (a) AHORRO ──
  const tmecLineas: LineaAhorro[] = [];
  const aplicadoLineas: LineaAhorro[] = [];
  const prosecLineas: (LineaAhorro & { sector: string; cotejado: boolean })[] = [];
  let sinTasa = 0;

  for (const c of clsPeriodo) {
    const pais = (c.inputCountryOfOrigin ?? '').trim();
    const valor = c.inputDeclaredValueUSD ?? 0;
    if (!pais || !esMiembroTMEC(pais) || valor <= 0) continue;
    const t = tasas.get(c.fractionCode.replace(/\D/g, ''));
    if (!t || t.tariffNMF == null || t.tariffTMEC == null) { sinTasa++; continue; }
    const diff = t.tariffNMF - t.tariffTMEC;
    if (diff <= 0) continue;
    // Una clasificación no aplica arancel: es ahorro POTENCIAL si se despacha con certificación.
    tmecLineas.push({ origen: 'clasificacion', id: c.id, fecha: iso(c.createdAt), fractionCode: c.fractionCode, pais, valorUSD: valor, tasaAplicada: null, tasaGeneral: t.tariffNMF, tasaPreferencial: t.tariffTMEC, ahorroUSD: r2(valor * diff / 100), detalle: 'Clasificación con origen T-MEC: potencial si se acredita origen al despachar' });
  }
  for (const q of quotesPeriodo) {
    for (const it of q.items) {
      const pais = (it.countryOfOrigin ?? q.origin ?? '').trim();
      const code = it.fractionCode.replace(/\D/g, '');
      const t = tasas.get(code);
      const valor = it.customsValueUSD;
      if (pais && esMiembroTMEC(pais) && valor > 0) {
        if (!t || t.tariffNMF == null || t.tariffTMEC == null) { sinTasa++; }
        else if (it.igiRate > t.tariffTMEC) {
          tmecLineas.push({ origen: 'cotizacion', id: q.id, fecha: iso(q.createdAt), fractionCode: it.fractionCode, pais, valorUSD: valor, tasaAplicada: it.igiRate, tasaGeneral: t.tariffNMF, tasaPreferencial: t.tariffTMEC, ahorroUSD: r2(valor * (it.igiRate - t.tariffTMEC) / 100), detalle: 'Cotizada con IGI mayor al preferencial T-MEC' });
        } else if (t.tariffNMF > it.igiRate) {
          aplicadoLineas.push({ origen: 'cotizacion', id: q.id, fecha: iso(q.createdAt), fractionCode: it.fractionCode, pais, valorUSD: valor, tasaAplicada: it.igiRate, tasaGeneral: t.tariffNMF, tasaPreferencial: t.tariffTMEC, ahorroUSD: r2(valor * (t.tariffNMF - it.igiRate) / 100), detalle: 'Preferencia T-MEC aplicada en la cotización' });
        }
      }
      const p = prosecDe(code);
      if (p && valor > 0 && it.igiRate > p.prosecRate) {
        prosecLineas.push({ origen: 'cotizacion', id: q.id, fecha: iso(q.createdAt), fractionCode: it.fractionCode, pais, valorUSD: valor, tasaAplicada: it.igiRate, tasaGeneral: t?.tariffNMF ?? null, tasaPreferencial: p.prosecRate, ahorroUSD: r2(valor * (it.igiRate - p.prosecRate) / 100), detalle: `Elegible PROSEC sector ${p.sector}${p.fechaCotejo ? '' : ' (fila sin cotejo DOF)'}`, sector: p.sector, cotejado: !!p.fechaCotejo });
      }
    }
  }

  // ── (b) RIESGO ──
  const apar = new Map<string, { apariciones: number; valorUSD: number }>();
  const suma = (code: string, valor: number) => { const a = apar.get(code) ?? { apariciones: 0, valorUSD: 0 }; a.apariciones++; a.valorUSD += valor; apar.set(code, a); };
  for (const c of clsPeriodo) suma(c.fractionCode.replace(/\D/g, ''), c.inputDeclaredValueUSD ?? 0);
  for (const q of quotesPeriodo) for (const it of q.items) suma(it.fractionCode.replace(/\D/g, ''), it.customsValueUSD);
  const fraccionesSensibles = [...apar.entries()].map(([code, a]) => {
    const cc = cuotas.filter(x => x.fractionCode === code);
    const noms = coincide(regsNom, code).map(x => x.code);
    const pad = coincide(padrones, code)[0]?.code ?? null;
    return { fractionCode: code, apariciones: a.apariciones, valorUSD: r2(a.valorUSD), cuotaCompensatoria: { paises: [...new Set(cc.map(x => x.countryOfOrigin))], count: cc.length }, nomObligatoria: [...new Set(noms)], precioEstimado: precios.some(p => p.fractionCode === code), anexo10: pad };
  }).filter(x => x.cuotaCompensatoria.count > 0 || x.nomObligatoria.length > 0 || x.precioEstimado || x.anexo10)
    .sort((a, b) => b.valorUSD - a.valorUSD);

  const baseGlosa = { tenantId: f.tenantId, ...(f.clienteId ? { clienteId: f.clienteId } : {}), createdAt: periodo };
  const [glosas, risks] = await Promise.all([
    prisma.glosaSimulation.findMany({ where: baseGlosa, select: { customsCode: true, raProbability: true, riskScore: true, riskLevel: true } }),
    prisma.riskAssessment.findMany({ where: baseGlosa, select: { banda: true, exposicion: true } }),
  ]);
  const porAduana = new Map<string, { n: number; ra: number; score: number; alto: number }>();
  for (const g of glosas) {
    const a = porAduana.get(g.customsCode) ?? { n: 0, ra: 0, score: 0, alto: 0 };
    a.n++; a.ra += g.raProbability; a.score += g.riskScore; if (/alto|high|critic/i.test(g.riskLevel)) a.alto++;
    porAduana.set(g.customsCode, a);
  }
  const aduanas = [...porAduana.entries()].map(([customsCode, a]) => ({ customsCode, simulaciones: a.n, raPromedio: r2(a.ra / a.n), riesgoPromedio: r2(a.score / a.n), nivelAlto: a.alto })).sort((a, b) => b.raPromedio - a.raPromedio);
  const bandas: Record<string, number> = {};
  for (const r of risks) bandas[r.banda] = (bandas[r.banda] ?? 0) + 1;

  // ── (c) EQUIPO ──
  const userIds = [...new Set(clsPeriodo.map(c => c.userId))];
  const [usuarios, jobs] = await Promise.all([
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }) : [],
    prisma.classificationJob.findMany({ where: { tenantId: f.tenantId, ...(f.clienteId ? { clienteId: f.clienteId } : {}), status: 'done', createdAt: periodo, finishedAt: { not: null } }, select: { userId: true, createdAt: true, finishedAt: true } }),
  ]);
  const porUsuario = userIds.map(uid => {
    const mias = clsPeriodo.filter(c => c.userId === uid);
    const validadas = mias.filter(c => c.feedback != null).length;
    const correctas = mias.filter(c => c.feedback === 'correct').length;
    const misJobs = jobs.filter(j => j.userId === uid);
    const seg = misJobs.reduce((s, j) => s + (j.finishedAt!.getTime() - j.createdAt.getTime()) / 1000, 0);
    const u = usuarios.find(x => x.id === uid);
    return {
      userId: uid, nombre: u?.name ?? '(usuario eliminado)', email: u?.email ?? '',
      clasificaciones: mias.length, validadas, correctas,
      pctValidado: mias.length ? r2(validadas * 100 / mias.length) : null,
      pctCorrecto: validadas ? r2(correctas * 100 / validadas) : null,
      tiempoMedioSeg: misJobs.length ? r2(seg / misJobs.length) : null,
      jobs: misJobs.length,
    };
  }).sort((a, b) => b.clasificaciones - a.clasificaciones);

  return {
    filtro: { tenantId: f.tenantId, clienteId: f.clienteId ?? null, desde: iso(f.desde), hasta: iso(f.hasta) },
    totales: {
      clasificaciones: totalCls, cotizaciones: totalQuotes,
      clasificacionesPeriodo: clsPeriodo.length, cotizacionesPeriodo: quotesPeriodo.length,
      formula: 'count(Classification) y count(Quote) del tenant' + (f.clienteId ? ' filtrados por clienteId' : '') + ' — mismo criterio que el Historial; "periodo" acota por createdAt',
    },
    ahorro: {
      tmecNoAplicado: { totalUSD: r2(tmecLineas.reduce((s, l) => s + l.ahorroUSD, 0)), lineas: tmecLineas, sinTasa, formula: 'Σ valor USD × (IGI aplicado o NMF − tasa T-MEC del catálogo) / 100, para partidas con origen US/CA/MX y sin preferencia aplicada' },
      prosecNoUsado: { totalUSD: r2(prosecLineas.reduce((s, l) => s + l.ahorroUSD, 0)), lineas: prosecLineas, formula: 'Σ valor USD × (IGI cotizado − tasa PROSEC) / 100, para fracciones elegibles en prosec_eligibility', nota: 'Requiere programa PROSEC autorizado en el sector; filas sin fechaCotejo están sin cotejar contra el decreto en DOF' },
      aplicado: { totalUSD: r2(aplicadoLineas.reduce((s, l) => s + l.ahorroUSD, 0)), lineas: aplicadoLineas, formula: 'Σ valor USD × (NMF del catálogo − IGI cotizado) / 100, para cotizaciones con origen T-MEC e IGI ≤ tasa T-MEC' },
    },
    riesgo: {
      fraccionesSensibles,
      formula: 'Fracciones de mis clasificaciones/cotizaciones del periodo que cruzan con antidumping_duties (vigente, exacta), fraction_regulations tipo NOM obligatoria, estimated_prices o padrón sectorial (Anexo 10)',
      aduanas,
      formulaAduanas: 'Promedio de raProbability y riskScore de mis simulaciones de Pre-Glosa agrupadas por aduana (customsCode)',
      riskScorer: { evaluaciones: risks.length, bandas, exposicionPromedio: risks.length ? r2(risks.reduce((s, r) => s + r.exposicion, 0) / risks.length) : null },
    },
    equipo: {
      porUsuario,
      formula: 'Clasificaciones del periodo por userId; % validado = con feedback / total; % correcto = feedback "correct" / validadas; tiempo medio = promedio(finishedAt − createdAt) de ClassificationJob status=done',
    },
  };
}
