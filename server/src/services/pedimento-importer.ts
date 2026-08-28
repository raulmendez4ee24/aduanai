/**
 * IMPORTADOR DE PEDIMENTOS — archivo M3 (SAAI) o Data Stage → Pedimento +
 * PedimentoPartida persistidos (Operación 2026-08, Ola 1).
 *
 * "La entrada de datos real es el archivo M3 y el Data Stage — no la
 * recaptura." Reutiliza el parser determinista del Radar (parser.ts +
 * mapper.ts) y el parser por encabezados de Data Stage (datastage.ts).
 *
 * Idempotencia: mismo tenant + mismo `archivoHash` + mismo número de
 * pedimento → devuelve el pedimento ya persistido (no duplica).
 *
 * Lo que el archivo NO trae no se fabrica: se lista en `datosNoDisponibles`
 * y las reglas que lo necesitan quedan `no_evaluado` en el prevalidador.
 */
import { prisma } from '../lib/prisma';
import { CLAVES_PEDIMENTO, MEDIOS_TRANSPORTE, claveUnidadMedida } from '../lib/anexo22';
import { parseArchivoM, ArchivoMError, type ArchivoParseado } from './pedimento-reader/parser';
import { mapearOperaciones } from './pedimento-reader/mapper';
import { LAYOUT_VERSION as M3_LAYOUT_VERSION } from './pedimento-reader/layout-v9';
import { parseDataStage, DataStageError, DATASTAGE_LAYOUT_VERSION, type CampoDataStage } from './pedimento-reader/datastage';
import type { PedimentoInput, PartidaInput, DatoNoDisponible } from './prevalidator-v2';

export type OrigenArchivo = 'M3' | 'DATASTAGE';

export interface IdentificadorImportado { codigo: string; complemento1?: string; complemento2?: string; complemento3?: string }
export interface PermisoImportado { tipo: string; codigo: string; autoridad: string }

export interface PartidaNormalizada {
  numeroPartida: number;
  fraccion: string;
  nico: string;
  descripcion: string;
  cantidad: number;          // en UMC
  unidadMedidaCom: string;   // clave Apéndice 7 (UMC)
  cantidadUmt: number | null;
  unidadMedida: string;      // clave Apéndice 7 (UMT)
  valorUnitario: number;     // USD
  valorAduanaUsd: number;    // 551.10
  valorAduanaMxn: number | null;
  valorComercialMxn: number | null;
  pais: string;
  paisVendedor: string;
  igi: number | null;
  iva: number | null;
  permisos: PermisoImportado[];
  identificadores: IdentificadorImportado[];
}

export interface PedimentoNormalizado {
  origenArchivo: OrigenArchivo;
  layoutVersion: string;
  archivoHash: string;
  numero: string;            // 15 dígitos formateados si se pudo reconstruir; si no, el consecutivo
  numero7: string;
  clave: string;
  aduana: string;            // 2 dígitos (Apéndice 1)
  aduanaSeccion: string;
  patente: string;
  rfcImportador: string;
  curp: string | null;
  nombreImportador: string | null;
  tipoOperacion: 'IMP' | 'EXP';
  regimen: string;           // '' si no se pudo derivar
  pesoBruto: number;
  tipoCambio: number;
  incoterm: string;
  medioTransporteClave: string | null;
  transporte: string;        // descripción Apéndice 3 o ''
  factura: string | null;
  cove: string | null;
  bl: string | null;
  valorAduanaMxn: number;
  valorComercialMxn: number;
  valorDolares: number;
  identificadoresPedimento: IdentificadorImportado[];
  proveedores: { nombre: string; idFiscal: string; pais: string }[];
  partidas: PartidaNormalizada[];
  datosNoDisponibles: DatoNoDisponible[];
  advertencias: string[];
}

export type LayoutDetectado = 'M3' | 'DATASTAGE' | 'DESCONOCIDO';

/** Detección determinista: un archivo M3 SIEMPRE abre con registro 500. */
export function detectarLayout(contenido: string): LayoutDetectado {
  const primera = contenido.replace(/^\uFEFF/, '').split(/\r?\n/).find(l => l.trim() !== '') ?? '';
  if (/^500\|/.test(primera)) return 'M3';
  const cols = primera.split(/[|;,\t]/);
  if (cols.length >= 3 && /[a-záéíóúñ]/i.test(primera)) return 'DATASTAGE';
  return 'DESCONOCIDO';
}

