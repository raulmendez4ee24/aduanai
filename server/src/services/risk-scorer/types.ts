/**
 * RISK SCORER — tipos del motor determinista (docs/RISK_SCORER_DESIGN.md).
 * CERO LLM: todo el cálculo es función pura de señales tipadas.
 */

export type FactorId =
  | 'VALOR' | 'PERFIL' | 'CUOTAS' | 'PADRONES'
  | 'TEMPORALES' | 'CLASIFICACION' | 'NOMS' | 'DOCUMENTACION';

export type Banda = 'VERDE' | 'AMARILLO' | 'NARANJA' | 'ROJO' | 'ROJO_CRITICO';

export type TipoSujeto = 'agente' | 'agencia';

/** Sello de cotejo: toda regla y todo ítem del escudo citan artículo + fuente + fecha. */
export interface Fundamento {
  articulo: string;
  citaCorta: string;
  fuente: string;
  url: string;
  fechaCotejo: string; // 'YYYY-MM-DD'
}

export interface OperacionInput {
  fraccion?: string;
  nico?: string;
  valorUnitario?: number;
  cantidad?: number;
  moneda?: string;
  paisOrigen?: string;
  paisProcedencia?: string;
  regimen?: string;
  clavePedimento?: string;
  numeroPedimento?: string;
  importadorRfc?: string;
  preferenciaArancelaria?: boolean;
}

/** Checklist declarativo del usuario: true=sí, false=no, null/undefined=sin responder. */
export interface DeclaradoInput {
  mveTransmitida?: boolean | null;
  expedienteKyc?: boolean | null;
  expediente162VII?: boolean | null;
  controlInterno81A?: boolean | null;
  encargoConferido?: boolean | null;
  padronImportadoresVigente?: boolean | null;
  padronesActivos?: string[]; // códigos de sector Anexo 10 que el importador tiene
  evidenciaNoms?: boolean | null;
  documentoRrnaAmparaMercancia?: boolean | null;
  certOrigen9Elementos?: boolean | null;
  incrementablesConSoporte?: boolean | null;
  pagoConSoporteBancario?: boolean | null;
  proveedorLocalizable?: boolean | null;
  causalSuspensionPadron?: boolean | null;
  vinculacionConCliente?: boolean | null;
  rutaTercerPaisEnsamblador?: boolean | null;
  pruebaOrigenDistinto?: boolean | null;
  transferenciaDeTemporales?: boolean | null;
  expediente59V?: {
    a?: boolean | null; b?: boolean | null; c?: boolean | null; d?: boolean | null;
    e?: boolean | null; f?: boolean | null; g?: boolean | null; h?: boolean | null;
  };
  // Solo agencia:
  constancia32D?: boolean | null;
  mveEspejoAgencia?: boolean | null;
}

/** Señales calculadas SERVER-SIDE contra los módulos ya cotejados del producto. */
export interface VerificadoSignals {
  fraccionValida?: boolean;          // validateFraction
  fraccionClasificadorCoincide?: boolean | null; // Clasificador (null = no evaluado)
  nicoExiste?: boolean | null;       // catálogo nicos
  sectoresRequeridos?: string[];     // resolver SATPadron por fracción
  cuotaActiva?: { tasa: string; pais: string } | null; // AntidumpingDuty exact-match
  pedimentoFormatoValido?: boolean | null; // validatePedimentoNumero
  en69B?: { situacion: string; listaAl: string } | null; // tabla Sat69B
  lista69BDisponible?: boolean;      // hay ingesta utilizable (<30 días para 'verificado' pleno)
  temporalesFueraDomicilio?: number; // Inventario (conteo)
  temporalesPorVencer?: number;      // Inventario (conteo ≤30 días)
  nomsRequeridas?: string[];         // catálogo Fraction.noms (advertencia: no cotejado vs 2.4.1)
  fraccionEnDecretoTasas?: boolean | null; // dataset DOF 29-12-2025 (null = dataset no disponible)
}

export interface Signals {
  tipoSujeto: TipoSujeto;
  operacion: OperacionInput;
  declarado: DeclaradoInput;
  verificado: VerificadoSignals;
}

export type OrigenSenal = 'verificado' | 'declarado';

export interface RiskRule {
  id: string;
  factor: FactorId;
  descripcion: string;
  maxPuntos: number;
  bandera?: 'EMBARGO' | 'BLOQUEANTE' | 'LISTADO_69B';
  origenSenal: OrigenSenal | 'mixto';
  evaluar: (s: Signals) => number; // determinista; 0..maxPuntos
  fundamento: Fundamento;
}

export interface ShieldItem {
  id: string;
  grupo: string;
  descripcion: string;
  soloAgencia?: boolean;
  /** aplica(s): si false, el ítem sale del denominador (se muestra en gris). */
  aplica: (s: Signals) => boolean;
  /** completo(s): true/false/null (null = sin responder → cuenta como incompleto). */
  completo: (s: Signals) => boolean | null;
  origenSenal: OrigenSenal;
  accionSugerida: string;
  fundamento: Fundamento;
}

export interface ReglaResultado {
  id: string;
  factor: FactorId;
  descripcion: string;
  puntos: number;
  maxPuntos: number;
  bandera?: string;
  origenSenal: string;
  fundamento: Fundamento;
}

export interface FactorResultado {
  factor: FactorId;
  puntos: number; // saturado al peso
  peso: number;
  reglas: ReglaResultado[];
}

export interface ChecklistResultado {
  id: string;
  grupo: string;
  descripcion: string;
  aplicable: boolean;
  completo: boolean;
  origenSenal: string;
  accionSugerida: string;
  fundamento: Fundamento;
}

export interface AssessmentResultado {
  exposicion: number;   // 0-100
  escudoPct: number;    // 0-100
  banda: Banda;
  banderas: string[];
  factores: FactorResultado[];
  checklist: ChecklistResultado[];
  faltantes: string[];  // acciones top que más mejoran la posición
  rulesVersion: string;
  disclaimer: string;
}
