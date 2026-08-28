/**
 * RGI 6 — específica vs residual (4ª revisión, prioridad 1).
 *
 * PROBLEMA QUE CIERRA. El motor elegía 8544.42.99 para un arnés automotriz y
 * su "RGI 6" comparaba .05 contra .99 DENTRO de la 8544.42, sin razonar nunca
 * la 8544.30 ("Juegos de cables para bujías de encendido y demás juegos de
 * cables de los tipos utilizados en los medios de transporte"), que es la
 * subpartida específica de la MISMA partida. Regla dura pedida por el revisor:
 * si existe una subpartida específica cuyo texto menciona el tipo de producto
 * o su uso/destino declarado, la RGI 6 debe compararla TEXTUALMENTE y
 * descartarla POR ESCRITO antes de caer en una residual.
 *
 * DISEÑO (estructural y determinista, no "otra vuelta al prompt" — la ola v2
 * de iteración de prompt está cerrada, ver memoria del proyecto):
 *
 *   1. Detector de residual  → `evaluarResidual`, sobre el catálogo TIGIE
 *      (Subheading/Fraction vía subpartidas-hermanas), NUNCA sobre una lista
 *      fija de fracciones.
 *   2. Candidata específica  → `candidataEspecifica`, coincidencia textual de
 *      raíces (mismo tokenizador que el retrieval, rgi6-terminos.ts) más los
 *      EJES DE DESTINO del propio catálogo.
 *   3. Pase dirigido al LLM  → `pasoRGI6`: UNA llamada que solo ve los dos
 *      textos, el producto y las notas legales del corpus, y devuelve
 *      ganadora + justificación citando RGI 6 + descarte por escrito.
 *   4. Fail-safe             → cualquier fallo (429, timeout, JSON roto,
 *      código fuera de catálogo) conserva la elección original y marca
 *      `estado: 'no_ejecutado'`. Jamás se inventa el veredicto.
 *   5. Alternativas contradictorias → `filtrarAlternativasContradictorias`.
 *
 * NADA DE DATOS LEGALES FABRICADOS: los textos de subpartida y fracción salen
 * del catálogo; las notas salen de `LegalDocument` y viajan con su estado de
 * cotejo (`fechaCotejo` nulo → 'pendiente'). Si una nota citada no está en el
 * corpus, NO se filtra nada y se dice en la respuesta.
 */
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { llmGenerate } from '../lib/llm';
import { validateFraction } from './fraction-validator';
import { subpartidasHermanas, limpiarCodigo, type SubpartidaHermana } from './subpartidas-hermanas';
import { raicesComunes, raicesSignificativas, sinAcentos } from './rgi6-terminos';

// ─────────────────────────── Flag ───────────────────────────

/**
 * Interruptor del pase. Se mide antes/después sobre el set de accuracy; si la
 * regla empeorara el top-1 se apaga aquí sin tocar el resto del motor.
 * `RGI6_ESPECIFICA_VS_RESIDUAL=0` lo apaga en cualquier entorno.
 */
export function rgi6Activo(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.RGI6_ESPECIFICA_VS_RESIDUAL !== '0' && env.RGI6_ESPECIFICA_VS_RESIDUAL !== 'false';
}

// ──────────────────── 1. Detector de residual ────────────────────

/**
 * Texto residual del lenguaje TIGIE: "Los demás.", "Las demás.", "Otros",
 * "Los demás, de …". Se evalúa sobre el texto SIN acentos y en minúsculas.
 * No basta con que la frase contenga "los demás" en medio ("… y demás juegos
 * de cables …" es una subpartida ESPECÍFICA): tiene que ABRIR el texto.
 */
export function textoEsResidual(descripcion: string | null | undefined): boolean {
  const t = sinAcentos((descripcion ?? '').trim().toLowerCase());
  return /^(los|las)\s+demas\b/.test(t) || /^(los|las)\s+otr[oa]s\b/.test(t) || /^otr[oa]s\b/.test(t);
}

export interface DeteccionResidual {
  esResidual: boolean;
  /** Dónde cae la residualidad: en la fracción de 8 dígitos, en la subpartida de 6, o en ambas. */
  niveles: ('fraccion' | 'subpartida')[];
  /** Frase legible para el dictamen (vacía si no es residual). */
  motivo: string;
}

