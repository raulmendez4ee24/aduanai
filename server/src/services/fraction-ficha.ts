/**
 * Ficha completa de una fracción arancelaria (Ola 3 — "pantalla abierta todo el día").
 *
 * Reúne en UNA respuesta lo que hoy vive disperso en tablas distintas, y cada
 * bloque declara su `fuente` y, cuando el modelo la tiene, `fechaDOF` /
 * `fechaCotejo`. Regla de la casa: NADA se inventa. Un bloque sin filas reales
 * sale como `sin_dato` (la tabla existe y está vacía para esta fracción) o
 * `pendiente_de_carga` (la fuente oficial aún no se ha cargado al producto),
 * siempre con la fuente que faltaría.
 */
import { prisma } from '../lib/prisma';
import { TARIFF_VERSION } from '../lib/tariff-version';
import { TLCUEM_VIGENCIA, preferenciaAplicable } from '../lib/treaties';
import { RETIRADAS_TIGIE } from '../lib/retiradas-tigie';

export type EstadoBloque = 'con_datos' | 'sin_dato' | 'pendiente_de_carga';

export interface Bloque<T> {
  estado: EstadoBloque;
  /** De dónde sale el dato (o de dónde saldría si falta). */
  fuente: string;
  fechaDOF?: string | null;
  fechaCotejo?: string | null;
  nota?: string;
  datos: T;
}

export interface NodoArbol {
  nivel: 'seccion' | 'capitulo' | 'partida' | 'subpartida' | 'fraccion';
  code: string;
  label: string;
  /** Notas legales (solo capítulo). */
  notas?: string | null;
}

export interface Arancel {
  clave: 'IGI_GENERAL' | 'TMEC' | 'TLCUEM' | 'CPTPP' | 'IEPS';
  etiqueta: string;
  tasa: number | null;
  unidad: '%' | 'MXN/L' | 'MXN/kg' | string;
  vigente: boolean;
  nota?: string;
}

export const BLOQUES_FICHA = [
  'arbol', 'nicos', 'aranceles', 'prosec', 'regla8va', 'cuotasCompensatorias',
  'noms', 'permisos', 'aduanasAnexo21', 'preciosEstimados', 'correlativas',
] as const;

export interface FichaFraccion {
  fraccion: {
    code: string;
    codeFormatted: string;
    description: string;
    unit: string | null;
    active: boolean;
    updatedAt: string;
  };
  versionCatalogo: { tigie: string; ligie: string; fechaDOF: string; vigencia: string; fechaCotejo: string; fuente: string };
  bloques: {
    arbol: Bloque<NodoArbol[]>;
    nicos: Bloque<{ nico: string; fuente: string }[]>;
    aranceles: Bloque<Arancel[]>;
    prosec: Bloque<{ sector: string; tasa: number; matchType: string; decree: string | null; vigenteDesde: string; vigenteHasta: string | null; fechaCotejo: string | null; cotejado: boolean }[]>;
    regla8va: Bloque<{ vehicleFraction: string; vehicleDesc: string; preferentialRate: number; rol: 'producto_terminado' | 'parte_permitida'; conditions: string | null; vigenteDesde: string }[]>;
    cuotasCompensatorias: Bloque<{ id: string; fractionCode: string; countryOfOrigin: string; productDesc: string | null; specificProducer: string | null; exportadorTasas: unknown; rate: number; rateUnit: string; resolutionNumber: string | null; status: string; publishDateDOF: string | null; effectiveDate: string | null; expiryDate: string | null; examenSunsetFecha: string | null; cotejadoAt: string | null; esAntielusion: boolean; dofUrl: string | null }[]>;
    noms: Bloque<{ code: string; authority: string; description: string; required: boolean; origenDato: 'fraction_regulations' | 'fractions.noms'; excepciones: { exceptionCode: string; fraccionAnexo: string; description: string; requiredDoc: string | null; legalBasis: string | null }[] }[]>;
    permisos: Bloque<{ type: string; authority: string; code: string; description: string; required: boolean; matchType: string }[]>;
    aduanasAnexo21: Bloque<never[]>;
    preciosEstimados: Bloque<{ countryOfOrigin: string | null; estimatedValue: number; unit: string; decree: string | null; publishDate: string; effectiveDate: string; expiryDate: string | null; source: string }[]>;
    correlativas: Bloque<{ tipo: 'retirada'; nota: string }[]>;
  };
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);
const limpiar = (code: string) => code.replace(/[.\s-]/g, '');

