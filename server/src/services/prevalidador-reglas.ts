/**
 * CATÁLOGO DE REGLAS DEL PRE-VALIDADOR (Operación 2026-08).
 *
 * "Que el usuario diga: esto me marca lo mismo que el prevalidador de
 * CAAAREM, pero me lo explica". Cada regla que emite `validatePedimento`
 * (prevalidator-v2.ts) está aquí con código, descripción, fundamento y
 * severidad. Se sirve en GET /api/prevalidate/reglas y se documenta en
 * docs/PREVALIDADOR_REGLAS.md.
 *
 * Estado del fundamento: `verificado` solo cuando el artículo/regla fue
 * cotejado verbatim en el repo (docs/RISK_SCORER_LEGAL.md, lib/anexo22.ts);
 * `pendiente` cuando la cita es la referencia usual pero no hay cotejo
 * artículo por artículo en el repo. No se inventan números de campo.
 */
import type { Severity } from './prevalidator-v2';

export interface ReglaPrevalidador {
  codigo: string;
  nombre: string;
  descripcion: string;
  fundamento: string;
  cotejoFundamento: 'verificado' | 'pendiente';
  severidad: Severity;
  nivel: 'pedimento' | 'partida';
  /** Dato que la regla necesita; si falta, queda `no_evaluado` con motivo. */
  requiere?: string;
}

const LA = 'Ley Aduanera (última reforma DOF 19-11-2025)';
const ANEXO22 = 'Anexo 22 RGCE 2026 (DOF 15-ene-2026)';