/**
 * ¿La fracción elegida es residual? Se resuelve contra el catálogo cargado
 * (las hermanas vienen de Subheading/Fraction), no contra una lista fija:
 *  - por TEXTO: la fracción o su subpartida abren con "Los demás"/"Otros".
 *  - por POSICIÓN: la fracción termina en 99 y su subpartida tiene más de una
 *    fracción activa (el .99 es el cajón de sastre de ESE nivel). Con una sola
 *    fracción activa el .99 no es residual de nada: es la única opción.
 */
export function evaluarResidual(codigo: string, hermanas: SubpartidaHermana[]): DeteccionResidual {
  const limpio = limpiarCodigo(codigo);
  const niveles: DeteccionResidual['niveles'] = [];
  const motivos: string[] = [];
  if (limpio.length < 6) return { esResidual: false, niveles, motivo: '' };

  const sub = hermanas.find(h => h.code === limpio.slice(0, 6));
  const frac = sub?.fracciones.find(f => f.code === limpio);

  if (frac) {
    if (textoEsResidual(frac.description)) {
      niveles.push('fraccion');
      motivos.push(`la fracción ${frac.codeFormatted} dice "${frac.description.trim()}"`);
    } else if (limpio.endsWith('99') && sub!.fracciones.length > 1) {
      niveles.push('fraccion');
      motivos.push(`la fracción ${frac.codeFormatted} es el sufijo .99 de la subpartida ${sub!.codeFormatted}, que tiene ${sub!.fracciones.length} fracciones activas`);
    }
  }
  if (sub && textoEsResidual(sub.description)) {
    niveles.push('subpartida');
    motivos.push(`la subpartida ${sub.codeFormatted} dice "${sub.description.trim()}"`);
  }

  return {
    esResidual: niveles.length > 0,
    niveles,
    motivo: motivos.length > 0 ? `Clasificación residual: ${motivos.join('; ')}.` : '',
  };
}

// ──────────────── 2. Candidata específica (ejes de destino) ────────────────

/**
 * EJES DE DESTINO — mecanismo GENERAL del Sistema Armonizado, no reglas por
 * producto: muchas subpartidas se distinguen por el DESTINO de la mercancía
 * ("de los tipos utilizados en los medios de transporte", "reconocibles para
 * naves aéreas", "de uso doméstico"…), y el importador declara ese destino con
 * otro vocabulario ("automotriz", "aeronáutico", "para hogar").
 *
 * Curaduría (misma disciplina que lib/vocab-bridge.ts): cada patrón `catalogo`
 * está VERIFICADO contra descripciones reales de subpartidas activas — la
 * evidencia se re-verifica en src/tests/rgi6-especifica-residual.test.ts, que
 * falla si un eje deja de tener sustento en el catálogo.
 */
export interface EjeDestino {
  id: string;
  etiqueta: string;
  /** Patrón sobre el texto del CATÁLOGO (minúsculas sin acentos). */
  catalogo: RegExp;
  /** Patrón sobre la descripción + uso/destino DECLARADOS (minúsculas sin acentos). */
  producto: RegExp;
  /** Subpartidas reales que sustentan el patrón (verificado contra el catálogo). */
  evidencia: string;
}