const num = (s: string | undefined | null, def = 0): number => {
  if (s === undefined || s === null || s === '') return def;
  const n = Number(String(s).replace(/,/g, ''));
  return Number.isFinite(n) ? n : def;
};

// ── M3 → normalizado ──────────────────────────────────────────────────────

export function normalizarDesdeM3(archivo: ArchivoParseado): PedimentoNormalizado[] {
  return archivo.pedimentos.map(ped => {
    const ops = mapearOperaciones(archivo.archivo, ped);
    const cab = ops[0]?.pedimento;
    if (!cab) {
      throw new ArchivoMError(`pedimento ${ped.numeroPedimento7}: sin partidas (551) — no se puede importar`);
    }
    const r501 = ped.r501.campos;
    const medioClave = r501[19] || r501[18] || r501[17] || null; // 501.20 entrada/salida, 501.19 arribo, 501.18 salida
    const medio = medioClave ? MEDIOS_TRANSPORTE.find(m => m.clave === medioClave) : undefined;
    const facturas = cab.facturas;
    // 505.4 es "Número de CFDI o documento equivalente o acuse de valor": es
    // LA referencia de la factura en el pedimento (desde el COVE, el acuse de
    // valor sustituye al número de factura). Se toma como `factura`; si el
    // texto luce como COVE también llena `cove`; si no, el COVE queda no
    // disponible (el layout no lo distingue) — nunca se fabrica.
    const refs = facturas.map(f => f.numeroCfdiOAcuseValor).filter(Boolean);
    const coves = refs.filter(r => /^COVE/i.test(r));
    const datosNoDisponibles: DatoNoDisponible[] = ['bultos', 'pesoNeto', 'bl'];
    if (coves.length === 0) datosNoDisponibles.push('cove');

    const partidas: PartidaNormalizada[] = ops.map(op => {
      const p = op.partida;
      const contrib = (clave: string) => p.contribuciones.find(c => c.clave === clave)?.importeMxn ?? null;
      return {
        numeroPartida: p.numeroPartida,
        fraccion: p.fraccion,
        nico: p.nico,
        descripcion: p.descripcion,
        cantidad: p.cantidadUmc ?? 0,
        unidadMedidaCom: ped.partidas.find(x => x.numeroPartida === p.numeroPartida)?.r551.campos[11] ?? '',
        cantidadUmt: p.cantidadUmt,
        unidadMedida: ped.partidas.find(x => x.numeroPartida === p.numeroPartida)?.r551.campos[13] ?? '',
        valorUnitario: p.precioUnitario ?? 0,
        valorAduanaUsd: p.valorUsd ?? 0,
        valorAduanaMxn: p.valorAduanaMxn,
        valorComercialMxn: p.valorComercialMxn,
        pais: p.paisOrigenODestino,
        paisVendedor: p.paisVendedorOComprador,
        // Apéndice 12: 1 = IGI (verbatim del layout); 3 = IVA (cotejo aritmético
        // en fixture: 16% del valor en aduana). El resto no se asigna.
        igi: contrib('1'),
        iva: contrib('3'),
        permisos: p.permisos.map(x => ({ tipo: x.clave, codigo: x.numero, autoridad: '' })),
        identificadores: p.identificadores.map(x => ({ codigo: x.clave, complemento1: x.complemento1, complemento2: x.complemento2, complemento3: x.complemento3 })),
      };
    });

    return {
      origenArchivo: 'M3',
      layoutVersion: M3_LAYOUT_VERSION,
      archivoHash: archivo.archivo.sha256,
      numero: cab.numeroPedimento15 ?? ped.numeroPedimento7,
      numero7: ped.numeroPedimento7,
      clave: cab.clavePedimento,
      aduana: cab.aduanaSeccion.slice(0, 2),
      aduanaSeccion: cab.aduanaSeccion,
      patente: cab.patente,
      rfcImportador: cab.rfcImportador,
      curp: r501[7] || null,
      nombreImportador: cab.nombreImportador || null,
      tipoOperacion: cab.tipoOperacion === '1' ? 'IMP' : 'EXP',
      regimen: cab.regimenDerivado ?? '',
      pesoBruto: cab.pesoBrutoTotal ?? 0,
      tipoCambio: cab.tipoCambio ?? 0,
      incoterm: facturas[0]?.incoterm ?? '',
      medioTransporteClave: medioClave,
      transporte: medio?.descripcion ?? (medioClave ? `clave ${medioClave}` : ''),
      factura: refs.join(', ') || null,
      cove: coves.join(', ') || null,
      bl: null,
      valorAduanaMxn: partidas.reduce((a, p) => a + (p.valorAduanaMxn ?? 0), 0),
      valorComercialMxn: partidas.reduce((a, p) => a + (p.valorComercialMxn ?? 0), 0),
      valorDolares: partidas.reduce((a, p) => a + p.valorAduanaUsd, 0),
      identificadoresPedimento: cab.identificadoresG.map(i => ({ codigo: i.clave, complemento1: i.complemento1, complemento2: i.complemento2, complemento3: i.complemento3 })),
      proveedores: facturas.map(f => ({ nombre: f.proveedorNombre, idFiscal: f.proveedorIdFiscal, pais: f.pais })),
      partidas,
      datosNoDisponibles,
      advertencias: archivo.advertenciasIntegridad,
    };
  });
}

