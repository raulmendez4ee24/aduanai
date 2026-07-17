/**
 * LECTOR DE PEDIMENTOS — mapper: pedimento parseado → operaciones para el
 * Risk Scorer y módulos, con PROVENIENCIA POR CAMPO.
 *
 * Frontera de datos legales (docs/PEDIMENTO_READER_FASE1_DESIGN.md §b,
 * aprobada 17-jul + 3 adiciones):
 *  - paisOrigen: SOLO en importación (501.5 == '1') desde 551.21 — verbatim
 *    v9.0: "En importación, clave del país de origen de las mercancías o
 *    donde se produjeron" → F3 puede dispararse como VERIFICADO.
 *  - paisProcedencia: NO SE RELLENA (el archivo M no trae ese dato; 551.22
 *    es vendedor y 505.9 es país del CFDI — usarlos sería fabricación).
 *  - preferenciaArancelaria / mveTransmitida / transferenciaDeTemporales:
 *    NO se derivan en v1 (pendiente cotejo Apéndices 2/8, cambio separado).
 *  - Claves de contribución/identificador/permiso se exponen CRUDAS con su
 *    clave numérica — sin semántica inventada (Apéndice 12/8 pendiente de
 *    vendorear con cotejo).
 *  - Los campos que el archivo no trae NO se rellenan.
 */
import { CLAVES_PEDIMENTO } from '../../lib/anexo22';
import { LAYOUT_VERSION } from './layout-v9';
import type { PedimentoParseado, PartidaParseada } from './parser';
import type { OperacionInput } from '../risk-scorer/types';

/** Proveniencia de un dato extraído: la semilla de la frontera canónica. */
export interface Proveniencia {
  archivo: { nombre: string; sha256: string };
  layoutVersion: string;
  metodo: 'determinista';
  fechaExtraccion: string; // ISO
  /** dato → "registro.campo@Línea" (posiciones 1-based de la spec). */
  campos: Record<string, string>;
}

export interface ContribucionCruda {
  clave: string;       // Apéndice 12 (sin semántica en v1)
  formaPago?: string;  // Apéndice 13
  importeMxn?: number;
  tasa?: string;
  tipoTasa?: string;
  nivel: 'pedimento' | 'partida';
}

export interface OperacionExtraida {
  pedimento: {
    numeroPedimento7: string; patente: string; aduanaSeccion: string;
    clavePedimento: string; tipoOperacion: string; regimenDerivado: string | null;
    rfcImportador: string; nombreImportador: string;
    tipoCambio: number | null; pesoBrutoTotal: number | null;
    incrementables: { fletes: number; seguros: number; embalajes: number; otros: number };
    decrementables: { fletes: number; seguros: number; carga: number; descarga: number; otros: number };
    fechas: { tipo: string; fecha: string }[];
    facturas: { fecha: string; numeroCfdiOAcuseValor: string; incoterm: string; moneda: string; valorUsd: number; valorMoneda: number; pais: string; proveedorIdFiscal: string; proveedorNombre: string }[];
    identificadoresG: { clave: string; complemento1: string; complemento2: string; complemento3: string }[];
    contribucionesG: ContribucionCruda[];
    descargos: { patenteOriginal: string; pedimentoOriginal: string; aduanaOriginal: string; claveDocOriginal: string; fraccionDescargada: string }[];
    numeroPedimento15: string | null;
  };
  partida: {
    numeroPartida: number; fraccion: string; nico: string;
    descripcion: string; precioUnitario: number | null;
    valorAduanaMxn: number | null; valorComercialMxn: number | null; valorUsd: number | null;
    cantidadUmc: number | null; cantidadUmt: number | null;
    vinculacion: string; metodoValoracion: string;
    paisOrigenODestino: string; paisVendedorOComprador: string;
    permisos: { clave: string; firmaDescargo: string; numero: string }[];
    identificadores: { clave: string; complemento1: string; complemento2: string; complemento3: string }[];
    contribuciones: ContribucionCruda[];
  };
  /** Entrada del motor de riesgo — solo campos derivables del archivo. */
  operacion: OperacionInput;
  /** Señales de operación auto-llenadas: 'verificado por sistema: archivo M'. */
  origenDatos: 'verificado por sistema: archivo M';
  proveniencia: Proveniencia;
}

const num = (s: string | undefined): number | null => (s === undefined || s === '' ? null : Number(s));

/**
 * Reconstrucción del número de pedimento de 15 dígitos (AÑO2 ADUANA2 PATENTE4
 * CONSECUTIVO7, Anexo 22 campo 1 — ya vendoreado en validatePedimentoNumero):
 *  - AÑO: de la fecha de ENTRADA (506 tipo 1; catálogo verbatim v9.0
 *    "1. ENTRADA. Fecha de entrada a territorio nacional").
 *  - Cruce obligado: el primer dígito del consecutivo debe ser el último
 *    dígito del año (criterios 500.4 verbatim). Si no cruza o falta la
 *    fecha → NO se reconstruye (el campo ausente no se rellena).
 *  - ADUANA: 2 primeros caracteres de la aduana-sección de despacho (501.4).
 */