export const EJES_DESTINO: EjeDestino[] = [
  {
    id: 'medios_de_transporte',
    etiqueta: 'medios de transporte terrestres (vehículos automóviles)',
    catalogo: /medios de transporte|vehiculos automoviles|automoviles/,
    producto: /automotri|automovil|vehicul|camion(?:eta)?\b|autobus|motocicl|tractocamion|remolque/,
    evidencia: '854430 "…juegos de cables de los tipos utilizados en los medios de transporte"; 830230 "…para vehículos automóviles"; 401310 "De los tipos utilizados en automóviles de turismo"',
  },
  {
    id: 'naves_aereas',
    etiqueta: 'naves aéreas / aeronaves',
    catalogo: /naves aereas|aeronaves/,
    producto: /aeronautic|aeroespacial|aeronave|\bavion(?:es)?\b|helicopter|naves aereas/,
    evidencia: '401130 "De los tipos utilizados en aeronaves."; 880230 "Aviones y demás aeronaves…"',
  },
  {
    id: 'embarcaciones',
    etiqueta: 'embarcaciones / uso marítimo',
    catalogo: /embarcaciones|\bbarcos\b|navegacion maritima/,
    producto: /maritim|embarcacion|\bbarco|\bbuque|\bnaval\b/,
    evidencia: '401694 "…para el atraque de los barcos."; 890190 "Los demás barcos para transporte de mercancías…"',
  },
  {
    id: 'uso_domestico',
    etiqueta: 'uso doméstico',
    catalogo: /uso domestico|domestic[oa]s?\b/,
    producto: /domestic|\bhogar\b|casa habitacion/,
    evidencia: '741810 "Artículos de uso doméstico y sus partes…"; 842211 "De tipo doméstico."',
  },
  {
    id: 'uso_medico',
    etiqueta: 'uso médico, quirúrgico u odontológico',
    catalogo: /\bmedic[oa]s?\b|quirurgic|medicoquirurgic/,
    producto: /\bmedic|quirurgic|hospital|odontolog|\bclinic/,
    evidencia: '401512 "De los tipos utilizados con fines médicos, quirúrgicos…"; 902214 "Los demás, para uso médico, quirúrgico o veterinario."',
  },
];

/** Ejes que un texto de catálogo declara Y que el producto declarado también declara. */
export function ejesCoincidentes(textoCatalogo: string, textoProducto: string): EjeDestino[] {
  const c = sinAcentos(textoCatalogo.toLowerCase());
  const p = sinAcentos(textoProducto.toLowerCase());
  return EJES_DESTINO.filter(e => e.catalogo.test(c) && e.producto.test(p));
}

/**
 * UMBRAL — por qué 2 raíces y no 1. Todas las subpartidas de una partida
 * comparten el sustantivo del título de la partida ("cables" en toda la 85.44):
 * una sola raíz común no distingue una hermana de las demás y dispararía el
 * pase en cualquier clasificación. Dos raíces independientes es el mínimo que
 * puede separar el texto de una hermana del de sus vecinas; y además tiene que
 * ser MÁS de lo que comparte la subpartida efectivamente elegida (si la elegida
 * empata o gana, el texto no está pidiendo revisión).
 *
 * La vía del EJE DE DESTINO no lleva umbral de raíces: cuando una hermana
 * escribe en su texto el destino que el importador declaró ("de los tipos
 * utilizados en los medios de transporte" frente a "automotriz / vehículo") y
 * la elegida NO lo escribe, esa sola coincidencia es exactamente la comparación
 * que la RGI 6 exige — es el caso del arnés (8544.30 vs 8544.42), donde el
 * producto ni siquiera dice la palabra "cables".
 */
export const UMBRAL_RAICES_SIN_EJE = 2;

export interface CandidataEspecifica {
  subpartida: SubpartidaHermana;
  raicesCompartidas: string[];
  ejes: EjeDestino[];
  /** Frase legible del porqué es candidata. */
  motivo: string;
}

/**
 * Busca, dentro de la MISMA partida, la subpartida específica que mejor
 * coincide textualmente con el producto y su uso/destino declarado, y que
 * coincide MEJOR que la subpartida efectivamente elegida. Determinista.
 */
