/**
 * LECTOR DE PEDIMENTOS — parser determinista del archivo M (SAAI M3).
 *
 * CERO LLM. CERO inferencia. Cada línea se valida contra la aridad y tipos
 * EXACTOS del layout oficial v9.0 (layout-v9.ts) ANTES de extraer un solo
 * dato. Ante desajuste de forma: FALLA CERRADO con mensaje accionable —
 * jamás se parsea "lo que alcance".
 *
 * Granularidad (diseño §c aprobado 17-jul):
 *  - Drift de FORMA (aridad/tipo/integridad de conteos) → falla el ARCHIVO completo.
 *  - Tipo de MOVIMIENTO no soportado (≠ Pedimento Nuevo) o rectificación →
 *    se excluye ESE pedimento con motivo; el resto del lote continúa.
 *  - Fracción inexistente/muerta NO es asunto del parser: se extrae tal cual
 *    y el motor de riesgo la convierte en señal F6 (adición aprobada 17-jul).
 *
 * VALIDADO CONTRA LAYOUT OFICIAL; VALIDACIÓN CON ARCHIVOS REALES PENDIENTE.
 */
import crypto from 'crypto';
import {
  ARIDAD, CAMPOS, LAYOUT_VERSION, LAYOUT_FUENTE_URL, MOVIMIENTOS,
  MOVIMIENTO_PROCESABLE, NOMBRE_ARCHIVO_REGEX, POS_NUMERO_PEDIMENTO,
  TOLERANCIA_MXN_POR_PARTIDA, TOLERANCIA_USD_POR_RENGLON,
} from './layout-v9';

export class ArchivoMError extends Error {
  readonly detalles: string[];
  constructor(mensaje: string, detalles: string[] = []) {
    super(
      `archivo no coincide con layout ${LAYOUT_VERSION} — ${mensaje} — ` +
      `versión distinta del layout o archivo corrupto (spec: ${LAYOUT_FUENTE_URL})`,
    );
    this.name = 'ArchivoMError';
    this.detalles = detalles;
  }
}

/** Registro crudo validado: campos 1-based (campos[0] = campo 1 de la spec). */
export interface RegistroCrudo {
  tipo: number;
  linea: number;      // 1-based en el archivo
  campos: string[];
}

export interface PartidaParseada {
  numeroPartida: number;
  r551: RegistroCrudo;
  permisos: RegistroCrudo[];        // 553
  identificadores: RegistroCrudo[]; // 554
  tasas: RegistroCrudo[];           // 556
  contribuciones: RegistroCrudo[];  // 557
}

export interface PedimentoParseado {
  movimiento: string;
  patente: string;
  numeroPedimento7: string;
  aduanaSeccion: string;
  lineaInicio: number;
  r501: RegistroCrudo;
  facturas: RegistroCrudo[];        // 505
  fechas: RegistroCrudo[];          // 506
  identificadoresG: RegistroCrudo[];// 507
  tasasG: RegistroCrudo[];          // 509
  contribucionesG: RegistroCrudo[]; // 510
  descargos: RegistroCrudo[];       // 512
  partidas: PartidaParseada[];
  r800: RegistroCrudo | null;
}

export interface PedimentoExcluido {
  numeroPedimento7: string;
  patente: string;
  lineaInicio: number;
  motivo: string;
}

export interface ArchivoParseado {
  archivo: { nombre: string; sha256: string; lineas: number };
  layoutVersion: string;
  pedimentos: PedimentoParseado[];
  excluidos: PedimentoExcluido[];
  /** Registros de tipos conocidos pero no extraídos en v1 — contados, jamás silenciosos. */
  registrosIgnorados: Record<string, number>;
  advertenciasIntegridad: string[];
}

const FECHA_RE = /^\d{8}$/;
const ENTERO_RE = /^\d+$/;
const DECIMAL_RE = /^\d+(\.\d+)?$/;