function reconstruirNumero15(ped: PedimentoParseado): { valor: string | null; fuente: string } {
  const fechaEntrada = ped.fechas.find(f => f.campos[2] === '1')?.campos[3];
  if (!fechaEntrada) return { valor: null, fuente: 'sin 506 tipo 1 (ENTRADA) — no se reconstruye' };
  const yy = fechaEntrada.slice(2, 4);
  const consecutivo = ped.r501.campos[2]!;
  if (consecutivo[0] !== yy[1]) {
    return { valor: null, fuente: `primer dígito del consecutivo (${consecutivo[0]}) ≠ último dígito del año ${fechaEntrada.slice(0, 4)} — no se reconstruye` };
  }
  const aduana2 = ped.r501.campos[3]!.slice(0, 2);
  if (aduana2.length !== 2) return { valor: null, fuente: 'aduana-sección 501.4 sin 2 caracteres — no se reconstruye' };
  return {
    // Formato de presentación del Anexo 22 (bloques separados por espacio),
    // el que valida lib/anexo22.validatePedimentoNumero.
    valor: `${yy} ${aduana2} ${ped.patente.padStart(4, '0')} ${consecutivo.padStart(7, '0')}`,
    fuente: 'derivado: 506.4(tipo 1) + 501.4[1-2] + 501.2 + 501.3 (Anexo 22 campo 1)',
  };
}

function contribucionesDe(p: PartidaParseada): ContribucionCruda[] {
  const tasas = new Map(p.tasas.map(t => [t.campos[4]!, t]));
  return p.contribuciones.map(c => ({
    clave: c.campos[4]!, formaPago: c.campos[5]!, importeMxn: num(c.campos[6]) ?? 0,
    tasa: tasas.get(c.campos[4]!)?.campos[5], tipoTasa: tasas.get(c.campos[4]!)?.campos[6],
    nivel: 'partida' as const,
  }));
}