export function candidataEspecifica(args: {
  descripcion: string;
  usoDestino?: string | null;
  codigoElegido: string;
  hermanas: SubpartidaHermana[];
}): CandidataEspecifica | null {
  const limpio = limpiarCodigo(args.codigoElegido);
  if (limpio.length < 6) return null;
  const subElegida = args.hermanas.find(h => h.code === limpio.slice(0, 6));
  if (!subElegida) return null;

  const textoProducto = [args.descripcion, args.usoDestino ?? ''].filter(Boolean).join(' ');
  const raicesProducto = raicesSignificativas(textoProducto);
  if (raicesProducto.size === 0) return null;

  const raicesElegida = raicesSignificativas(subElegida.description);
  const compartidasElegida = raicesComunes(raicesProducto, raicesElegida);
  const ejesElegida = ejesCoincidentes(subElegida.description, textoProducto);

  const candidatas: CandidataEspecifica[] = [];
  for (const h of args.hermanas) {
    if (h.code === subElegida.code) continue;
    // Sin fracciones activas no hay a dónde reclasificar.
    if (h.fracciones.length === 0) continue;
    // Una hermana residual no puede ser "la específica" que se dejó de razonar.
    if (textoEsResidual(h.description)) continue;

    const compartidas = raicesComunes(raicesProducto, raicesSignificativas(h.description));
    const ejes = ejesCoincidentes(h.description, textoProducto);

    // Vía A — la hermana declara el uso/destino que el importador declaró y la
    // elegida no lo declara. Vía B — la hermana comparte con el producto al
    // menos UMBRAL_RAICES_SIN_EJE términos significativos y MÁS que la elegida.
    const aportaEje = ejes.length > 0 && ejesElegida.length === 0;
    const ganaPorTexto = compartidas.length >= UMBRAL_RAICES_SIN_EJE && compartidas.length > compartidasElegida.length;
    if (!aportaEje && !ganaPorTexto) continue;

    const partes = [`comparte con el producto ${compartidas.length} término(s) significativo(s) (${compartidas.join(', ')})`];
    if (ejes.length > 0) partes.push(`y su texto declara el destino "${ejes.map(e => e.etiqueta).join(' / ')}", que el usuario declaró`);
    candidatas.push({
      subpartida: h,
      raicesCompartidas: compartidas,
      ejes,
      motivo: `La subpartida ${h.codeFormatted} ("${h.description.trim()}") ${partes.join(' ')}; la elegida ${subElegida.codeFormatted} ("${subElegida.description.trim()}") comparte ${compartidasElegida.length}.`,
    });
  }

  candidatas.sort((a, b) =>
    (b.ejes.length > 0 ? 1 : 0) - (a.ejes.length > 0 ? 1 : 0) ||
    b.raicesCompartidas.length - a.raicesCompartidas.length ||
    a.subpartida.code.localeCompare(b.subpartida.code),
  );
  return candidatas[0] ?? null;
}

// ──────────────────── Notas legales del corpus ────────────────────

export interface NotaRGI6 {
  source: string;
  text: string;
  /** 'cotejado' solo si el corpus trae fechaCotejo; jamás por la mera presencia de una URL. */
  cotejo: 'cotejado' | 'pendiente';
  fuenteUrl: string | null;
}

/** Referencias del corpus que fundamentan el pase (existen en LegalDocument). */
export const REFERENCIAS_RGI6 = ['GRI 1-6 LIGIE'];

/**
 * Notas legales para el pase: la RGI del corpus + la nota de sección del
 * capítulo de la fracción elegida y la del capítulo de la candidata, cuando
 * existan en `LegalDocument`. Read-only; si no hay corpus, devuelve [].
 */
export async function notasParaRGI6(capitulos: string[]): Promise<NotaRGI6[]> {
  const secciones = new Set<string>();
  const caps = [...new Set(capitulos.filter(c => /^\d{2}$/.test(c)))];
  if (caps.length > 0) {
    const filas = await prisma.chapter.findMany({
      where: { number: { in: caps } },
      select: { section: { select: { number: true } } },
    });
    for (const f of filas) if (f.section?.number) secciones.add(f.section.number);
  }

  const docs = await prisma.legalDocument.findMany({
    where: { OR: [{ reference: { in: REFERENCIAS_RGI6 } }, { reference: { startsWith: 'Nota ' } }] },
    select: { reference: true, content: true, fechaCotejo: true, officialUrl: true },
  });

  return docs
    .filter(d => {
      if (REFERENCIAS_RGI6.includes(d.reference)) return true;
      // "Sección XVI" NO debe traer "Sección XVII": se exige límite de palabra.
      return [...secciones].some(s => new RegExp(`secci[oó]n\\s+${s}\\b`, 'i').test(d.reference));
    })
    .map(d => ({
      source: d.reference,
      text: d.content,
      cotejo: (d.fechaCotejo ? 'cotejado' : 'pendiente') as NotaRGI6['cotejo'],
      fuenteUrl: d.officialUrl ?? null,
    }));
}