// ── Data Stage → normalizado ──────────────────────────────────────────────

function parseIdentificadores(s: string | undefined): IdentificadorImportado[] {
  if (!s) return [];
  // "NM:1:NOM-001|TL:TLC" ó "NM;TL"
  return s.split(/[|;]/).map(t => t.trim()).filter(Boolean).map(t => {
    const [codigo, c1, c2, c3] = t.split(':');
    return { codigo: (codigo ?? '').toUpperCase(), complemento1: c1, complemento2: c2, complemento3: c3 };
  });
}
function parsePermisos(s: string | undefined): PermisoImportado[] {
  if (!s) return [];
  return s.split(/[|;]/).map(t => t.trim()).filter(Boolean).map(t => {
    const [tipo, codigo] = t.split(':');
    return { tipo: tipo ?? '', codigo: codigo ?? '', autoridad: '' };
  });
}

export function normalizarDesdeDataStage(archivo: ReturnType<typeof parseDataStage>): PedimentoNormalizado[] {
  const grupos = new Map<string, typeof archivo.filas>();
  for (const f of archivo.filas) {
    const k = (f.valores.pedimento ?? '').replace(/\s/g, '');
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(f);
  }
  const col = (c: CampoDataStage) => archivo.columnasReconocidas[c] !== undefined;
  const out: PedimentoNormalizado[] = [];
  for (const [numeroRaw, filas] of grupos) {
    const cab = filas[0]!.valores;
    const numeroDigits = numeroRaw.replace(/\D/g, '');
    const numero = numeroDigits.length === 15
      ? `${numeroDigits.slice(0, 2)} ${numeroDigits.slice(2, 4)} ${numeroDigits.slice(4, 8)} ${numeroDigits.slice(8)}`
      : numeroRaw;
    const aduanaRaw = (cab.aduana ?? '').replace(/\D/g, '');
    const aduana = aduanaRaw.length >= 2 ? aduanaRaw.slice(0, 2) : (numeroDigits.length === 15 ? numeroDigits.slice(2, 4) : aduanaRaw);
    const patente = (cab.patente ?? '').replace(/\D/g, '') || (numeroDigits.length === 15 ? numeroDigits.slice(4, 8) : '');
    const clave = (cab.clave ?? '').toUpperCase();
    const claveInfo = CLAVES_PEDIMENTO.find(c => c.clave === clave);
    const tipoRaw = (cab.tipoOperacion ?? '').toUpperCase();
    const tipoOperacion: 'IMP' | 'EXP' = tipoRaw === '2' || tipoRaw.startsWith('EXP') || tipoRaw === 'E' ? 'EXP' : 'IMP';
    let regimen = '';
    if (claveInfo && claveInfo.regimenes.length === 1) regimen = claveInfo.regimenes[0]!;
    else if (claveInfo && claveInfo.regimenes.length > 1) {
      const cand = claveInfo.regimenes.filter(r => tipoOperacion === 'IMP' ? r.startsWith('I') || r === 'DFI' : r.startsWith('E'));
      if (cand.length === 1) regimen = cand[0]!;
    }
    const medioRaw = cab.medioTransporte ?? '';
    const medio = MEDIOS_TRANSPORTE.find(m => m.clave === medioRaw.trim() || m.descripcion.toLowerCase() === medioRaw.trim().toLowerCase());
    const datosNoDisponibles: DatoNoDisponible[] = ['pesoNeto'];
    if (!col('bultos')) datosNoDisponibles.push('bultos');
    if (!col('bl')) datosNoDisponibles.push('bl');
    if (!col('cove')) datosNoDisponibles.push('cove');

    const partidas: PartidaNormalizada[] = filas.map((f, i) => {
      const v = f.valores;
      const cantidad = num(v.cantidadUmc);
      const valorUnitario = num(v.precioUnitario);
      const valorDolares = col('valorDolares') ? num(v.valorDolares) : cantidad * valorUnitario;
      return {
        numeroPartida: num(v.partida, i + 1) || i + 1,
        fraccion: (v.fraccion ?? '').replace(/\D/g, ''),
        nico: (v.nico ?? '').replace(/\D/g, ''),
        descripcion: v.descripcion ?? '',
        cantidad,
        unidadMedidaCom: claveUnidadMedida(v.umc) ?? (v.umc ?? ''),
        cantidadUmt: col('cantidadUmt') ? num(v.cantidadUmt) : null,
        unidadMedida: claveUnidadMedida(v.umt) ?? (v.umt ?? ''),
        valorUnitario,
        valorAduanaUsd: valorDolares,
        valorAduanaMxn: col('valorAduana') ? num(v.valorAduana) : null,
        valorComercialMxn: col('valorComercial') ? num(v.valorComercial) : null,
        pais: (v.paisOrigen ?? '').toUpperCase(),
        paisVendedor: (v.paisVendedor ?? '').toUpperCase(),
        igi: null, iva: null,
        permisos: parsePermisos(v.permisos),
        identificadores: parseIdentificadores(v.identificadores),
      };
    });

    out.push({
      origenArchivo: 'DATASTAGE',
      layoutVersion: DATASTAGE_LAYOUT_VERSION,
      archivoHash: archivo.archivo.sha256,
      numero, numero7: numeroDigits.length === 15 ? numeroDigits.slice(8) : numeroRaw,
      clave, aduana, aduanaSeccion: aduanaRaw, patente,
      rfcImportador: (cab.rfc ?? '').toUpperCase(),
      curp: cab.curp || null,
      nombreImportador: cab.importador || null,
      tipoOperacion, regimen,
      pesoBruto: num(cab.pesoBruto),
      tipoCambio: num(cab.tipoCambio),
      incoterm: (cab.incoterm ?? '').toUpperCase(),
      medioTransporteClave: medio?.clave ?? null,
      transporte: medio?.descripcion ?? medioRaw,
      factura: cab.factura || null,
      cove: cab.cove || null,
      bl: cab.bl || null,
      valorAduanaMxn: partidas.reduce((a, p) => a + (p.valorAduanaMxn ?? 0), 0),
      valorComercialMxn: partidas.reduce((a, p) => a + (p.valorComercialMxn ?? 0), 0),
      valorDolares: partidas.reduce((a, p) => a + p.valorAduanaUsd, 0),
      identificadoresPedimento: [],
      proveedores: cab.proveedor ? [{ nombre: cab.proveedor, idFiscal: cab.proveedorIdFiscal ?? '', pais: partidas[0]?.paisVendedor ?? '' }] : [],
      partidas,
      datosNoDisponibles,
      advertencias: archivo.advertencias,
    });
  }
  return out;
}