export const REGLAS_PREVALIDADOR: ReglaPrevalidador[] = [
  // ── Encabezado ──
  { codigo: 'CLAVE_REGIMEN_MISMATCH', nombre: 'Clave de pedimento incompatible con el régimen', descripcion: 'La clave de pedimento (Apéndice 2) no admite el régimen declarado (Apéndice 16). Las claves agregadas sin cotejo (cotejo: pendiente) no restringen.', fundamento: `${ANEXO22}, Apéndices 2 y 16 — lib/anexo22.ts`, cotejoFundamento: 'verificado', severidad: 'error', nivel: 'pedimento' },
  { codigo: 'NUMERO_PEDIMENTO_FORMAT', nombre: 'Número de pedimento con formato inválido', descripcion: 'El número debe integrarse con 15 dígitos: año(2) aduana(2) patente(4) consecutivo(7), y la aduana debe existir en el Apéndice 1.', fundamento: `${ANEXO22}, instructivo de llenado campo 1 y Apéndice 1`, cotejoFundamento: 'verificado', severidad: 'warning', nivel: 'pedimento' },
  { codigo: 'TIPO_REGIMEN_MISMATCH', nombre: 'Régimen no aplicable al tipo de operación', descripcion: 'El régimen (Apéndice 16) no corresponde al tipo de operación IMP/EXP.', fundamento: `${ANEXO22}, Apéndice 16; Art. 90 ${LA}`, cotejoFundamento: 'pendiente', severidad: 'error', nivel: 'pedimento' },
  { codigo: 'RFC_FORMAT', nombre: 'RFC del importador con formato inválido', descripcion: 'El RFC debe tener 12 (persona moral) o 13 (persona física) caracteres con fecha válida.', fundamento: `Art. 36-A fracción I ${LA}; Art. 27 CFF`, cotejoFundamento: 'pendiente', severidad: 'error', nivel: 'pedimento' },
  { codigo: 'WEIGHT_INCONSISTENT', nombre: 'Peso neto mayor que el bruto', descripcion: 'El peso neto no puede exceder el peso bruto declarado.', fundamento: `${ANEXO22}, instructivo de llenado (peso bruto)`, cotejoFundamento: 'pendiente', severidad: 'error', nivel: 'pedimento', requiere: 'pesoBruto y pesoNeto' },
  { codigo: 'WEIGHT_RATIO_LOW', nombre: 'Peso neto menor al 30% del bruto', descripcion: 'Señal de embalaje desproporcionado; verifica que la diferencia esté justificada.', fundamento: 'Heurística operativa (sin fundamento legal directo)', cotejoFundamento: 'pendiente', severidad: 'warning', nivel: 'pedimento', requiere: 'pesoBruto y pesoNeto' },
  { codigo: 'TC_OFF_DOF', nombre: 'Tipo de cambio distinto al publicado', descripcion: 'El tipo de cambio declarado difiere más de 1% del publicado por Banxico en el DOF para la fecha.', fundamento: `Art. 20 CFF; Art. 56 ${LA} (fecha de causación)`, cotejoFundamento: 'pendiente', severidad: 'warning', nivel: 'pedimento' },
  { codigo: 'BULTOS_ZERO', nombre: 'Bultos en cero', descripcion: 'El número de bultos debe ser mayor a cero.', fundamento: `${ANEXO22}, instructivo de llenado (bultos)`, cotejoFundamento: 'pendiente', severidad: 'error', nivel: 'pedimento', requiere: 'bultos (el archivo M3 v1 no lo trae)' },
  { codigo: 'VALUE_SUM_MISMATCH', nombre: 'Valor del pedimento ≠ suma de partidas', descripcion: 'El valor en aduana del encabezado difiere más de 0.5% de la suma de las partidas.', fundamento: `Art. 64 ${LA}; ${ANEXO22} (valores por partida)`, cotejoFundamento: 'pendiente', severidad: 'error', nivel: 'pedimento' },
  { codigo: 'NO_PARTIDAS', nombre: 'Pedimento sin partidas', descripcion: 'El pedimento debe tener al menos una partida.', fundamento: `${ANEXO22}, bloque de partidas`, cotejoFundamento: 'pendiente', severidad: 'error', nivel: 'pedimento' },
  { codigo: 'ADUANA_TRANSPORTE_INCONGRUENTE', nombre: 'Medio de transporte incongruente con la aduana', descripcion: 'Un medio de transporte marítimo por una aduana fronteriza o interior (p. ej. Nuevo Laredo), o aéreo por una aduana sin aeropuerto, no es despachable. El tipo de aduana se deriva del Apéndice 1 (cotejo pendiente).', fundamento: `${ANEXO22}, Apéndices 1 (aduanas) y 3 (medios de transporte)`, cotejoFundamento: 'pendiente', severidad: 'error', nivel: 'pedimento', requiere: 'aduana y medio de transporte' },
  { codigo: 'DOCUMENTO_VACIO', nombre: 'Documento sin referencia', descripcion: 'Factura/CFDI, COVE o documento de transporte (BL/guía) sin número de referencia. La factura y el COVE son error; el BL es advertencia.', fundamento: `Art. 36-A ${LA} (documentos anexos); RGCE 2026 regla 1.9.19 (COVE)`, cotejoFundamento: 'pendiente', severidad: 'error', nivel: 'pedimento', requiere: 'factura, cove, bl (el archivo M3 v1 no trae BL: queda no_evaluado)' },
  // ── Partida ──
  { codigo: 'FRACTION_FORMAT', nombre: 'Fracción sin 8 dígitos', descripcion: 'La fracción debe tener 8 dígitos numéricos.', fundamento: 'LIGIE 2026; Art. 54 ' + LA, cotejoFundamento: 'verificado', severidad: 'error', nivel: 'partida' },
  { codigo: 'FRACTION_NOT_IN_TIGIE', nombre: 'Fracción no encontrada en el catálogo TIGIE', descripcion: 'La fracción no existe en el catálogo local (8,256 fracciones TIGIE 2026); verifica vigencia.', fundamento: 'LIGIE 2026 (DOF 29-12-2025)', cotejoFundamento: 'verificado', severidad: 'warning', nivel: 'partida' },
  { codigo: 'NICO_FALTANTE', nombre: 'NICO faltante', descripcion: 'La partida no declara Número de Identificación Comercial (2 dígitos).', fundamento: `Art. 54 ${LA} ("exacta determinación del número de identificación comercial"); ${ANEXO22} campo NICO`, cotejoFundamento: 'verificado', severidad: 'error', nivel: 'partida' },
  { codigo: 'NICO_INVALIDO', nombre: 'NICO inválido', descripcion: 'El NICO no tiene 2 dígitos o no existe para la fracción en el catálogo local.', fundamento: `Art. 54 ${LA}; catálogo de NICOs (LIGIE 2026)`, cotejoFundamento: 'verificado', severidad: 'error', nivel: 'partida' },
  { codigo: 'PARTIDA_VALUE_MISMATCH', nombre: 'Cantidad × valor unitario ≠ valor declarado', descripcion: 'El producto de cantidad por valor unitario difiere más de 0.5% del valor declarado de la partida.', fundamento: `Art. 64 ${LA}`, cotejoFundamento: 'pendiente', severidad: 'error', nivel: 'partida' },
  { codigo: 'PERMIT_REQUIRED', nombre: 'Permiso/RRNA requerido no declarado', descripcion: 'La fracción exige permiso previo según el catálogo y la partida no declara ninguno.', fundamento: `Art. 36-A ${LA}; Anexo 2.2.1 Acuerdo SE`, cotejoFundamento: 'pendiente', severidad: 'error', nivel: 'partida' },
  { codigo: 'SECTORAL_REGISTRY', nombre: 'Padrón sectorial requerido', descripcion: 'La fracción requiere inscripción en padrón de sectores específicos.', fundamento: `Art. 59 fracción IV ${LA}; Anexo 10 RGCE 2026 (DOF 14-01-2026)`, cotejoFundamento: 'verificado', severidad: 'info', nivel: 'partida' },
  { codigo: 'NOMS_MISSING', nombre: 'NOM aplicable no declarada', descripcion: 'La fracción está sujeta a NOM(s) según catálogo y la partida no las declara en permisos.', fundamento: `Art. 36-A ${LA}; Anexo 2.4.1 Acuerdo SE (NOMs)`, cotejoFundamento: 'pendiente', severidad: 'warning', nivel: 'partida' },
  { codigo: 'ANTIDUMPING_NOT_DECLARED', nombre: 'Cuota compensatoria vigente no declarada', descripcion: 'Hay cuota compensatoria vigente para fracción + país de origen y la partida no trae identificador CC/EE.', fundamento: `Arts. 62-63 LCE; Art. 178 ${LA} (multa 130-150%); Art. 151 ${LA} (embargo); ${ANEXO22} Apéndice 8 (CC)`, cotejoFundamento: 'verificado', severidad: 'error', nivel: 'partida' },
  { codigo: 'ANTIDUMPING_DECLARED', nombre: 'Cuota compensatoria declarada', descripcion: 'Informativo: la partida declara identificador CC para una cuota vigente; verifica el monto.', fundamento: `${ANEXO22} Apéndice 8 (CC)`, cotejoFundamento: 'pendiente', severidad: 'info', nivel: 'partida' },
  { codigo: 'VINCULACION_DESC_MISSING', nombre: 'Vinculación sin descripción', descripcion: 'Se declara vinculación comprador-vendedor sin describir la relación.', fundamento: `Art. 68 y 71 ${LA}`, cotejoFundamento: 'pendiente', severidad: 'error', nivel: 'partida' },
  { codigo: 'QTY_ZERO', nombre: 'Cantidad en cero', descripcion: 'La cantidad de la partida debe ser mayor a cero.', fundamento: `${ANEXO22}, cantidad en UMC/UMT`, cotejoFundamento: 'pendiente', severidad: 'error', nivel: 'partida' },
  { codigo: 'IDENTIFICADOR_OBLIGATORIO_FALTANTE', nombre: 'Identificador obligatorio (Apéndice 8) faltante', descripcion: 'Falta un identificador que la clave/fracción exige: IM (programa IMMEX) en claves IN/AF/RT; NM en fracciones sujetas a NOM. El catálogo del Apéndice 8 está pendiente de cotejo.', fundamento: `${ANEXO22}, Apéndice 8 (pendiente de cotejo verbatim)`, cotejoFundamento: 'pendiente', severidad: 'error', nivel: 'partida', requiere: 'identificadores de la partida (si no se capturan, queda no_evaluado)' },
  { codigo: 'UMT_NO_COINCIDE', nombre: 'Unidad de tarifa distinta a la de la fracción', descripcion: 'La unidad de medida de tarifa declarada no coincide con la unidad de la fracción en el catálogo (Apéndice 7).', fundamento: `${ANEXO22}, Apéndice 7; LIGIE 2026 (unidad por fracción)`, cotejoFundamento: 'pendiente', severidad: 'error', nivel: 'partida', requiere: 'unidad de tarifa declarada' },
];

export const REGLAS_POR_CODIGO: Record<string, ReglaPrevalidador> =
  Object.fromEntries(REGLAS_PREVALIDADOR.map((r) => [r.codigo, r]));

export const PREVALIDADOR_REGLAS_NOTA =
  'Catálogo de reglas del Pre-validador. Cada hallazgo cita su fundamento; "verificado" = cotejado verbatim en el repo, "pendiente" = referencia usual sin cotejo artículo por artículo. Una regla cuyo dato no fue capturado queda "no evaluada" con motivo: nunca dispara por defecto.';