// ──────────────────── 3. Pase dirigido al LLM ────────────────────

export type LlmRGI6 = (opts: { system: string; user: string }) => Promise<string>;

const SYSTEM_RGI6 = `Eres un clasificador arancelario mexicano resolviendo UNA sola cuestión: la Regla General 6 (RGI 6) entre DOS subpartidas de la MISMA partida.

RGI 6: la clasificación a nivel de subpartida se determina por el TEXTO de las subpartidas y las notas de subpartida, comparando solo subpartidas del mismo nivel; y por aplicación de la RGI 3a, la subpartida MÁS ESPECÍFICA prevalece sobre la genérica o residual.

Se te dan: el producto, la subpartida/fracción que el motor eligió (residual) y una subpartida ESPECÍFICA de la misma partida. Debes decidir cuál corresponde y DEJAR POR ESCRITO el descarte de la perdedora citando su texto.

REGLAS:
- Solo puedes elegir un código de 8 dígitos de la lista "CÓDIGOS ELEGIBLES". Nada de memoria.
- Si el producto NO cumple el texto de la específica, la residual es la correcta: confírmala y explica textualmente por qué la específica no aplica.
- Cita las notas legales SOLO si te fueron proporcionadas abajo. Nunca inventes notas, tesis ni criterios.
- El descarte debe citar el TEXTO de la subpartida descartada, no una generalidad.

Responde ÚNICAMENTE con JSON:
{"ganadora":"XXXXXXXX","justificacion":"…RGI 6…","descarte":"Se descarta XXXX.XX porque su texto dice '…' y el producto …","notasCitadas":["…"]}`;

export interface VeredictoRGI6 {
  ganadora: string;
  justificacion: string;
  descarte: string;
  notasCitadas: string[];
}

const llmPorDefecto: LlmRGI6 = ({ system, user }) =>
  llmGenerate({
    model: 'strong',
    temperature: 0, // determinista, igual que el resto del clasificador
    maxTokens: 900,
    system,
    user,
    log: { operation: 'rgi6_especifica_vs_residual' },
  });

/**
 * UNA llamada dirigida: solo los dos textos, el producto y las notas del
 * corpus. Devuelve el veredicto ya validado contra el catálogo, o lanza.
 */