// ── Parseo + persistencia ─────────────────────────────────────────────────

export class ImportacionError extends Error {
  readonly status: number;
  readonly detalles: string[];
  constructor(mensaje: string, detalles: string[] = [], status = 422) {
    super(mensaje);
    this.name = 'ImportacionError';
    this.status = status;
    this.detalles = detalles;
  }
}

export interface ImportarInput {
  tenantId: string;
  userId: string;
  clienteId: string | null;
  nombreArchivo: string;
  contenido: string; // texto ya decodificado
  layout?: 'auto' | 'M3' | 'DATASTAGE';
  columnas?: Partial<Record<CampoDataStage, string[]>>;
}

export interface ImportarResultado {
  layout: OrigenArchivo;
  layoutVersion: string;
  archivoHash: string;
  pedimentos: { id: string; numero: string | null; clave: string; partidas: number; reutilizado: boolean; datosNoDisponibles: DatoNoDisponible[] }[];
  excluidos: { numeroPedimento7: string; motivo: string }[];
  advertencias: string[];
  avisoLayout: string | null;
}

/** Parsea sin persistir (para tests y para el modo "solo previsualizar"). */
export function parsearArchivo(nombreArchivo: string, contenido: string, layout: 'auto' | 'M3' | 'DATASTAGE' = 'auto', columnas?: ImportarInput['columnas']): {
  layout: OrigenArchivo; pedimentos: PedimentoNormalizado[]; excluidos: ImportarResultado['excluidos']; advertencias: string[];
} {
  const det = layout === 'auto' ? detectarLayout(contenido) : layout;
  if (det === 'DESCONOCIDO') {
    throw new ImportacionError('No se reconoce el archivo: un M3 abre con "500|" y un Data Stage trae encabezados de columnas.');
  }
  try {
    if (det === 'M3') {
      // El nombre oficial es mppppnnn.ddd; si el usuario lo guardó como .txt se
      // tolera el sufijo (la validación cruzada contra 801.2 sigue siendo estricta).
      const archivo = parseArchivoM(nombreArchivo.replace(/\.txt$/i, ''), contenido);
      return {
        layout: 'M3',
        pedimentos: normalizarDesdeM3(archivo),
        excluidos: archivo.excluidos.map(e => ({ numeroPedimento7: e.numeroPedimento7, motivo: e.motivo })),
        advertencias: archivo.advertenciasIntegridad,
      };
    }
    const archivo = parseDataStage(nombreArchivo, contenido, columnas);
    return { layout: 'DATASTAGE', pedimentos: normalizarDesdeDataStage(archivo), excluidos: [], advertencias: archivo.advertencias };
  } catch (e) {
    if (e instanceof ArchivoMError || e instanceof DataStageError) throw new ImportacionError(e.message, e.detalles);
    throw e;
  }
}

