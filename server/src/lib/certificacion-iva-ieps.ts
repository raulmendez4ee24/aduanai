/**
 * Certificación IVA/IEPS (Título 7 RGCE 2026) — catálogo de requisitos y
 * obligaciones por rubro A/AA/AAA con semáforo por obligación.
 *
 * Respaldo: `cotejo: 'corpus'` = respaldada por un LegalDocument del repo
 * (`fuente` = reference exacta; corpus 49 docs, ver corpus-legal-estado).
 * `cotejo: 'pendiente'` = estructura conocida de la práctica, SIN fuente en el
 * repo: la UI la muestra como "pendiente de cotejo contra RGCE 2026" y NO se
 * afirma como obligación vigente. Nada de datos legales inventados.
 *
 * Lo que el corpus SÍ respalda (Reglas 7.1.1, 7.1.2 y 7.1.3 RGCE 2026, cotejado
 * vs DOF 27-12-2025 en 7.1.6):
 *  - tres rubros A/AA/AAA; requisitos generales en 7.1.1 (invoca 28-A LIVA,
 *    15-A LIEPS y 100-A LA); específicos A en 7.1.2; AA/AAA en 7.1.3;
 *  - AA exige ≥4 años de operaciones y AAA ≥7;
 *  - el beneficio es un crédito fiscal del 100% del IVA/IEPS de la importación
 *    temporal (no exime ni difiere);
 *  - VIGENCIA (7.1.6): UN AÑO renovable para A, AA y AAA. El esquema "1/2/3
 *    años por rubro" NO está vigente en RGCE 2026.
 *
 * Funciones puras: el estado se calcula desde un contexto que arma el servicio.
 */

export type Rubro = 'A' | 'AA' | 'AAA';
export type SemaforoOb = 'verde' | 'ambar' | 'rojo' | 'gris';
export type CotejoOb = 'corpus' | 'pendiente';

export const VIGENCIA_REGISTRO_MESES = 12; // Regla 7.1.6 RGCE 2026 (todos los rubros)
export const FUENTE_VIGENCIA = 'Regla 7.1.6 RGCE 2026 (DOF 27-12-2025): vigencia de un año, renovable, para A, AA y AAA';
export const ANTIGUEDAD_MINIMA_ANIOS: Record<Rubro, number | null> = { A: null, AA: 4, AAA: 7 };

/** Plazo de trabajo para el aviso de renovación (días antes del vencimiento). SIN fuente en el repo. */
export const PLAZO_RENOVACION_DIAS = 30;
export const NOTA_PLAZO_RENOVACION = 'Plazo de trabajo (30 días antes del vencimiento); el plazo exacto de la solicitud de renovación (Regla 7.1.4/7.1.6 RGCE 2026) está pendiente de cotejo.';

export interface ContextoCertificacion {
  hoy: Date;
  perfil: {
    modality: string | null;
    status: string | null;
    issueDate: Date | null;
    expiryDate: Date | null;
    renewalDeadline: Date | null;
  } | null;
  /** Antigüedad operativa en años si se conoce (primer pedimento/importación registrada). */
  antiguedadAnios: number | null;
  padronImportadores: 'activo' | 'suspendido' | 'no_registrado' | 'desconocido';
  padronesSectoriales: { requeridos: number; activos: number } | null;
  opinion32D: { positiva: boolean; fecha: Date | null } | null;
  garantiasActivas: number;
  garantiasPorVencer30d: number;
  creditosVencidosSinDescargo: number;
  anexo30UltimoPeriodo: string | null;
  anexo30EsperadoPeriodo: string | null;
  /** Obligaciones de calendario (CERT_IVA_IEPS / AVISO_IMMEX) pendientes vencidas. */
  avisosVencidos: number;
  avisosPendientes: number;
  /** Hay control de inventarios (Anexo 24) con movimientos en el sistema. */
  inventarioConMovimientos: boolean;
}

export interface EvaluacionOb { estado: SemaforoOb; detalle: string; fechaLimite?: string | null }

export interface ObligacionCert {
  clave: string;
  titulo: string;
  categoria: 'requisito' | 'obligacion' | 'aviso' | 'renovacion';
  rubros: Rubro[];
  fundamento: string;
  cotejo: CotejoOb;
  /** Reference del LegalDocument que la respalda (si cotejo = corpus). */
  fuente: string | null;
  consecuencia: string;
  evaluar: (ctx: ContextoCertificacion) => EvaluacionOb;
}

const TODOS: Rubro[] = ['A', 'AA', 'AAA'];
const FUENTE_71 = 'Reglas 7.1.1, 7.1.2 y 7.1.3 RGCE 2026';