export async function pasoRGI6(args: {
  descripcion: string;
  usoDestino?: string | null;
  sector?: string | null;
  elegida: { code: string; codeFormatted: string; description: string };
  subElegida: SubpartidaHermana;
  candidata: CandidataEspecifica;
  notas: NotaRGI6[];
  llm?: LlmRGI6;
}): Promise<VeredictoRGI6> {
  const elegibles = [
    { code: args.elegida.code, codeFormatted: args.elegida.codeFormatted, description: args.elegida.description },
    ...args.candidata.subpartida.fracciones.map(f => ({ code: f.code, codeFormatted: f.codeFormatted, description: f.description })),
  ];
  const codigosElegibles = new Set(elegibles.map(e => e.code));

  const bloqueNotas = args.notas.length > 0
    ? args.notas.map(n => `- [${n.source}${n.cotejo === 'pendiente' ? ' — cotejo pendiente' : ''}] ${n.text}`).join('\n')
    : '(no se cargó ninguna nota del corpus legal: no cites ninguna)';

  const user = `PRODUCTO: ${args.descripcion}
${args.usoDestino ? `USO / DESTINO DECLARADO: ${args.usoDestino}\n` : ''}${args.sector ? `SECTOR DECLARADO: ${args.sector}\n` : ''}
SUBPARTIDA ELEGIDA POR EL MOTOR (residual): ${args.subElegida.codeFormatted} — "${args.subElegida.description.trim()}"
  Fracción elegida: ${args.elegida.codeFormatted} — "${args.elegida.description.trim()}"

SUBPARTIDA ESPECÍFICA DE LA MISMA PARTIDA, NO RAZONADA: ${args.candidata.subpartida.codeFormatted} — "${args.candidata.subpartida.description.trim()}"
  Fracciones activas: ${args.candidata.subpartida.fracciones.map(f => `${f.codeFormatted} "${f.description.trim()}"`).join(' | ')}

POR QUÉ SE TRAJO ESTA CANDIDATA: ${args.candidata.motivo}

NOTAS LEGALES DISPONIBLES:
${bloqueNotas}

CÓDIGOS ELEGIBLES (8 dígitos, únicos válidos):
${elegibles.map(e => `- ${e.code} (${e.codeFormatted}): ${e.description.trim()}`).join('\n')}

Aplica la RGI 6 entre ${args.subElegida.codeFormatted} y ${args.candidata.subpartida.codeFormatted} y responde en JSON.`;

  const texto = await (args.llm ?? llmPorDefecto)({ system: SYSTEM_RGI6, user });
  const match = texto.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('el pase RGI 6 no devolvió JSON');
  const parsed = JSON.parse(match[0]) as Partial<VeredictoRGI6>;

  const ganadora = limpiarCodigo(parsed.ganadora ?? '');
  if (!codigosElegibles.has(ganadora)) {
    throw new Error(`el pase RGI 6 devolvió un código fuera de las opciones (${parsed.ganadora ?? 'vacío'})`);
  }
  const justificacion = (parsed.justificacion ?? '').trim();
  const descarte = (parsed.descarte ?? '').trim();
  if (!justificacion || !descarte) {
    throw new Error('el pase RGI 6 no devolvió justificación y descarte por escrito');
  }
  // Candado de catálogo, igual que el resto del motor: nunca sale un código
  // inexistente o inactivo, aunque venga de nuestra propia lista.
  const check = await validateFraction(ganadora);
  if (!check.valid) throw new Error(`el pase RGI 6 eligió una fracción no vigente (${ganadora}: ${check.reason})`);

  return {
    ganadora,
    justificacion,
    descarte,
    notasCitadas: Array.isArray(parsed.notasCitadas) ? parsed.notasCitadas.map(String) : [],
  };
}

// ──────────────────── Orquestador ────────────────────

export type EstadoRGI6 =
  | 'apagado'              // flag off
  | 'sin_catalogo'         // la partida no está en el catálogo cargado
  | 'no_residual'          // la elegida no es residual: la regla no aplica
  | 'sin_candidata'        // es residual pero ninguna hermana específica coincide
  | 'confirmada'           // el pase corrió y ratificó la residual
  | 'reclasificada'        // el pase corrió y ganó la específica
  | 'no_ejecutado';        // el pase falló (LLM caído/429/timeout/JSON roto)

export interface ComparacionRGI6 {
  estado: EstadoRGI6;
  ejecutado: boolean;
  residual: { code: string; codeFormatted: string; description: string; motivo: string } | null;
  candidata: { code: string; codeFormatted: string; description: string; motivo: string } | null;
  /** Código de 8 dígitos ganador (siempre presente cuando el pase corrió). */
  ganadora: string | null;
  justificacion: string | null;
  descarte: string | null;
  notas: NotaRGI6[];
  /** Frase honesta para la pantalla y el dictamen. */
  aviso: string;
  error?: string;
}