/** Parte B: topes por archivo (el body solo limitaba 3 MB base64). */
export const MAX_PEDIMENTOS = Number(process.env.IMPORT_MAX_PEDIMENTOS) > 0 ? Number(process.env.IMPORT_MAX_PEDIMENTOS) : 200;
export const MAX_PARTIDAS = Number(process.env.IMPORT_MAX_PARTIDAS) > 0 ? Number(process.env.IMPORT_MAX_PARTIDAS) : 5_000;

export async function importarPedimentos(input: ImportarInput, limites: { maxPedimentos?: number; maxPartidas?: number } = {}): Promise<ImportarResultado> {
  const parsed = parsearArchivo(input.nombreArchivo, input.contenido, input.layout ?? 'auto', input.columnas);
  const maxPed = limites.maxPedimentos ?? MAX_PEDIMENTOS;
  const maxPart = limites.maxPartidas ?? MAX_PARTIDAS;
  if (parsed.pedimentos.length > maxPed) {
    throw new ImportacionError(`El archivo trae ${parsed.pedimentos.length} pedimentos (máximo ${maxPed} por importación); divídelo.`, [], 400);
  }
  const totalPartidas = parsed.pedimentos.reduce((s, p) => s + p.partidas.length, 0);
  if (totalPartidas > maxPart) {
    throw new ImportacionError(`El archivo trae ${totalPartidas} partidas (máximo ${maxPart} por importación); divídelo.`, [], 400);
  }
  const salida: ImportarResultado['pedimentos'] = [];
  let archivoHash = '';
  let layoutVersion = '';

  // Prefetch de existentes en UNA consulta (antes: findFirst por pedimento).
  const hashes = [...new Set(parsed.pedimentos.map(p => p.archivoHash))];
  const numeros = [...new Set(parsed.pedimentos.map(p => p.numero))];
  const existentes = parsed.pedimentos.length
    ? await prisma.pedimento.findMany({
        where: { tenantId: input.tenantId, archivoHash: { in: hashes }, numero: { in: numeros } },
        select: { id: true, numero: true, clave: true, archivoHash: true, _count: { select: { partidas: true } } },
      })
    : [];
  const porClave = new Map(existentes.map(e => [`${e.archivoHash}|${e.numero}`, e]));

  for (const ped of parsed.pedimentos) {
    archivoHash = ped.archivoHash;
    layoutVersion = ped.layoutVersion;
    const existente = porClave.get(`${ped.archivoHash}|${ped.numero}`) ?? null;
    if (existente) {
      salida.push({ id: existente.id, numero: existente.numero, clave: existente.clave, partidas: existente._count.partidas, reutilizado: true, datosNoDisponibles: ped.datosNoDisponibles });
      continue;
    }
    const creado = await prisma.pedimento.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        clienteId: input.clienteId,
        origenArchivo: ped.origenArchivo,
        layoutVersion: ped.layoutVersion,
        archivoHash: ped.archivoHash,
        numero: ped.numero,
        clave: ped.clave,
        aduana: ped.aduana,
        patenteAduanal: ped.patente,
        rfcImportador: ped.rfcImportador,
        curp: ped.curp,
        tipoOperacion: ped.tipoOperacion,
        regimen: ped.regimen,
        origen: ped.proveedores[0]?.pais || null,
        destino: null,
        pesoBruto: ped.pesoBruto,
        pesoNeto: 0, // NO disponible en el archivo — ver datosNoDisponibles
        bultos: 0,   // NO disponible en el archivo — ver datosNoDisponibles
        valorAduana: ped.valorAduanaMxn,
        valorComercial: ped.valorComercialMxn,
        valorDolares: ped.valorDolares,
        tipoCambio: ped.tipoCambio,
        incoterm: ped.incoterm,
        transporte: ped.transporte,
        medioTransporte: ped.medioTransporteClave,
        factura: ped.factura,
        cove: ped.cove,
        bl: ped.bl,
        status: 'DRAFT',
        // Datos del archivo sin columna propia (SCHEMA REQUERIDO: Pedimento.datosArchivo Json?).
        // Mientras tanto viajan en aiNotes.datosArchivo — las rutas de validación los preservan.
        aiNotes: {
          datosArchivo: {
            aduanaSeccion: ped.aduanaSeccion, numero7: ped.numero7, nombreImportador: ped.nombreImportador,
            identificadoresPedimento: ped.identificadoresPedimento, proveedores: ped.proveedores,
            datosNoDisponibles: ped.datosNoDisponibles, advertencias: ped.advertencias,
            cantidadUmtPorPartida: Object.fromEntries(ped.partidas.map(p => [p.numeroPartida, p.cantidadUmt])),
          },
          notas: [],
        } as unknown as object,
        partidas: {
          create: ped.partidas.map(p => ({
            numeroPartida: p.numeroPartida,
            fraccion: p.fraccion,
            nico: p.nico || null,
            descripcion: p.descripcion,
            cantidad: p.cantidad,
            unidadMedida: p.unidadMedida,
            unidadMedidaCom: p.unidadMedidaCom || null,
            valorUnitario: p.valorUnitario,
            valorAduana: p.valorAduanaUsd,
            pais: p.pais,
            paisVendedor: p.paisVendedor || null,
            igi: p.igi, iva: p.iva,
            permisos: p.permisos as unknown as object,
            identificadores: p.identificadores as unknown as object,
          })),
        },
      },
      select: { id: true, numero: true, clave: true, _count: { select: { partidas: true } } },
    });
    salida.push({ id: creado.id, numero: creado.numero, clave: creado.clave, partidas: creado._count.partidas, reutilizado: false, datosNoDisponibles: ped.datosNoDisponibles });
  }

  return {
    layout: parsed.layout,
    layoutVersion,
    archivoHash,
    pedimentos: salida,
    excluidos: parsed.excluidos,
    advertencias: parsed.advertencias,
    avisoLayout: parsed.layout === 'DATASTAGE' ? 'Layout Data Stage: pendiente de cotejo oficial (lectura por encabezados).' : null,
  };
}