function dias(a: Date, b: Date): number { return Math.ceil((a.getTime() - b.getTime()) / 86_400_000); }
function iso(d: Date | null | undefined): string | null { return d ? d.toISOString().slice(0, 10) : null; }

export function rubroDe(modality: string | null | undefined): Rubro | null {
  const m = (modality ?? '').trim().toUpperCase();
  return m === 'A' || m === 'AA' || m === 'AAA' ? m : null;
}

export const OBLIGACIONES_CERT: ObligacionCert[] = [
  {
    clave: 'REGISTRO_VIGENTE',
    titulo: 'Registro en el Esquema de Certificación (modalidad IVA e IEPS) vigente',
    categoria: 'requisito', rubros: TODOS,
    fundamento: 'Reglas 7.1.1 y 7.1.6 RGCE 2026; Art. 28-A LIVA, 15-A LIEPS, 100-A LA',
    cotejo: 'corpus', fuente: FUENTE_71,
    consecuencia: 'Sin registro vigente no hay crédito fiscal: el IVA/IEPS de cada importación temporal se paga o garantiza.',
    evaluar: (c) => {
      if (!c.perfil || !rubroDe(c.perfil.modality)) return { estado: 'gris', detalle: 'Sin perfil de certificación capturado (modalidad A/AA/AAA).' };
      if (c.perfil.status === 'SUSPENDED' || c.perfil.status === 'CANCELLED') return { estado: 'rojo', detalle: `Registro ${c.perfil.status === 'SUSPENDED' ? 'suspendido' : 'cancelado'}.` };
      if (!c.perfil.expiryDate) return { estado: 'ambar', detalle: 'Sin fecha de vencimiento capturada: no se puede vigilar la vigencia anual.' };
      const d = dias(c.perfil.expiryDate, c.hoy);
      if (d < 0) return { estado: 'rojo', detalle: `Vencido hace ${-d} días (${iso(c.perfil.expiryDate)}).`, fechaLimite: iso(c.perfil.expiryDate) };
      if (d <= PLAZO_RENOVACION_DIAS) return { estado: 'ambar', detalle: `Vence en ${d} días (${iso(c.perfil.expiryDate)}).`, fechaLimite: iso(c.perfil.expiryDate) };
      return { estado: 'verde', detalle: `Vigente hasta ${iso(c.perfil.expiryDate)} (${d} días).`, fechaLimite: iso(c.perfil.expiryDate) };
    },
  },
  {
    clave: 'RENOVACION_ANUAL',
    titulo: 'Renovación anual del Registro (vigencia de un año para A, AA y AAA)',
    categoria: 'renovacion', rubros: TODOS,
    fundamento: FUENTE_VIGENCIA,
    cotejo: 'corpus', fuente: FUENTE_71,
    consecuencia: 'Si no se renueva antes del vencimiento, el registro deja de surtir efectos y se pierde el crédito fiscal.',
    evaluar: (c) => {
      if (!c.perfil?.expiryDate) return { estado: 'gris', detalle: 'Sin fecha de vencimiento: captura expiryDate para programar la renovación.' };
      const limite = new Date(c.perfil.expiryDate.getTime() - PLAZO_RENOVACION_DIAS * 86_400_000);
      const d = dias(limite, c.hoy);
      if (c.perfil.status === 'RENEWAL_PENDING') return { estado: 'ambar', detalle: 'Renovación en trámite.', fechaLimite: iso(limite) };
      if (d < 0 && dias(c.perfil.expiryDate, c.hoy) >= 0) return { estado: 'rojo', detalle: `La fecha de trabajo para solicitar la renovación (${iso(limite)}) ya pasó. ${NOTA_PLAZO_RENOVACION}`, fechaLimite: iso(limite) };
      if (dias(c.perfil.expiryDate, c.hoy) < 0) return { estado: 'rojo', detalle: 'Registro vencido sin renovación registrada.', fechaLimite: iso(limite) };
      if (d <= 60) return { estado: 'ambar', detalle: `Solicitar renovación antes del ${iso(limite)} (${d} días). ${NOTA_PLAZO_RENOVACION}`, fechaLimite: iso(limite) };
      return { estado: 'verde', detalle: `Renovación programada para antes del ${iso(limite)}.`, fechaLimite: iso(limite) };
    },
  },
  {
    clave: 'ANTIGUEDAD_OPERATIVA',
    titulo: 'Antigüedad operativa mínima del rubro (AA ≥ 4 años, AAA ≥ 7 años)',
    categoria: 'requisito', rubros: ['AA', 'AAA'],
    fundamento: 'Regla 7.1.3 RGCE 2026',
    cotejo: 'corpus', fuente: FUENTE_71,
    consecuencia: 'Sin la antigüedad del rubro, la autoridad puede negar o reasignar el rubro solicitado.',
    evaluar: (c) => {
      const r = rubroDe(c.perfil?.modality);
      const min = r ? ANTIGUEDAD_MINIMA_ANIOS[r] : null;
      if (!min) return { estado: 'gris', detalle: 'No aplica al rubro A.' };
      if (c.antiguedadAnios == null) return { estado: 'gris', detalle: 'Antigüedad operativa no verificable desde el sistema (sin pedimentos históricos).' };
      return c.antiguedadAnios >= min
        ? { estado: 'verde', detalle: `${c.antiguedadAnios.toFixed(1)} años de operaciones registradas (mínimo ${min}).` }
        : { estado: 'ambar', detalle: `Solo ${c.antiguedadAnios.toFixed(1)} años registrados en el sistema; el rubro exige ${min}. Verifica con tu histórico completo.` };
    },
  },
  {
    clave: 'PADRON_IMPORTADORES',
    titulo: 'Inscripción activa en el Padrón de Importadores',
    categoria: 'requisito', rubros: TODOS,
    fundamento: 'Regla 7.1.1 RGCE 2026 (requisitos generales) — requisito específico pendiente de cotejo',
    cotejo: 'pendiente', fuente: null,
    consecuencia: 'Sin padrón activo no se puede importar; la certificación pierde objeto.',
    evaluar: (c) => {
      if (c.padronImportadores === 'activo') return { estado: 'verde', detalle: 'Padrón de importadores activo.' };
      if (c.padronImportadores === 'suspendido') return { estado: 'rojo', detalle: 'Padrón de importadores suspendido.' };
      if (c.padronImportadores === 'no_registrado') return { estado: 'rojo', detalle: 'Sin inscripción en el padrón de importadores.' };
      return { estado: 'gris', detalle: 'Estado del padrón no capturado (Cliente.padronImportadores o Padrones del tenant).' };
    },
  },
  {
    clave: 'PADRONES_SECTORIALES',
    titulo: 'Padrones sectoriales requeridos por las fracciones operadas',
    categoria: 'requisito', rubros: TODOS,
    fundamento: 'Anexo 10 RGCE 2026 — vínculo con la certificación pendiente de cotejo',
    cotejo: 'pendiente', fuente: null,
    consecuencia: 'Operar fracciones de sector sin padrón sectorial es causal de suspensión del padrón general.',
    evaluar: (c) => {
      if (!c.padronesSectoriales) return { estado: 'gris', detalle: 'Sin fracciones de sector detectadas o sin datos de padrones sectoriales.' };
      const { requeridos, activos } = c.padronesSectoriales;
      if (requeridos === 0) return { estado: 'verde', detalle: 'Ninguna fracción operada exige padrón sectorial.' };
      if (activos >= requeridos) return { estado: 'verde', detalle: `${activos}/${requeridos} padrones sectoriales activos.` };
      return { estado: 'rojo', detalle: `${activos}/${requeridos} padrones sectoriales activos.` };
    },
  },
  {
    clave: 'OPINION_32D',
    titulo: 'Opinión positiva de cumplimiento de obligaciones fiscales (Art. 32-D CFF)',
    categoria: 'requisito', rubros: TODOS,
    fundamento: 'Regla 7.1.1 RGCE 2026 (requisitos generales) — inciso específico pendiente de cotejo',
    cotejo: 'pendiente', fuente: null,
    consecuencia: 'Opinión negativa = causal para negar o cancelar el registro.',
    evaluar: (c) => {
      if (!c.opinion32D) return { estado: 'gris', detalle: 'Sin opinión 32-D capturada. Regístrala como obligación OPINION_32D en el Calendario.' };
      if (!c.opinion32D.positiva) return { estado: 'rojo', detalle: 'Opinión de cumplimiento NEGATIVA registrada.' };
      const antig = c.opinion32D.fecha ? dias(c.hoy, c.opinion32D.fecha) : null;
      if (antig != null && antig > 30) return { estado: 'ambar', detalle: `Opinión positiva con ${antig} días; conviene una reciente.` };
      return { estado: 'verde', detalle: 'Opinión positiva vigente.' };
    },
  },
  {
    clave: 'CONTROL_INVENTARIOS',
    titulo: 'Control de inventarios automatizado (Anexo 24) actualizado',
    categoria: 'obligacion', rubros: TODOS,
    fundamento: 'Art. 59 fracc. I LA y Anexo 24 RGCE — vínculo con 7.1.1/7.2.1 pendiente de cotejo',
    cotejo: 'pendiente', fuente: null,
    consecuencia: 'Sin control de inventarios, los insumos temporales no se descargan y el crédito no se puede sustentar.',
    evaluar: (c) => c.inventarioConMovimientos
      ? { estado: 'verde', detalle: 'Hay inventario Anexo 24 con movimientos en el sistema.' }
      : { estado: 'gris', detalle: 'Sin movimientos de inventario en el sistema; no verificable desde aquí.' },
  },
  {
    clave: 'ANEXO_30_SCCCYG',
    titulo: 'Sistema de Control de Cuentas de Créditos y Garantías (SCCCyG / Anexo 30) al día',
    categoria: 'obligacion', rubros: TODOS,
    fundamento: 'Regla 7.2.1 RGCE 2026 y Anexo 30 — periodicidad pendiente de cotejo',
    cotejo: 'pendiente', fuente: null,
    consecuencia: 'Cuentas sin actualizar generan discrepancias entre el crédito otorgado y el descargado ante la autoridad.',
    evaluar: (c) => {
      if (!c.anexo30UltimoPeriodo) return { estado: 'gris', detalle: 'Sin estados de cuenta Anexo 30 capturados.' };
      if (c.anexo30EsperadoPeriodo && c.anexo30UltimoPeriodo < c.anexo30EsperadoPeriodo) {
        return { estado: 'ambar', detalle: `Último periodo capturado ${c.anexo30UltimoPeriodo}; se esperaría ${c.anexo30EsperadoPeriodo}.` };
      }
      return { estado: 'verde', detalle: `Anexo 30 capturado hasta ${c.anexo30UltimoPeriodo}.` };
    },
  },
  {
    clave: 'DESCARGO_CREDITOS',
    titulo: 'Descargo oportuno del crédito fiscal (retorno/cambio de régimen dentro del plazo)',
    categoria: 'obligacion', rubros: TODOS,
    fundamento: 'Art. 28-A LIVA y 15-A LIEPS; plazo de la importación temporal (Art. 108 LA)',
    cotejo: 'corpus', fuente: FUENTE_71,
    consecuencia: 'Crédito no descargado al vencer el plazo = IVA/IEPS exigible con actualización y recargos.',
    evaluar: (c) => c.creditosVencidosSinDescargo > 0
      ? { estado: 'rojo', detalle: `${c.creditosVencidosSinDescargo} crédito(s) con plazo vencido y saldo sin descargar.` }
      : { estado: 'verde', detalle: 'Sin créditos vencidos con saldo.' },
  },
  {
    clave: 'GARANTIA_INTERES_FISCAL',
    titulo: 'Garantía del interés fiscal vigente cuando el rubro/beneficio la exige',
    categoria: 'obligacion', rubros: ['A'],
    fundamento: 'Regla 7.1.2 RGCE 2026 (rubro A) — alcance de la garantía pendiente de cotejo',
    cotejo: 'pendiente', fuente: null,
    consecuencia: 'Garantía vencida = riesgo de suspensión del beneficio.',
    evaluar: (c) => {
      if (c.garantiasActivas === 0) return { estado: 'gris', detalle: 'Sin garantías registradas; si tu rubro no la exige, ignora esta línea.' };
      if (c.garantiasPorVencer30d > 0) return { estado: 'ambar', detalle: `${c.garantiasPorVencer30d} garantía(s) vencen en ≤30 días.` };
      return { estado: 'verde', detalle: `${c.garantiasActivas} garantía(s) activas.` };
    },
  },
  {
    clave: 'AVISOS_CAMBIOS',
    titulo: 'Avisos de cambios (denominación, domicilio, socios/accionistas, clientes y proveedores)',
    categoria: 'aviso', rubros: TODOS,
    fundamento: 'Regla 7.2.1 RGCE 2026 — plazos por tipo de aviso pendiente de cotejo',
    cotejo: 'pendiente', fuente: null,
    consecuencia: 'Aviso omitido o extemporáneo es causal de requerimiento y, reincidente, de cancelación.',
    evaluar: (c) => {
      if (c.avisosVencidos > 0) return { estado: 'rojo', detalle: `${c.avisosVencidos} aviso(s) con fecha límite vencida sin cumplir.` };
      if (c.avisosPendientes > 0) return { estado: 'ambar', detalle: `${c.avisosPendientes} aviso(s) pendientes dentro de plazo.` };
      return { estado: 'verde', detalle: 'Sin avisos pendientes registrados.' };
    },
  },
];