/** Una operación por partida (el Risk Scorer evalúa por operación/fracción). */
export function mapearOperaciones(
  archivo: { nombre: string; sha256: string },
  ped: PedimentoParseado,
): OperacionExtraida[] {
  const ahora = new Date().toISOString();
  const L = (r: { linea: number }) => `L${r.linea}`;
  const r501 = ped.r501;
  const tipoOperacion = r501.campos[4]!;
  const clavePedimento = r501.campos[5]!;
  // Derivación catalogada: clave de pedimento → régimen vía Apéndice 2/16
  // (server/src/lib/anexo22.ts, fuente única DOF 15-ene-2026). Cuando la clave
  // admite varios regímenes (p.ej. A1 → IMD/EXD), desambigua el tipo de
  // operación (501.5). Si aún así es ambiguo → null (no se inventa).
  const claveInfo = CLAVES_PEDIMENTO.find(c => c.clave === clavePedimento);
  let regimenDerivado: string | null = null;
  if (claveInfo) {
    if (claveInfo.regimenes.length === 1) regimenDerivado = claveInfo.regimenes[0]!;
    else if (claveInfo.regimenes.length > 1) {
      const filtro = tipoOperacion === '1'
        ? (r: string) => r.startsWith('I') || r === 'DFI'
        : (r: string) => r.startsWith('E');
      const candidatos = claveInfo.regimenes.filter(filtro);
      if (candidatos.length === 1) regimenDerivado = candidatos[0]!;
    }
  }
  const numero15 = reconstruirNumero15(ped);

  const cabecera: OperacionExtraida['pedimento'] = {
    numeroPedimento7: ped.numeroPedimento7, patente: ped.patente, aduanaSeccion: r501.campos[3]!,
    clavePedimento, tipoOperacion, regimenDerivado,
    rfcImportador: r501.campos[8]!, nombreImportador: r501.campos[21]!,
    tipoCambio: num(r501.campos[10]), pesoBrutoTotal: num(r501.campos[16]),
    incrementables: { fletes: num(r501.campos[11]) ?? 0, seguros: num(r501.campos[12]) ?? 0, embalajes: num(r501.campos[13]) ?? 0, otros: num(r501.campos[14]) ?? 0 },
    decrementables: { fletes: num(r501.campos[30]) ?? 0, seguros: num(r501.campos[31]) ?? 0, carga: num(r501.campos[32]) ?? 0, descarga: num(r501.campos[33]) ?? 0, otros: num(r501.campos[34]) ?? 0 },
    fechas: ped.fechas.map(f => ({ tipo: f.campos[2]!, fecha: f.campos[3]! })),
    facturas: ped.facturas.map(f => ({
      fecha: f.campos[2]!, numeroCfdiOAcuseValor: f.campos[3]!, incoterm: f.campos[4]!,
      moneda: f.campos[5]!, valorUsd: num(f.campos[6]) ?? 0, valorMoneda: num(f.campos[7]) ?? 0,
      pais: f.campos[8]!, proveedorIdFiscal: f.campos[10]!, proveedorNombre: f.campos[11]!,
    })),
    identificadoresG: ped.identificadoresG.map(i => ({ clave: i.campos[2]!, complemento1: i.campos[3]!, complemento2: i.campos[4]!, complemento3: i.campos[5]! })),
    contribucionesG: ped.contribucionesG.map(c => ({ clave: c.campos[2]!, formaPago: c.campos[3]!, importeMxn: num(c.campos[4]) ?? 0, nivel: 'pedimento' as const })),
    descargos: ped.descargos.map(d => ({ patenteOriginal: d.campos[2]!, pedimentoOriginal: d.campos[3]!, aduanaOriginal: d.campos[4]!, claveDocOriginal: d.campos[5]!, fraccionDescargada: d.campos[7]! })),
    numeroPedimento15: numero15.valor,
  };

  return ped.partidas.map((p): OperacionExtraida => {
    const c = p.r551.campos;
    const esImportacion = tipoOperacion === '1';
    const moneda = ped.facturas.length === 1 ? ped.facturas[0]!.campos[5]! : undefined;

    const operacion: OperacionInput = {
      fraccion: c[2]!,
      nico: c[4] || undefined,
      valorUnitario: num(c[6]) ?? undefined,
      cantidad: num(c[10]) ?? undefined,
      moneda,
      // Verbatim 551.21: "En importación, clave del país de origen de las
      // mercancías o donde se produjeron" → SOLO importación llena origen.
      paisOrigen: esImportacion && c[20] ? c[20] : undefined,
      // paisProcedencia: NO derivable del archivo M — no se rellena.
      regimen: regimenDerivado ?? undefined,
      clavePedimento,
      numeroPedimento: numero15.valor ?? undefined,
      importadorRfc: r501.campos[8] || undefined,
      // preferenciaArancelaria: NO se deriva en v1 (cotejo Apéndice 8 pendiente).
    };

    const campos: Record<string, string> = {
      fraccion: `551.3@${L(p.r551)}`,
      nico: `551.5@${L(p.r551)}`,
      valorUnitario: `551.7@${L(p.r551)}`,
      valorAduanaMxn: `551.8@${L(p.r551)}`,
      valorComercialMxn: `551.9@${L(p.r551)}`,
      valorUsd: `551.10@${L(p.r551)}`,
      cantidad: `551.11@${L(p.r551)}`,
      vinculacion: `551.16@${L(p.r551)}`,
      metodoValoracion: `551.17@${L(p.r551)}`,
      importadorRfc: `501.9@${L(r501)}`,
      clavePedimento: `501.6@${L(r501)}`,
      tipoOperacion: `501.5@${L(r501)}`,
      tipoCambio: `501.11@${L(r501)}`,
      incrementables: `501.12-15@${L(r501)}`,
      decrementables: `501.31-35@${L(r501)}`,
      aduanaSeccion: `501.4@${L(r501)}`,
      patente: `500.3/501.2@${L(r501)}`,
    };
    if (esImportacion && c[20]) campos.paisOrigen = `551.21@${L(p.r551)}`;
    if (moneda) campos.moneda = `505.6@${L(ped.facturas[0]!)}`;
    if (regimenDerivado) campos.regimen = `derivado: 501.6 (Apéndice 2, lib/anexo22.ts)`;
    if (numero15.valor) campos.numeroPedimento = numero15.fuente;

    return {
      pedimento: cabecera,
      partida: {
        numeroPartida: p.numeroPartida, fraccion: c[2]!, nico: c[4]!,
        descripcion: c[5]!, precioUnitario: num(c[6]),
        valorAduanaMxn: num(c[7]), valorComercialMxn: num(c[8]), valorUsd: num(c[9]),
        cantidadUmc: num(c[10]), cantidadUmt: num(c[12]),
        vinculacion: c[15]!, metodoValoracion: c[16]!,
        paisOrigenODestino: c[20]!, paisVendedorOComprador: c[21]!,
        permisos: p.permisos.map(x => ({ clave: x.campos[4]!, firmaDescargo: x.campos[5]!, numero: x.campos[6]! })),
        identificadores: p.identificadores.map(x => ({ clave: x.campos[4]!, complemento1: x.campos[5]!, complemento2: x.campos[6]!, complemento3: x.campos[7]! })),
        contribuciones: contribucionesDe(p),
      },
      operacion,
      origenDatos: 'verificado por sistema: archivo M',
      proveniencia: {
        archivo, layoutVersion: LAYOUT_VERSION, metodo: 'determinista',
        fechaExtraccion: ahora, campos,
      },
    };
  });
}
