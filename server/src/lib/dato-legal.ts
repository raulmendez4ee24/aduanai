/**
 * FRONTERA CANÓNICA · DatoLegal<T> — el tipo que obliga a todo dato legal a
 * declarar de dónde viene, cuándo se cotejó y en qué estado de verificación
 * está (docs/FRONTERA_CANONICA_DESIGN.md §1).
 *
 * Los constructores de abajo son los ÚNICOS caminos legítimos para crear el
 * objeto: hacen cumplir los invariantes (§1.2) en runtime, no por convención.
 * Regla central: un LLM o una declaración del usuario JAMÁS pueden producir
 * un dato 'verificado'; si la fuente no tiene el dato, sale 'no_disponible';
 * si la consulta falló, sale 'no_revisado' con valor null — nunca un relleno.
 */

export type OrigenDato =
  | 'catalogo'            // jerarquía TIGIE (Fraction/Subheading/…)
  | 'tabla'               // tablas canónicas (FractionRegulation, SATPadron,
                          //   AntidumpingDuty, EstimatedPrice, ExchangeRate, corpus)
  | 'declarado_usuario'   // vino del formulario/entrada del usuario
  | 'llm_no_verificado';  // lo produjo un modelo y NADIE lo cotejó

export type EstadoDato =
  | 'verificado'      // cotejado contra la fuente declarada en fechaCotejo
  | 'sin_verificar'   // existe un valor pero sin cotejo contra fuente oficial
  | 'no_revisado'     // la consulta que debía traerlo FALLÓ — no sabemos
  | 'vencido'         // hubo cotejo pero la fuente pudo cambiar
  | 'no_disponible';  // la fuente canónica no tiene el dato — el sistema lo admite

export interface FuenteLegal {
  nombre: string;                  // "SNICE Base Única", "DOF", "Banxico"…
  url: string | null;              // URL oficial (portada institucional si no hay específica)
  version: string | null;          // ej. tigieVersion de getActiveVersions()
  fechaPublicacion: string | null; // ISO
}

export interface DatoLegal<T> {
  valor: T | null;                 // null ⇔ estado 'no_disponible' o 'no_revisado'
  origen: OrigenDato;
  fuente: FuenteLegal | null;      // null ⇔ origen 'declarado_usuario' o 'llm_no_verificado'
  fechaCotejo: string | null;      // ISO — cuándo se cotejó valor↔fuente
  estado: EstadoDato;
  metodo?: 'manual' | 'ingesta' | 'scraper';
  nota?: string;                   // contexto corto ("cobertura pendiente Anexo 2.4.1")
}

function invariante(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`DatoLegal inválido: ${msg}`);
}

/** Dato cotejado contra fuente oficial. Exige fuente + fechaCotejo. */
export function datoVerificado<T>(
  valor: T,
  fuente: FuenteLegal,
  fechaCotejo: string,
  origen: 'catalogo' | 'tabla',
  metodo?: 'manual' | 'ingesta' | 'scraper',
  nota?: string,
): DatoLegal<T> {
  invariante(valor !== null && valor !== undefined, "'verificado' requiere un valor");
  invariante(!!fuente?.nombre, "'verificado' requiere fuente con nombre");
  invariante(!!fechaCotejo, "'verificado' requiere fechaCotejo");
  return { valor, origen, fuente, fechaCotejo, estado: 'verificado', metodo, nota };
}

/** Dato con valor pero sin cotejo contra fuente oficial (ámbar). */
export function datoSinVerificar<T>(
  valor: T,
  origen: OrigenDato,
  nota?: string,
  fuente?: FuenteLegal,
): DatoLegal<T> {
  invariante(valor !== null && valor !== undefined, "'sin_verificar' requiere un valor");
  return { valor, origen, fuente: fuente ?? null, fechaCotejo: null, estado: 'sin_verificar', nota };
}

/** Dato declarado por el usuario — nunca se pinta verde. */
export function datoDeclarado<T>(valor: T, nota?: string): DatoLegal<T> {
  invariante(valor !== null && valor !== undefined, "'declarado_usuario' requiere un valor");
  return { valor, origen: 'declarado_usuario', fuente: null, fechaCotejo: null, estado: 'sin_verificar', nota };
}

/** La fuente canónica existe pero NO tiene el dato. Jamás se rellena. */
export function datoNoDisponible<T>(origen: 'catalogo' | 'tabla', fuente?: FuenteLegal, nota?: string): DatoLegal<T> {
  return { valor: null, origen, fuente: fuente ?? null, fechaCotejo: null, estado: 'no_disponible', nota };
}

/** La consulta que debía traer el dato FALLÓ. `nota` = qué falló. */
export function datoNoRevisado<T>(nota: string): DatoLegal<T> {
  invariante(!!nota, "'no_revisado' exige nota con el motivo del fallo");
  return { valor: null, origen: 'tabla', fuente: null, fechaCotejo: null, estado: 'no_revisado', nota };
}

/** Dato cotejado cuya fuente pudo cambiar (TTL/expiración vencida). */
export function datoVencido<T>(
  valor: T,
  fuente: FuenteLegal,
  fechaCotejo: string,
  origen: 'catalogo' | 'tabla',
  nota?: string,
): DatoLegal<T> {
  invariante(!!fuente?.nombre && !!fechaCotejo, "'vencido' requiere fuente y fechaCotejo previos");
  return { valor, origen, fuente, fechaCotejo, estado: 'vencido', nota };
}