function validarCampo(tipoReg: number, linea: number, def: { campo: number; nombre: string; tipo: string; max: number }, valor: string): string | null {
  if (valor === '') return null; // vacío = campo opcional no declarado (la spec lo permite por campo)
  if (def.tipo === 'N' && !ENTERO_RE.test(valor)) {
    return `L${linea} registro ${tipoReg} campo ${def.campo} (${def.nombre}): se esperaba numérico entero, se encontró "${valor.slice(0, 20)}"`;
  }
  if (def.tipo === 'D' && !DECIMAL_RE.test(valor)) {
    return `L${linea} registro ${tipoReg} campo ${def.campo} (${def.nombre}): se esperaba decimal, se encontró "${valor.slice(0, 20)}"`;
  }
  if (def.tipo === 'F') {
    if (!FECHA_RE.test(valor)) return `L${linea} registro ${tipoReg} campo ${def.campo} (${def.nombre}): se esperaba fecha AAAAMMDD, se encontró "${valor.slice(0, 20)}"`;
    const mm = Number(valor.slice(4, 6)), dd = Number(valor.slice(6, 8)), yyyy = Number(valor.slice(0, 4));
    if (yyyy < 1990 || yyyy > 2100 || mm < 1 || mm > 12 || dd < 1 || dd > 31) {
      return `L${linea} registro ${tipoReg} campo ${def.campo} (${def.nombre}): fecha implausible "${valor}"`;
    }
  }
  if (def.max > 0 && valor.length > def.max) {
    return `L${linea} registro ${tipoReg} campo ${def.campo} (${def.nombre}): longitud ${valor.length} > máxima ${def.max}`;
  }
  return null;
}

/**
 * Parsea y valida un archivo M completo. Lanza ArchivoMError ante drift de forma.
 * `nombreArchivo` debe ser el nombre ORIGINAL del archivo (validación cruzada
 * obligatoria contra 801.2 — diseño §c.2).
 */