// ── Pedimento persistido → entradas de los motores ────────────────────────

export type PedimentoConPartidas = NonNullable<Awaited<ReturnType<typeof cargarPedimento>>>;

export async function cargarPedimento(tenantId: string, id: string) {
  return prisma.pedimento.findFirst({
    where: { id, tenantId },
    include: { partidas: { orderBy: { numeroPartida: 'asc' } } },
  });
}

export interface DatosArchivo {
  aduanaSeccion?: string; numero7?: string; nombreImportador?: string | null;
  identificadoresPedimento?: IdentificadorImportado[];
  proveedores?: { nombre: string; idFiscal: string; pais: string }[];
  datosNoDisponibles?: DatoNoDisponible[];
  cantidadUmtPorPartida?: Record<string, number | null>;
}

export function datosArchivoDe(ped: { aiNotes: unknown }): DatosArchivo {
  const a = ped.aiNotes as { datosArchivo?: DatosArchivo } | null;
  return a?.datosArchivo ?? {};
}

/** Pedimento persistido → PedimentoInput del prevalidador v2 (multipartida). */
export function pedimentoAInputPrevalidador(ped: PedimentoConPartidas): PedimentoInput {
  const extra = datosArchivoDe(ped);
  const esArchivo = ped.origenArchivo === 'M3' || ped.origenArchivo === 'DATASTAGE';
  const partidas: PartidaInput[] = ped.partidas.map(p => ({
    numeroPartida: p.numeroPartida,
    fraccion: p.fraccion,
    nico: p.nico ?? undefined,
    descripcion: p.descripcion,
    cantidad: p.cantidad,
    unidadMedida: p.unidadMedida,
    unidadMedidaCom: p.unidadMedidaCom ?? undefined,
    valorUnitario: p.valorUnitario,
    valorAduana: p.valorAduana,
    pais: p.pais,
    paisVendedor: p.paisVendedor ?? undefined,
    igi: p.igi ?? undefined, dta: p.dta ?? undefined, iva: p.iva ?? undefined, ieps: p.ieps ?? undefined,
    permisos: (p.permisos as PermisoImportado[] | null) ?? [],
    identificadores: (p.identificadores as IdentificadorImportado[] | null) ?? [],
    vinculacion: p.vinculacion,
    vinculacionDesc: p.vinculacionDesc ?? undefined,
  }));
  return {
    origenArchivo: (ped.origenArchivo as 'M3' | 'DATASTAGE' | 'MANUAL' | null) ?? 'MANUAL',
    datosNoDisponibles: extra.datosNoDisponibles ?? (esArchivo ? ['bultos', 'pesoNeto', 'bl'] : []),
    identificadoresPedimento: extra.identificadoresPedimento ?? [],
    numero: ped.numero ?? undefined,
    clave: ped.clave,
    aduana: ped.aduana,
    patenteAduanal: ped.patenteAduanal,
    rfcImportador: ped.rfcImportador,
    curp: ped.curp ?? undefined,
    tipoOperacion: ped.tipoOperacion === 'EXP' ? 'EXP' : 'IMP',
    regimen: ped.regimen,
    destino: ped.destino ?? undefined,
    origen: ped.origen ?? undefined,
    pesoBruto: ped.pesoBruto,
    pesoNeto: ped.pesoNeto,
    bultos: ped.bultos,
    // Los archivos traen el valor en aduana en MXN y las partidas en USD; el
    // prevalidador compara encabezado vs Σpartidas en la misma moneda (USD).
    valorAduana: esArchivo ? ped.valorDolares : ped.valorAduana,
    valorComercial: ped.valorComercial,
    valorDolares: ped.valorDolares,
    tipoCambio: ped.tipoCambio,
    incoterm: ped.incoterm,
    transporte: ped.transporte,
    medioTransporte: ped.medioTransporte ?? undefined,
    medioTransporteClave: esArchivo ? (ped.medioTransporte ?? undefined) : undefined,
    factura: ped.factura ?? undefined,
    cove: ped.cove ?? undefined,
    bl: ped.bl ?? undefined,
    partidas,
  };
}