function prefijos(code: string): string[] {
  return [code.slice(0, 2), code.slice(0, 4), code.slice(0, 6)];
}

export async function construirFicha(codeRaw: string): Promise<FichaFraccion | null> {
  const code = limpiar(codeRaw);
  if (!/^\d{8}$/.test(code)) return null;

  const fr = await prisma.fraction.findFirst({
    where: { code },
    include: { subheading: { include: { heading: { include: { chapter: { include: { section: true } } } } } } },
  });
  if (!fr) return null;

  const pref = prefijos(code);
  const [prosec, regla8, cuotas, regs, precios, ieps] = await Promise.all([
    prisma.pROSECEligibility.findMany({
      where: { active: true, OR: [{ fractionCode: code, matchType: 'exact' }, { matchType: 'prefix', fractionCode: { in: pref } }] },
      orderBy: { effectiveDate: 'desc' },
    }),
    prisma.regla8vaMapping.findMany({ where: { active: true } }),
    // Cuotas compensatorias: coincidencia EXACTA por fracción (regla de integridad).
    prisma.antidumpingDuty.findMany({ where: { fractionCode: code, active: true }, orderBy: [{ status: 'asc' }, { effectiveDate: 'desc' }] }),
    prisma.fractionRegulation.findMany({
      where: { active: true, OR: [{ fractionCode: code, matchType: 'exact' }, { matchType: 'prefix', fractionCode: { in: pref } }] },
      orderBy: { code: 'asc' },
    }),
    prisma.estimatedPrice.findMany({ where: { fractionCode: code, active: true }, orderBy: { effectiveDate: 'desc' } }),
    prisma.iEPSRate.findMany({
      where: { active: true, OR: [{ fractionCode: code, matchType: 'exact' }, { matchType: 'prefix', fractionCode: { in: pref } }] },
    }),
  ]);

  const sh = fr.subheading, h = sh.heading, ch = h.chapter, sec = ch.section;
  const fuenteCatalogo = TARIFF_VERSION.source;

  // ── Árbol ──
  const arbol: NodoArbol[] = [
    { nivel: 'seccion', code: sec.number, label: sec.title },
    { nivel: 'capitulo', code: ch.number, label: ch.title, notas: ch.legalNotes },
    { nivel: 'partida', code: h.code, label: h.description },
    { nivel: 'subpartida', code: sh.code, label: sh.description },
    { nivel: 'fraccion', code: fr.code, label: fr.description },
  ];

  // ── NICOs (Fraction.nicos cargado verbatim por scripts/cargar-nicos.ts) ──
  const nicos = (fr.nicos.length > 0 ? fr.nicos : fr.nico ? [fr.nico] : []).map(n => ({ nico: n, fuente: 'Base Única SNICE (hoja "Base Única")' }));

  // ── Aranceles ──
  const tlcuemVigente = preferenciaAplicable(TLCUEM_VIGENCIA[TLCUEM_VIGENCIA.instrumentoParaCalculo]);
  const aranceles: Arancel[] = [
    { clave: 'IGI_GENERAL', etiqueta: 'IGI general (NMF)', tasa: fr.tariffNMF, unidad: '%', vigente: true },
    { clave: 'TMEC', etiqueta: 'T-MEC (preferencial, con certificación de origen)', tasa: fr.tariffTMEC, unidad: '%', vigente: true },
    { clave: 'TLCUEM', etiqueta: 'TLCUEM (Decisión 2/2000)', tasa: fr.tariffTLCUE, unidad: '%', vigente: tlcuemVigente, nota: `${TLCUEM_VIGENCIA.acuerdoVigente.nombre} — cotejo ${TLCUEM_VIGENCIA.acuerdoVigente.fechaCotejo}` },
    { clave: 'CPTPP', etiqueta: 'CPTPP', tasa: fr.tariffCPTPP, unidad: '%', vigente: true },
  ];
  for (const r of ieps) {
    aranceles.push({ clave: 'IEPS', etiqueta: `IEPS (${r.productCategory})`, tasa: r.rate, unidad: r.unit ?? '%', vigente: true, nota: r.decree ?? undefined });
  }
  if (ieps.length === 0 && fr.iepsRate != null) {
    aranceles.push({ clave: 'IEPS', etiqueta: 'IEPS', tasa: fr.iepsRate, unidad: '%', vigente: true });
  }

  // ── Regla 8va: producto terminado o parte permitida ──
  const regla8va = regla8.flatMap(m => {
    const out: FichaFraccion['bloques']['regla8va']['datos'] = [];
    const partes = Array.isArray(m.partsAllowed) ? (m.partsAllowed as { fraction?: string }[]) : [];
    if (limpiar(m.vehicleFraction) === code) {
      out.push({ vehicleFraction: m.vehicleFraction, vehicleDesc: m.vehicleDesc, preferentialRate: m.preferentialRate, rol: 'producto_terminado', conditions: m.conditions, vigenteDesde: iso(m.effectiveDate)! });
    } else if (partes.some(p => p.fraction && limpiar(String(p.fraction)) === code)) {
      out.push({ vehicleFraction: m.vehicleFraction, vehicleDesc: m.vehicleDesc, preferentialRate: m.preferentialRate, rol: 'parte_permitida', conditions: m.conditions, vigenteDesde: iso(m.effectiveDate)! });
    }
    return out;
  });

  // ── NOMs (+ excepciones Anexo 2.4.1) ──
  const nomRegs = regs.filter(r => r.type === 'NOM');
  const nomCodes = new Set<string>(nomRegs.map(r => r.code));
  for (const n of fr.noms) nomCodes.add(n);
  const excepciones = nomCodes.size > 0
    ? await prisma.nOMException.findMany({ where: { active: true, OR: [{ nomCode: { in: [...nomCodes] } }, { nomCode: null }] } })
    : [];
  const noms = [...nomCodes].map(codeNom => {
    const reg = nomRegs.find(r => r.code === codeNom);
    return {
      code: codeNom,
      authority: reg?.authority ?? 'SE',
      description: reg?.description ?? 'NOM listada en el catálogo de la fracción (sin descripción cargada)',
      required: reg?.required ?? true,
      origenDato: (reg ? 'fraction_regulations' : 'fractions.noms') as 'fraction_regulations' | 'fractions.noms',
      excepciones: excepciones
        .filter(e => e.nomCode === codeNom || e.nomCode === null)
        .map(e => ({ exceptionCode: e.exceptionCode, fraccionAnexo: e.fraction, description: e.description, requiredDoc: e.requiredDoc, legalBasis: e.legalBasis })),
    };
  });

  // ── Permisos / RRNA / padrones ──
  const permisos = regs.filter(r => r.type !== 'NOM').map(r => ({ type: r.type, authority: r.authority, code: r.code, description: r.description, required: r.required, matchType: r.matchType }));
  if (fr.requiresPermit && fr.permitType && !permisos.some(p => p.authority === fr.permitType)) {
    permisos.push({ type: 'permiso_previo', authority: fr.permitType, code: fr.permitType, description: 'Marcado en el catálogo de la fracción (sin detalle cargado)', required: true, matchType: 'exact' });
  }
  if (fr.sectoralRegistry && fr.sectoralType && !permisos.some(p => p.type === 'padron_sectorial')) {
    permisos.push({ type: 'padron_sectorial', authority: 'SAT', code: fr.sectoralType, description: 'Padrón sectorial marcado en el catálogo de la fracción', required: true, matchType: 'exact' });
  }

  // ── Correlativas: no hay tabla de correlación LIGIE 2020↔2022↔2025 cargada ──
  const retirada = RETIRADAS_TIGIE.has(code) || !fr.active;
  const correlativas: { tipo: 'retirada'; nota: string }[] = retirada
    ? [{ tipo: 'retirada', nota: RETIRADAS_TIGIE.has(code) ? 'Fracción retirada de la TIGIE vigente (lib/retiradas-tigie.ts, cotejo contra Base Única LIGIE 2026).' : 'Fracción marcada como inactiva en el catálogo.' }]
    : [];

  const bloque = <T>(datos: T, fuente: string, extra: Partial<Bloque<T>> = {}): Bloque<T> => {
    const vacio = datos === null || (Array.isArray(datos) && datos.length === 0);
    const { estado: estadoVacio, ...resto } = extra;
    return { ...resto, estado: vacio ? (estadoVacio ?? 'sin_dato') : 'con_datos', fuente, datos };
  };

  return {
    fraccion: { code: fr.code, codeFormatted: fr.codeFormatted, description: fr.description, unit: fr.unit, active: fr.active, updatedAt: fr.updatedAt.toISOString() },
    versionCatalogo: { tigie: TARIFF_VERSION.tigie, ligie: TARIFF_VERSION.ligie, fechaDOF: TARIFF_VERSION.publishDate, vigencia: TARIFF_VERSION.effectiveDate, fechaCotejo: TARIFF_VERSION.cotejoDate, fuente: fuenteCatalogo },
    bloques: {
      arbol: bloque(arbol, fuenteCatalogo, { fechaDOF: TARIFF_VERSION.publishDate, fechaCotejo: TARIFF_VERSION.cotejoDate }),
      nicos: bloque(nicos, 'Tabla NICO — Base Única SNICE extracto 30-mar-2026 (scripts/cargar-nicos.ts, verbatim)', { fechaCotejo: TARIFF_VERSION.snapshotDate, nota: nicos.length === 0 ? 'La hoja Base Única no trae NICO para esta fracción o aún no se cargó.' : undefined }),
      aranceles: bloque(aranceles, `${fuenteCatalogo}; tratados: lib/treaties.ts`, { fechaDOF: TARIFF_VERSION.publishDate, fechaCotejo: TARIFF_VERSION.cotejoDate }),
      prosec: bloque(
        prosec.map(p => ({ sector: p.sector, tasa: p.prosecRate, matchType: p.matchType, decree: p.decree, vigenteDesde: iso(p.effectiveDate)!, vigenteHasta: iso(p.expiryDate), fechaCotejo: iso(p.fechaCotejo), cotejado: !!p.fechaCotejo })),
        'Decreto PROSEC (tabla prosec_eligibility); filas sin fechaCotejo = sin cotejar contra DOF',
        { fechaCotejo: prosec.find(p => p.fechaCotejo)?.fechaCotejo?.toISOString().slice(0, 10) ?? null },
      ),
      regla8va: bloque(regla8va, 'Regla 8va — tabla regla_8va_mappings (Decreto PROSEC / Regla 8a. complementaria LIGIE)'),
      cuotasCompensatorias: bloque(
        cuotas.map(c => ({ id: c.id, fractionCode: c.fractionCode, countryOfOrigin: c.countryOfOrigin, productDesc: c.productDesc, specificProducer: c.specificProducer, exportadorTasas: c.exportadorTasas, rate: c.rate, rateUnit: c.rateUnit, resolutionNumber: c.resolutionNumber, status: c.status, publishDateDOF: iso(c.publishDateDOF), effectiveDate: iso(c.effectiveDate), expiryDate: iso(c.expiryDate), examenSunsetFecha: iso(c.examenSunsetFecha), cotejadoAt: iso(c.cotejadoAt), esAntielusion: c.esAntielusion, dofUrl: c.dofUrl ?? c.fuenteUrl })),
        'Resoluciones UPCI/SE en DOF (tabla antidumping_duties, coincidencia exacta por fracción); filas sin cotejadoAt = pendiente de cotejo',
        { fechaDOF: cuotas.find(c => c.publishDateDOF)?.publishDateDOF?.toISOString().slice(0, 10) ?? null, fechaCotejo: cuotas.find(c => c.cotejadoAt)?.cotejadoAt?.toISOString().slice(0, 10) ?? null },
      ),
      noms: bloque(noms, 'Acuerdo de NOMs (Anexo 2.4.1) — tablas fraction_regulations + nom_exceptions; y fractions.noms del catálogo'),
      permisos: bloque(permisos, 'Acuerdos de RRNA / permisos previos SE, COFEPRIS, SEMARNAT, SADER — tabla fraction_regulations; padrones sectoriales Anexo 10 RGCE'),
      aduanasAnexo21: { estado: 'pendiente_de_carga', fuente: 'Anexo 21 RGCE (aduanas autorizadas para tramitar el despacho de determinadas mercancías) — no cargado al producto', datos: [] },
      preciosEstimados: bloque(
        precios.map(p => ({ countryOfOrigin: p.countryOfOrigin, estimatedValue: p.estimatedValue, unit: p.unit, decree: p.decree, publishDate: iso(p.publishDate)!, effectiveDate: iso(p.effectiveDate)!, expiryDate: iso(p.expiryDate), source: p.source })),
        'Precios estimados SHCP/SAT (Art. 84-A LA, Anexo 2 RGCE) — tabla estimated_prices',
        { fechaDOF: precios[0] ? iso(precios[0].publishDate) : null },
      ),
      correlativas: bloque(correlativas, 'Tabla de correlación LIGIE 2020↔2022↔2025 (SNICE) — pendiente de carga; hoy solo se marca "retirada" cuando consta en lib/retiradas-tigie.ts o el catálogo la tiene inactiva', { estado: 'pendiente_de_carga' }),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Árbol perezoso: un nivel por llamada.
// ─────────────────────────────────────────────────────────────────────────────

export interface RespuestaArbol {
  nodo: string;
  /** Nivel de los hijos devueltos. */
  nivel: NodoArbol['nivel'];
  hijos: (NodoArbol & { hoja: boolean })[];
}

export async function navegarArbol(nodoRaw: string): Promise<RespuestaArbol> {
  const nodo = limpiar(nodoRaw).toUpperCase();
  if (nodo === '') {
    const secs = await prisma.section.findMany({ orderBy: { number: 'asc' }, select: { number: true, title: true } });
    // Orden romano real (no alfabético).
    const romano = (r: string) => { const m: Record<string, number> = { I: 1, V: 5, X: 10, L: 50 }; let t = 0; for (let i = 0; i < r.length; i++) { const v = m[r[i]!] ?? 0, n = m[r[i + 1]!] ?? 0; t += v < n ? -v : v; } return t; };
    return { nodo, nivel: 'seccion', hijos: secs.sort((a, b) => romano(a.number) - romano(b.number)).map(s => ({ nivel: 'seccion', code: s.number, label: s.title, hoja: false })) };
  }
  if (/^[IVXL]+$/.test(nodo)) {
    const caps = await prisma.chapter.findMany({ where: { section: { number: nodo } }, orderBy: { number: 'asc' }, select: { number: true, title: true, legalNotes: true } });
    return { nodo, nivel: 'capitulo', hijos: caps.map(c => ({ nivel: 'capitulo', code: c.number, label: c.title, notas: c.legalNotes, hoja: false })) };
  }
  if (/^\d{2}$/.test(nodo)) {
    const hs = await prisma.heading.findMany({ where: { chapter: { number: nodo } }, orderBy: { code: 'asc' }, select: { code: true, description: true } });
    return { nodo, nivel: 'partida', hijos: hs.map(h => ({ nivel: 'partida', code: h.code, label: h.description, hoja: false })) };
  }
  if (/^\d{4}$/.test(nodo)) {
    const shs = await prisma.subheading.findMany({ where: { heading: { code: nodo } }, orderBy: { code: 'asc' }, select: { code: true, description: true } });
    return { nodo, nivel: 'subpartida', hijos: shs.map(s => ({ nivel: 'subpartida', code: s.code, label: s.description, hoja: false })) };
  }
  if (/^\d{6}$/.test(nodo)) {
    const frs = await prisma.fraction.findMany({ where: { subheading: { code: nodo } }, orderBy: { code: 'asc' }, select: { code: true, description: true, active: true } });
    return { nodo, nivel: 'fraccion', hijos: frs.map(f => ({ nivel: 'fraccion', code: f.code, label: f.active ? f.description : `${f.description} (inactiva)`, hoja: true })) };
  }
  return { nodo, nivel: 'fraccion', hijos: [] };
}