export function parseArchivoM(nombreArchivo: string, contenido: string): ArchivoParseado {
  const sha256 = crypto.createHash('sha256').update(contenido, 'utf8').digest('hex');
  const errores: string[] = [];
  const advertencias: string[] = [];

  // La spec exige separador line feed (control-J). Un \r final por línea (CRLF
  // de tránsito por Windows) se tolera con advertencia explícita — no en silencio.
  let texto = contenido;
  if (texto.includes('\r')) {
    advertencias.push('El archivo contiene retornos de carro (CRLF); la spec v9.0 indica separador line feed. Se normalizó para el parseo.');
    texto = texto.replace(/\r/g, '');
  }
  const lineasRaw = texto.split('\n');
  while (lineasRaw.length > 0 && lineasRaw[lineasRaw.length - 1]!.trim() === '') lineasRaw.pop();
  if (lineasRaw.length < 2) throw new ArchivoMError('el archivo no contiene registros suficientes (mínimo 500 y 801)');

  // ── Paso 1: validación de forma línea por línea (aridad exacta + tipos) ──
  const registros: RegistroCrudo[] = [];
  for (let i = 0; i < lineasRaw.length; i++) {
    const linea = i + 1;
    const cruda = lineasRaw[i]!;
    if (cruda.trim() === '') { errores.push(`L${linea}: línea vacía intermedia (la spec no la contempla)`); continue; }
    const campos = cruda.split('|');
    const tipoStr = campos[0]!;
    const tipo = Number(tipoStr);
    if (!ENTERO_RE.test(tipoStr) || !(tipo in ARIDAD)) {
      errores.push(`L${linea}: tipo de registro desconocido "${tipoStr.slice(0, 10)}" (no existe en la spec v9.0)`);
      continue;
    }
    const esperados = ARIDAD[tipo]!;
    if (campos.length !== esperados) {
      errores.push(`L${linea} registro ${tipo}: esperados ${esperados} campos, encontrados ${campos.length}`);
      continue;
    }
    const defs = CAMPOS[tipo];
    if (defs) {
      for (const def of defs) {
        const err = validarCampo(tipo, linea, def, campos[def.campo - 1]!);
        if (err) errores.push(err);
      }
    }
    registros.push({ tipo, linea, campos });
    if (errores.length >= 10) break; // suficiente evidencia de drift
  }
  if (errores.length > 0) {
    throw new ArchivoMError(`${errores.length >= 10 ? 'al menos ' : ''}${errores.length} desajustes de forma (primero: ${errores[0]})`, errores);
  }

  // ── Paso 2: estructura — 500 abre pedimento, 800 lo cierra, 801 cierra archivo ──
  if (registros[0]!.tipo !== 500) throw new ArchivoMError(`L${registros[0]!.linea}: el primer registro debe ser 500 (Inicio de Pedimento), se encontró ${registros[0]!.tipo}`);
  const r801 = registros[registros.length - 1]!;
  if (r801.tipo !== 801) throw new ArchivoMError(`L${r801.linea}: el último registro debe ser 801 (Fin de Archivo), se encontró ${r801.tipo}`);
  if (registros.filter(r => r.tipo === 801).length !== 1) throw new ArchivoMError('el registro 801 debe ser único por archivo (criterios 801.1)');

  interface Grupo { r500: RegistroCrudo; cuerpo: RegistroCrudo[]; r800: RegistroCrudo | null }
  const grupos: Grupo[] = [];
  let actual: Grupo | null = null;
  for (const reg of registros.slice(0, -1)) {
    if (reg.tipo === 500) {
      if (actual && !actual.r800) throw new ArchivoMError(`L${reg.linea}: nuevo 500 sin que el pedimento anterior (L${actual.r500.linea}) cerrara con 800`);
      actual = { r500: reg, cuerpo: [], r800: null };
      grupos.push(actual);
      continue;
    }
    if (!actual) throw new ArchivoMError(`L${reg.linea}: registro ${reg.tipo} antes del primer 500`);
    if (actual.r800) throw new ArchivoMError(`L${reg.linea}: registro ${reg.tipo} después del 800 del pedimento (el 800 cierra el pedimento)`);
    if (reg.tipo === 800) { actual.r800 = reg; continue; }
    actual.cuerpo.push(reg);
    // Validación cruzada: número de pedimento del registro == 500.4 vigente
    const pos = POS_NUMERO_PEDIMENTO[reg.tipo];
    if (pos) {
      const num = reg.campos[pos - 1]!;
      if (num !== actual.r500.campos[3]) {
        throw new ArchivoMError(`L${reg.linea} registro ${reg.tipo}: número de pedimento "${num}" ≠ "${actual.r500.campos[3]}" del 500 vigente (L${actual.r500.linea})`);
      }
    }
  }

  // ── Paso 3: integridad del 801 (verbatim: total de registros SIN considerar el 801) ──
  const totalPedimentos = grupos.length;
  const totalRegistrosSin801 = registros.length - 1;
  if (Number(r801.campos[2]) !== totalPedimentos) {
    throw new ArchivoMError(`801.3 declara ${r801.campos[2]} pedimentos; el archivo contiene ${totalPedimentos}`);
  }
  if (Number(r801.campos[3]) !== totalRegistrosSin801) {
    throw new ArchivoMError(`801.4 declara ${r801.campos[3]} registros; el archivo contiene ${totalRegistrosSin801} (sin considerar el 801)`);
  }
  const nombre801 = r801.campos[1]!;
  if (!NOMBRE_ARCHIVO_REGEX.test(nombre801)) {
    throw new ArchivoMError(`801.2 "${nombre801}" no cumple el formato mppppnnn.ddd (criterios 801.2)`);
  }
  if (nombre801.toLowerCase() !== nombreArchivo.trim().toLowerCase()) {
    throw new ArchivoMError(`el nombre del archivo ("${nombreArchivo}") no coincide con 801.2 ("${nombre801}") — pasa el archivo con su nombre original`);
  }
  const patenteNombre = nombre801.slice(1, 5);
  if (r801.campos[4] === '') advertencias.push('801.5 (clave de prevalidador) vacío — archivo posiblemente previo al ciclo de prevalidación.');

  // ── Paso 4: por pedimento — movimiento, patente, partidas por llave ──
  const pedimentos: PedimentoParseado[] = [];
  const excluidos: PedimentoExcluido[] = [];
  const ignorados: Record<string, number> = {};

  for (const g of grupos) {
    const movimiento = g.r500.campos[1]!;
    const patente = g.r500.campos[2]!;
    const numero7 = g.r500.campos[3]!;
    const aduana = g.r500.campos[4]!;
    if (patente !== patenteNombre) {
      throw new ArchivoMError(`L${g.r500.linea}: patente del 500 ("${patente}") ≠ patente del nombre de archivo ("${patenteNombre}")`);
    }
    const base: PedimentoExcluido = { numeroPedimento7: numero7, patente, lineaInicio: g.r500.linea, motivo: '' };

    if (movimiento !== MOVIMIENTO_PROCESABLE) {
      base.motivo = `tipo de movimiento ${movimiento} (${MOVIMIENTOS[movimiento] ?? 'desconocido'}) — v1 procesa solo Pedimento Nuevo`;
      excluidos.push(base);
      continue;
    }
    if (g.cuerpo.some(r => r.tipo === 701 || r.tipo === 702)) {
      base.motivo = 'pedimento de rectificación (registros 701/702) — v1 lo detecta y reporta sin puntuar (decisión de diseño aprobada)';
      excluidos.push(base);
      continue;
    }

    const r501s = g.cuerpo.filter(r => r.tipo === 501);
    if (r501s.length !== 1) throw new ArchivoMError(`pedimento ${numero7} (L${g.r500.linea}): se esperaba exactamente un registro 501, hay ${r501s.length}`);
    const r501 = r501s[0]!;
    if (r501.campos[1] !== patente) throw new ArchivoMError(`L${r501.linea}: patente del 501 ("${r501.campos[1]}") ≠ patente del 500 ("${patente}")`);
    if (!g.r800) throw new ArchivoMError(`pedimento ${numero7} (L${g.r500.linea}): sin registro 800 de cierre`);

    const by = (t: number) => g.cuerpo.filter(r => r.tipo === t);
    // Partidas: unión por llave (fracción + número de partida), no por posición.
    const partidas = new Map<number, PartidaParseada>();
    for (const r of by(551)) {
      const np = Number(r.campos[3]);
      if (partidas.has(np)) throw new ArchivoMError(`L${r.linea}: número de partida ${np} duplicado en el pedimento ${numero7}`);
      partidas.set(np, { numeroPartida: np, r551: r, permisos: [], identificadores: [], tasas: [], contribuciones: [] });
    }
    const ADJUNTOS: Array<[number, keyof Omit<PartidaParseada, 'numeroPartida' | 'r551'>]> =
      [[553, 'permisos'], [554, 'identificadores'], [556, 'tasas'], [557, 'contribuciones']];
    for (const [tipo, destino] of ADJUNTOS) {
      for (const r of by(tipo)) {
        const np = Number(r.campos[3]);
        const p = partidas.get(np);
        if (!p) throw new ArchivoMError(`L${r.linea} registro ${tipo}: refiere la partida ${np}, inexistente en el pedimento ${numero7}`);
        if (r.campos[2] !== p.r551.campos[2]) {
          throw new ArchivoMError(`L${r.linea} registro ${tipo}: fracción "${r.campos[2]}" ≠ "${p.r551.campos[2]}" de la partida ${np}`);
        }
        p[destino].push(r);
      }
    }
    // Registros conocidos no extraídos en v1: contar, jamás silenciar.
    for (const r of g.cuerpo) {
      if (![501, 505, 506, 507, 509, 510, 512, 551, 553, 554, 556, 557].includes(r.tipo)) {
        ignorados[String(r.tipo)] = (ignorados[String(r.tipo)] ?? 0) + 1;
      }
    }

    const ped: PedimentoParseado = {
      movimiento, patente, numeroPedimento7: numero7, aduanaSeccion: aduana,
      lineaInicio: g.r500.linea, r501,
      facturas: by(505), fechas: by(506), identificadoresG: by(507),
      tasasG: by(509), contribucionesG: by(510), descargos: by(512),
      partidas: [...partidas.values()].sort((a, b) => a.numeroPartida - b.numeroPartida),
      r800: g.r800,
    };

    // ── Paso 5: aritmética con tolerancia EXPLÍCITA (detector de drift semántico) ──
    const suma557 = new Map<string, { suma: number; n: number }>();
    for (const p of ped.partidas) for (const c of p.contribuciones) {
      const clave = c.campos[4]!;
      const cur = suma557.get(clave) ?? { suma: 0, n: 0 };
      cur.suma += Number(c.campos[6] || 0); cur.n += 1;
      suma557.set(clave, cur);
    }
    const suma510 = new Map<string, number>();
    for (const c of ped.contribucionesG) {
      const clave = c.campos[2]!;
      suma510.set(clave, (suma510.get(clave) ?? 0) + Number(c.campos[4] || 0));
    }
    for (const [clave, { suma, n }] of suma557) {
      const global = suma510.get(clave);
      const tol = n * TOLERANCIA_MXN_POR_PARTIDA;
      if (global === undefined) {
        advertencias.push(`Pedimento ${numero7}: contribución clave ${clave} con desglose por partida (557) sin renglón global (510).`);
      } else if (Math.abs(suma - global) > tol) {
        advertencias.push(`Pedimento ${numero7}: ARITMETICA_CONTRIBUCIONES clave ${clave} — Σ557=${suma} vs 510=${global} (tolerancia ±${tol} MXN).`);
      }
    }
    const sumaUsd551 = ped.partidas.reduce((a, p) => a + Number(p.r551.campos[9] || 0), 0);
    const sumaUsd505 = ped.facturas.reduce((a, f) => a + Number(f.campos[6] || 0), 0);
    if (ped.facturas.length > 0) {
      const tol = (ped.partidas.length + ped.facturas.length) * TOLERANCIA_USD_POR_RENGLON;
      if (Math.abs(sumaUsd551 - sumaUsd505) > tol + 1e-9) {
        advertencias.push(`Pedimento ${numero7}: ARITMETICA_VALORES — Σ551.10=${sumaUsd551.toFixed(2)} USD vs Σ505.7=${sumaUsd505.toFixed(2)} USD (tolerancia ±${tol.toFixed(2)} USD).`);
      }
    }

    pedimentos.push(ped);
  }

  return {
    archivo: { nombre: nombre801.toLowerCase(), sha256, lineas: registros.length },
    layoutVersion: LAYOUT_VERSION,
    pedimentos, excluidos, registrosIgnorados: ignorados,
    advertenciasIntegridad: advertencias,
  };
}
