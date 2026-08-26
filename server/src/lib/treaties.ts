export interface TratadoInstrumento {
  nombre: string;
  firmado: string | null;
  entradaEnVigor: string | null;
  aplicacionProvisional: string | null;
  estadoRatificacion: string;
  estado:
    | 'VIGENTE'
    | 'APLICACION_PROVISIONAL'
    | 'FIRMADO_PENDIENTE_RATIFICACION'
    | 'PENDIENTE_ENTRADA_EN_VIGOR';
  fuenteOficial: string;
  fechaCotejo: string;
}

const FUENTE_COMISION_EUROPEA =
  'https://policy.trade.ec.europa.eu/eu-trade-relationships-country-and-region/countries-and-regions/mexico/eu-mexico-agreement_en';
const FUENTE_CONSEJO_UE =
  'https://www.consilium.europa.eu/en/press/press-releases/2026/05/11/eu-mexico-relations-council-endorses-agreements-to-boost-cooperation-and-trade/';

export const TLCUEM_VIGENCIA: {
  acuerdoVigente: TratadoInstrumento;
  modernizadoMGA: TratadoInstrumento;
  interinoITA: TratadoInstrumento;
  instrumentoParaCalculo: 'acuerdoVigente';
} = {
  acuerdoVigente: {
    nombre: 'TLCUEM — Decisión 2/2000 del Consejo Conjunto México-UE',
    firmado: null,
    entradaEnVigor: '2000-07-01',
    aplicacionProvisional: null,
    estadoRatificacion: 'Ratificado; el acuerdo para bienes está en vigor desde el 01-jul-2000.',
    estado: 'VIGENTE',
    fuenteOficial: FUENTE_COMISION_EUROPEA,
    fechaCotejo: '2026-07-19',
  },
  modernizadoMGA: {
    nombre: 'Acuerdo Global Modernizado México-UE (MGA)',
    firmado: '2026-05-22',
    entradaEnVigor: null,
    aplicacionProvisional: null,
    estadoRatificacion: 'Requiere ratificación del Parlamento Europeo, los 27 parlamentos nacionales y el Senado mexicano.',
    estado: 'FIRMADO_PENDIENTE_RATIFICACION',
    fuenteOficial: FUENTE_CONSEJO_UE,
    fechaCotejo: '2026-07-19',
  },
  interinoITA: {
    nombre: 'Acuerdo comercial interino México-UE (iTA)',
    firmado: null,
    entradaEnVigor: null,
    aplicacionProvisional: null,
    estadoRatificacion: 'Consentimiento del Parlamento Europeo otorgado el 08-jul-2026; pendientes las notificaciones mutuas.',
    estado: 'PENDIENTE_ENTRADA_EN_VIGOR',
    fuenteOficial: FUENTE_COMISION_EUROPEA,
    fechaCotejo: '2026-07-19',
  },
  instrumentoParaCalculo: 'acuerdoVigente',
};

export function preferenciaAplicable(inst: TratadoInstrumento): boolean {
  return inst.estado === 'VIGENTE' || inst.estado === 'APLICACION_PROVISIONAL';
}

export const TLCUEM_COUNTRIES: string[] = [
  'DE','FR','IT','ES','NL','BE','PT','PL','AT','SE','DK','FI','IE','GR','CZ','HU','RO','BG','HR','SI','SK','LT','LV','EE','LU','CY','MT','UE','EU','ALEMANIA','FRANCIA','ITALIA','ESPAÑA','HOLANDA','BELGICA','BÉLGICA','PORTUGAL',
];

/** Partes del T-MEC (fuente única — misión cierre 25-ago-2026): la lista que
 *  usa el Cotizador multi-partida y que la Pre-Glosa importa para validar la
 *  membresía cuando el usuario declara `appliesTMEC`. Incluye variantes de
 *  captura histórica (ISO-2, ISO-3 y nombres). NUNCA copiar esta lista: se
 *  importa. Nota conocida: quoter.ts (getPreferentialRates) conserva una
 *  variante sin MX por semántica de importación — divergencia reportada. */
export const TMEC_PAISES: string[] = [
  'US','USA','ESTADOS UNIDOS','EE.UU.','CA','CAN','CANADA','CANADÁ','MX','MEX','MÉXICO','MEXICO',
];

/** ¿El país declarado (ISO-2/ISO-3/nombre) es parte del T-MEC? */
export function esMiembroTMEC(pais: string): boolean {
  return TMEC_PAISES.includes(pais.trim().toUpperCase());
}

export function tlcuemNota(): string {
  return 'Preferencia calculada bajo el TLCUEM en vigor desde 2000 (Decisión 2/2000). El Acuerdo Global Modernizado (firmado 22-may-2026) y el acuerdo interino aún no entran en vigor (cotejo 2026-07-19).';
}