export async function compararEspecificaVsResidual(args: {
  descripcion: string;
  usoDestino?: string | null;
  sector?: string | null;
  codigoElegido: string;
  /** Inyectable para tests; por defecto sale del catálogo. */
  hermanas?: SubpartidaHermana[];
  notas?: NotaRGI6[];
  llm?: LlmRGI6;
  env?: NodeJS.ProcessEnv;
}): Promise<ComparacionRGI6> {
  const base: ComparacionRGI6 = {
    estado: 'no_residual', ejecutado: false, residual: null, candidata: null,
    ganadora: null, justificacion: null, descarte: null, notas: [], aviso: '',
  };

  if (!rgi6Activo(args.env ?? process.env)) {
    return { ...base, estado: 'apagado', aviso: 'La comparación RGI 6 específica vs residual está desactivada por configuración.' };
  }

  const limpio = limpiarCodigo(args.codigoElegido);
  const hermanas = args.hermanas ?? await subpartidasHermanas(limpio);
  if (hermanas.length === 0) {
    return { ...base, estado: 'sin_catalogo', aviso: 'La partida de esta fracción no está en el catálogo TIGIE cargado: no se pudo comparar específica vs residual.' };
  }

  const sub = hermanas.find(h => h.code === limpio.slice(0, 6));
  const frac = sub?.fracciones.find(f => f.code === limpio);
  const deteccion = evaluarResidual(limpio, hermanas);
  if (!deteccion.esResidual || !sub || !frac) {
    return { ...base, estado: 'no_residual', aviso: 'La fracción elegida no es residual: la comparación específica vs residual no aplica.' };
  }

  const residual = { code: frac.code, codeFormatted: frac.codeFormatted, description: frac.description, motivo: deteccion.motivo };

  const cand = candidataEspecifica({
    descripcion: args.descripcion,
    usoDestino: args.usoDestino,
    codigoElegido: limpio,
    hermanas,
  });
  if (!cand) {
    return {
      ...base, estado: 'sin_candidata', residual,
      aviso: `${deteccion.motivo} Ninguna subpartida específica de la partida ${limpio.slice(0, 4)} coincide con la descripción ni con el uso declarado, así que la residual se sostiene.`,
    };
  }

  const candidata = {
    code: cand.subpartida.code,
    codeFormatted: cand.subpartida.codeFormatted,
    description: cand.subpartida.description,
    motivo: cand.motivo,
  };

  const notas = args.notas ?? await notasParaRGI6([limpio.slice(0, 2), cand.subpartida.code.slice(0, 2)]).catch(() => []);

  try {
    const veredicto = await pasoRGI6({
      descripcion: args.descripcion,
      usoDestino: args.usoDestino,
      sector: args.sector,
      elegida: residual,
      subElegida: sub,
      candidata: cand,
      notas,
      llm: args.llm,
    });
    const gano = veredicto.ganadora !== limpio;
    return {
      estado: gano ? 'reclasificada' : 'confirmada',
      ejecutado: true,
      residual,
      candidata,
      ganadora: veredicto.ganadora,
      justificacion: veredicto.justificacion,
      descarte: veredicto.descarte,
      notas,
      aviso: gano
        ? `RGI 6 aplicada: se comparó la residual ${residual.codeFormatted} contra la subpartida específica ${candidata.codeFormatted} y ganó la específica.`
        : `RGI 6 aplicada: se comparó la residual ${residual.codeFormatted} contra la subpartida específica ${candidata.codeFormatted} y se ratificó la residual.`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn(`Pase RGI 6 específica-vs-residual no ejecutado: ${msg}`, {
      action: 'rgi6_no_ejecutado',
      entity: 'classification',
      metadata: { codigoElegido: limpio, candidata: candidata.code, error: msg.slice(0, 300) },
    });
    return {
      estado: 'no_ejecutado',
      ejecutado: false,
      residual,
      candidata,
      ganadora: null,
      justificacion: null,
      descarte: null,
      notas,
      aviso: `No se pudo ejecutar la comparación RGI 6 contra la subpartida específica ${candidata.codeFormatted}: se conserva la fracción ${residual.codeFormatted} elegida por el motor. Revísala a mano.`,
      error: msg,
    };
  }
}

// ──────────── 5. Alternativas contradictorias (notas de exclusión) ────────────

/**
 * Notas de EXCLUSIÓN cuya lectura estructurada permite filtrar alternativas.
 * `capitulosExcluidos` y `capitulosQueRetienen` son la lectura estructurada del
 * TEXTO QUE ESTÁ EN EL CORPUS (`referenciaCorpus`), no una fuente nueva: si la
 * fila no existe en `LegalDocument`, no se filtra nada y se dice.
 */
export interface NotaExclusion {
  referenciaCorpus: string;
  /** Cómo se reconoce que el razonamiento la citó. */
  cita: RegExp;
  /** Capítulos a los que la nota IMPIDE mandar la mercancía. */
  capitulosExcluidos: string[];
  /** La exclusión solo opera si la mercancía se quedó en uno de estos capítulos. */
  capitulosQueRetienen: string[];
}

export const NOTAS_EXCLUSION: NotaExclusion[] = [
  {
    referenciaCorpus: 'Nota 2 Sección XVII LIGIE',
    cita: /nota\s*2[^.]{0,40}secci[oó]n\s*xvii\b/i,
    // Del texto del corpus: las partes de cap 86-89 van a su capítulo "salvo …
    // b) partes que sean producto cubierto por una partida específica de cap 84-90".
    capitulosExcluidos: ['86', '87', '88', '89'],
    // La exclusión solo muerde cuando la mercancía se QUEDÓ fuera de 86-89 por
    // estar cubierta por una partida específica de 84-90 (84, 85 y 90). Si la
    // clasificación final ya está en 86-89, la nota respalda esa colocación y
    // no descarta nada.
    capitulosQueRetienen: ['84', '85', '90'],
  },
];

export interface AlternativaClasificacion {
  code: string;
  description: string;
  confidence: number;
  reason: string;
}

export interface FiltradoAlternativas<T extends AlternativaClasificacion> {
  alternativas: T[];
  descartadas: { code: string; reason: string }[];
  /** Frases honestas para el dictamen (incluye el caso "se citó pero no hay corpus"). */
  avisos: string[];
  /** Capítulos que las notas citadas Y disponibles en el corpus excluyen. */
  capitulosExcluidos: string[];
  /** Referencias del corpus que efectivamente operaron el filtro. */
  notasAplicadas: string[];
}

/**
 * Si el razonamiento cita una nota de exclusión y la mercancía se quedó en un
 * capítulo que la nota RETIENE, ninguna alternativa puede vivir en el capítulo
 * excluido: se saca de la lista y queda constancia escrita. Sin la fila del
 * corpus NO se filtra (y se dice en `avisos`).
 */
export async function filtrarAlternativasContradictorias<T extends AlternativaClasificacion>(args: {
  alternativas: T[];
  codigoFinal: string;
  razonamiento: string;
  /** Inyectable para tests: referencias de corpus efectivamente disponibles. */
  referenciasDisponibles?: string[];
}): Promise<FiltradoAlternativas<T>> {
  const capFinal = limpiarCodigo(args.codigoFinal).slice(0, 2);
  const aplicables = NOTAS_EXCLUSION.filter(n =>
    n.cita.test(args.razonamiento) && n.capitulosQueRetienen.includes(capFinal));
  if (aplicables.length === 0) {
    return { alternativas: args.alternativas, descartadas: [], avisos: [], capitulosExcluidos: [], notasAplicadas: [] };
  }

  const disponibles = args.referenciasDisponibles ?? (await prisma.legalDocument.findMany({
    where: { reference: { in: aplicables.map(n => n.referenciaCorpus) } },
    select: { reference: true },
  })).map(d => d.reference);

  const descartadas: { code: string; reason: string }[] = [];
  const avisos: string[] = [];
  const capitulosExcluidos = new Set<string>();
  const notasAplicadas: string[] = [];
  let vivas = args.alternativas;

  for (const nota of aplicables) {
    if (!disponibles.includes(nota.referenciaCorpus)) {
      avisos.push(`El razonamiento cita la ${nota.referenciaCorpus.replace(/ LIGIE$/, '')} pero esa nota no está en el corpus legal cargado: no se filtraron alternativas por ella.`);
      continue;
    }
    notasAplicadas.push(nota.referenciaCorpus);
    for (const c of nota.capitulosExcluidos) capitulosExcluidos.add(c);
    const quedan: T[] = [];
    for (const alt of vivas) {
      const cap = limpiarCodigo(alt.code).slice(0, 2);
      if (cap && nota.capitulosExcluidos.includes(cap)) {
        descartadas.push({
          code: alt.code,
          reason: `Descartada por ${nota.referenciaCorpus.replace(/ LIGIE$/, '')} (cotejo pendiente): el razonamiento invoca esa nota para mantener la mercancía en el capítulo ${capFinal}, así que no puede ofrecerse a la vez una alternativa del capítulo ${cap}.`,
        });
      } else {
        quedan.push(alt);
      }
    }
    vivas = quedan;
  }

  return { alternativas: vivas, descartadas, avisos, capitulosExcluidos: [...capitulosExcluidos].sort(), notasAplicadas };
}
