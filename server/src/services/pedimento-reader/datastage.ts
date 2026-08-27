/**
 * LECTOR DE PEDIMENTOS — Data Stage (Operación 2026-08).
 *
 * El "Data Stage" del SAT (extracción de pedimentos pagados que el
 * importador descarga del portal) llega como CSV/TXT con encabezados. El
 * layout oficial exacto NO está cotejado en este repo (no hay PDF/fuente
 * vendoreada): por eso este parser es **por encabezado configurable** —
 * reconoce columnas por nombre (con alias) y NUNCA infiere por posición.
 *
 * Estado: "layout Data Stage: pendiente de cotejo oficial" (visible en UI).
 * Ante encabezados mínimos ausentes falla cerrado con la lista de columnas
 * que sí reconoció, para que el usuario mapee con `columnas` (aliases).
 */
import crypto from 'crypto';

export const DATASTAGE_LAYOUT_VERSION = 'DATASTAGE-encabezados-v0 (pendiente de cotejo oficial)';
export const DATASTAGE_AVISO =
  'Layout Data Stage: pendiente de cotejo oficial. El archivo se lee por nombre de columna (alias configurables), no por posición.';

export class DataStageError extends Error {
  readonly detalles: string[];
  constructor(mensaje: string, detalles: string[] = []) {
    super(`archivo Data Stage no reconocido — ${mensaje}`);
    this.name = 'DataStageError';
    this.detalles = detalles;
  }
}

/** Campos canónicos que el importador entiende. */
export type CampoDataStage =
  | 'pedimento' | 'patente' | 'aduana' | 'clave' | 'tipoOperacion' | 'rfc' | 'curp' | 'importador'
  | 'tipoCambio' | 'pesoBruto' | 'bultos' | 'medioTransporte' | 'incoterm'
  | 'factura' | 'cove' | 'bl' | 'proveedor' | 'proveedorIdFiscal'
  | 'partida' | 'fraccion' | 'nico' | 'descripcion'
  | 'cantidadUmc' | 'umc' | 'cantidadUmt' | 'umt'
  | 'precioUnitario' | 'valorAduana' | 'valorComercial' | 'valorDolares'
  | 'paisOrigen' | 'paisVendedor' | 'identificadores' | 'permisos';

/** Alias por defecto (minúsculas, sin acentos, sin espacios/guiones). */
export const ALIAS_DEFAULT: Record<CampoDataStage, string[]> = {
  pedimento: ['pedimento', 'numpedimento', 'numerodepedimento', 'numeropedimento', 'nopedimento'],
  patente: ['patente', 'patenteaduanal'],
  aduana: ['aduana', 'aduanaseccion', 'aduanadespacho', 'aduanadedespacho', 'aduanasecc'],
  clave: ['clave', 'clavepedimento', 'clavedepedimento', 'cvepedimento', 'tipodepedimento'],
  tipoOperacion: ['tipooperacion', 'tipodeoperacion', 'operacion'],
  rfc: ['rfc', 'rfcimportador', 'rfcdelimportador', 'rfcimpexp'],
  curp: ['curp', 'curpimportador'],
  importador: ['importador', 'nombreimportador', 'razonsocial'],
  tipoCambio: ['tipocambio', 'tipodecambio', 'tc'],
  pesoBruto: ['pesobruto', 'peso'],
  bultos: ['bultos', 'numbultos', 'numerodebultos'],
  medioTransporte: ['mediotransporte', 'mediodetransporte', 'transporte', 'mediotransporteentrada', 'transporteentradasalida'],
  incoterm: ['incoterm', 'terminofacturacion', 'terminodefacturacion'],
  factura: ['factura', 'numfactura', 'numerofactura', 'cfdi', 'numcfdi'],
  cove: ['cove', 'acusevalor', 'acusedevalor', 'numcove'],
  bl: ['bl', 'guia', 'conocimientoembarque', 'documentotransporte', 'guiaobl', 'cartaporte'],
  proveedor: ['proveedor', 'nombreproveedor', 'exportador', 'nombreexportador', 'vendedor'],
  proveedorIdFiscal: ['idfiscal', 'idfiscalproveedor', 'taxid', 'rfcproveedor'],
  partida: ['partida', 'numpartida', 'numeropartida', 'secuencia', 'sec'],
  fraccion: ['fraccion', 'fraccionarancelaria', 'fracc'],
  nico: ['nico', 'subdivision', 'subdivisionfraccion', 'numeroidentificacioncomercial'],
  descripcion: ['descripcion', 'descripcionmercancia', 'descripciondelamercancia', 'mercancia'],
  cantidadUmc: ['cantidadumc', 'cantidadcomercial', 'cantidad', 'cantidadumcomercial'],
  umc: ['umc', 'unidadcomercial', 'unidadmedidacomercial', 'unidaddemedidacomercial'],
  cantidadUmt: ['cantidadumt', 'cantidadtarifa', 'cantidadligie', 'cantidadumtarifa'],
  umt: ['umt', 'unidadtarifa', 'unidadmedidatarifa', 'unidadligie', 'unidaddemedidatarifa'],
  precioUnitario: ['preciounitario', 'valorunitario', 'preciounit'],
  valorAduana: ['valoraduana', 'valorenaduana', 'valoraduanamxn'],
  valorComercial: ['valorcomercial', 'preciopagado', 'importepreciopagado'],
  valorDolares: ['valordolares', 'valorusd', 'valorendolares', 'usd'],
  paisOrigen: ['paisorigen', 'paisdeorigen', 'origen', 'paisorigendestino'],
  paisVendedor: ['paisvendedor', 'paisdelvendedor', 'paisvendedorcomprador', 'paiscomprador'],
  identificadores: ['identificadores', 'identificador', 'identificadorespartida'],
  permisos: ['permisos', 'permiso', 'regulaciones', 'rrna'],
};