export interface SemaforoCertificacion {
  rubro: Rubro | null;
  vigencia: { meses: number; fuente: string };
  global: SemaforoOb;
  resumen: Record<SemaforoOb, number>;
  obligaciones: Array<Omit<ObligacionCert, 'evaluar'> & EvaluacionOb & { aplica: boolean }>;
  pendientesDeCotejo: number;
}

export function evaluarCertificacion(ctx: ContextoCertificacion): SemaforoCertificacion {
  const rubro = rubroDe(ctx.perfil?.modality);
  const obligaciones = OBLIGACIONES_CERT.map(({ evaluar, ...def }) => {
    const aplica = rubro ? def.rubros.includes(rubro) : true;
    const ev = aplica ? evaluar(ctx) : { estado: 'gris' as SemaforoOb, detalle: `No aplica al rubro ${rubro}.` };
    return { ...def, ...ev, aplica };
  });
  const resumen: Record<SemaforoOb, number> = { verde: 0, ambar: 0, rojo: 0, gris: 0 };
  for (const o of obligaciones) if (o.aplica) resumen[o.estado]++;
  const global: SemaforoOb = resumen.rojo > 0 ? 'rojo' : resumen.ambar > 0 ? 'ambar' : resumen.verde > 0 ? 'verde' : 'gris';
  return {
    rubro,
    vigencia: { meses: VIGENCIA_REGISTRO_MESES, fuente: FUENTE_VIGENCIA },
    global,
    resumen,
    obligaciones,
    pendientesDeCotejo: obligaciones.filter((o) => o.cotejo === 'pendiente').length,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Avisos (eventos → ObligacionCalendario)
// ────────────────────────────────────────────────────────────────────────────
export type TipoAviso = 'cambio_domicilio' | 'cambio_socios' | 'cambio_denominacion' | 'cambio_clientes_proveedores' | 'renovacion';

export interface DefinicionAviso {
  tipo: TipoAviso;
  tipoCalendario: 'CERT_IVA_IEPS' | 'AVISO_IMMEX';
  titulo: string;
  fundamento: string;
  cotejo: CotejoOb;
  /** Días de plazo de trabajo desde el evento. SIN fuente en el repo salvo renovación (vigencia anual). */
  plazoDias: number;
  consecuencia: string;
}

export const AVISOS: Record<TipoAviso, DefinicionAviso> = {
  cambio_domicilio: { tipo: 'cambio_domicilio', tipoCalendario: 'AVISO_IMMEX', titulo: 'Aviso de cambio de domicilio fiscal / planta', fundamento: 'Regla 7.2.1 RGCE 2026 y Decreto IMMEX (aviso a SE) — plazo pendiente de cotejo', cotejo: 'pendiente', plazoDias: 10, consecuencia: 'Operar en domicilio no registrado: causal de suspensión del programa y del registro.' },
  cambio_socios: { tipo: 'cambio_socios', tipoCalendario: 'CERT_IVA_IEPS', titulo: 'Aviso de cambio de socios, accionistas o representante legal', fundamento: 'Regla 7.2.1 RGCE 2026 — plazo pendiente de cotejo', cotejo: 'pendiente', plazoDias: 10, consecuencia: 'Aviso omitido: requerimiento y posible cancelación del registro.' },
  cambio_denominacion: { tipo: 'cambio_denominacion', tipoCalendario: 'CERT_IVA_IEPS', titulo: 'Aviso de cambio de denominación o razón social', fundamento: 'Regla 7.2.1 RGCE 2026 — plazo pendiente de cotejo', cotejo: 'pendiente', plazoDias: 10, consecuencia: 'Documentos a nombre distinto del registrado: observaciones en despacho.' },
  cambio_clientes_proveedores: { tipo: 'cambio_clientes_proveedores', tipoCalendario: 'CERT_IVA_IEPS', titulo: 'Actualización de clientes y proveedores en el extranjero', fundamento: 'Regla 7.2.1 RGCE 2026 — periodicidad pendiente de cotejo', cotejo: 'pendiente', plazoDias: 30, consecuencia: 'Proveedor no reportado: cuestionamiento de la operación temporal.' },
  renovacion: { tipo: 'renovacion', tipoCalendario: 'CERT_IVA_IEPS', titulo: 'Solicitud de renovación del Registro IVA/IEPS', fundamento: FUENTE_VIGENCIA, cotejo: 'corpus', plazoDias: PLAZO_RENOVACION_DIAS, consecuencia: 'Sin renovación: pérdida del crédito fiscal al vencer el registro.' },
};

export function tipoAvisoValido(v: unknown): v is TipoAviso {
  return typeof v === 'string' && v in AVISOS;
}