const MINIMOS: CampoDataStage[] = ['pedimento', 'fraccion'];

export interface FilaDataStage {
  linea: number;
  valores: Partial<Record<CampoDataStage, string>>;
}

export interface ArchivoDataStage {
  archivo: { nombre: string; sha256: string; lineas: number };
  layoutVersion: string;
  delimitador: string;
  columnasReconocidas: Partial<Record<CampoDataStage, string>>;
  columnasIgnoradas: string[];
  filas: FilaDataStage[];
  advertencias: string[];
}

export function normalizarEncabezado(h: string): string {
  return h
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function detectarDelimitador(linea: string): string {
  const candidatos = ['|', '\t', ';', ','];
  let mejor = ',', max = 0;
  for (const d of candidatos) {
    const n = linea.split(d).length - 1;
    if (n > max) { max = n; mejor = d; }
  }
  return mejor;
}

/** Split simple con soporte de comillas dobles para CSV. */
function dividir(linea: string, delim: string): string[] {
  if (delim !== ',' && delim !== ';') return linea.split(delim).map(v => v.trim());
  const out: string[] = [];
  let cur = '', enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i]!;
    if (ch === '"') {
      if (enComillas && linea[i + 1] === '"') { cur += '"'; i++; }
      else enComillas = !enComillas;
    } else if (ch === delim && !enComillas) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/**
 * Parsea un CSV/TXT de Data Stage por encabezados.
 * `columnas` permite mapear encabezados propios → campo canónico.
 */
export function parseDataStage(
  nombreArchivo: string,
  contenido: string,
  columnas: Partial<Record<CampoDataStage, string[]>> = {},
): ArchivoDataStage {
  const sha256 = crypto.createHash('sha256').update(contenido, 'utf8').digest('hex');
  const advertencias: string[] = [];
  const texto = contenido.replace(/^\uFEFF/, '').replace(/\r/g, '');
  const lineas = texto.split('\n');
  while (lineas.length > 0 && lineas[lineas.length - 1]!.trim() === '') lineas.pop();
  if (lineas.length < 2) throw new DataStageError('se requieren al menos una línea de encabezados y una de datos');

  const delim = detectarDelimitador(lineas[0]!);
  const encabezados = dividir(lineas[0]!, delim);
  if (encabezados.length < 3) throw new DataStageError(`la primera línea no parece un encabezado (solo ${encabezados.length} columnas con "${delim}")`);

  // Mapa encabezado normalizado → campo canónico (alias default + configurados)
  const alias = new Map<string, CampoDataStage>();
  for (const [campo, lista] of Object.entries(ALIAS_DEFAULT) as [CampoDataStage, string[]][]) {
    for (const a of lista) alias.set(a, campo);
  }
  for (const [campo, lista] of Object.entries(columnas) as [CampoDataStage, string[] | undefined][]) {
    for (const a of lista ?? []) alias.set(normalizarEncabezado(a), campo);
  }

  const columnasReconocidas: Partial<Record<CampoDataStage, string>> = {};
  const indice: Partial<Record<CampoDataStage, number>> = {};
  const ignoradas: string[] = [];
  encabezados.forEach((h, i) => {
    const campo = alias.get(normalizarEncabezado(h));
    if (campo && indice[campo] === undefined) { indice[campo] = i; columnasReconocidas[campo] = h; }
    else ignoradas.push(h);
  });

  const faltan = MINIMOS.filter(c => indice[c] === undefined);
  if (faltan.length > 0) {
    throw new DataStageError(
      `faltan columnas mínimas: ${faltan.join(', ')} (reconocidas: ${Object.values(columnasReconocidas).join(', ') || 'ninguna'})`,
      [`Encabezados leídos: ${encabezados.join(' | ')}`, 'Configura alias en `columnas` para mapear tus encabezados.'],
    );
  }

  const filas: FilaDataStage[] = [];
  for (let i = 1; i < lineas.length; i++) {
    const cruda = lineas[i]!;
    if (cruda.trim() === '') continue;
    const vals = dividir(cruda, delim);
    if (vals.length !== encabezados.length) {
      advertencias.push(`L${i + 1}: ${vals.length} columnas vs ${encabezados.length} del encabezado — línea omitida.`);
      continue;
    }
    const valores: Partial<Record<CampoDataStage, string>> = {};
    for (const [campo, idx] of Object.entries(indice) as [CampoDataStage, number][]) {
      valores[campo] = vals[idx] ?? '';
    }
    filas.push({ linea: i + 1, valores });
  }
  if (filas.length === 0) throw new DataStageError('sin filas de datos válidas');

  return {
    archivo: { nombre: nombreArchivo, sha256, lineas: lineas.length },
    layoutVersion: DATASTAGE_LAYOUT_VERSION,
    delimitador: delim,
    columnasReconocidas, columnasIgnoradas: ignoradas,
    filas, advertencias,
  };
}
