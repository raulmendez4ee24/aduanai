/**
 * ACCIONES EN UN CLIC DESDE LA ALERTA (Operación 2026-08).
 *
 * `Alert.suggestedAction` se normaliza a `{ type, label, payload }` con un
 * vocabulario cerrado que el frontend sabe navegar:
 *
 *   armar_rt         → /inventario?temporaryImportId=…        (retorno/descargo)
 *   cambio_regimen   → /cambio-regimen?ids=a,b,c&tipo=F4      (asistente F4/F5)
 *   revisar_fraccion → /fracciones?code=XXXXXXXX (ficha de la fracción, Ola 3)
 *   ver_obligacion   → /calendario/:id
 *   cotizar          → /cotizador  (payload = partidas prellenadas)
 *
 * Las alertas históricas traen tipos legacy ('review_operation',
 * 'view_fraction', 'recalculate_quotes', …); `normalizarAccion` los traduce
 * al servir, sin migrar datos. Puro: sin DB ni red.
 */

export type TipoAccion = 'armar_rt' | 'cambio_regimen' | 'revisar_fraccion' | 'ver_obligacion' | 'cotizar';

export interface AccionAlerta {
  type: TipoAccion;
  label: string;
  payload: Record<string, unknown>;
}

export const TIPOS_ACCION: readonly TipoAccion[] = ['armar_rt', 'cambio_regimen', 'revisar_fraccion', 'ver_obligacion', 'cotizar'];

export const accionArmarRT = (temporaryImportId: string, label = 'Armar retorno (RT)'): AccionAlerta =>
  ({ type: 'armar_rt', label, payload: { temporaryImportId, route: '/inventario' } });

export const accionCambioRegimen = (temporaryImportIds: string[], tipo: 'F4' | 'F5' | 'A3' | 'RT' = 'F4', label = 'Cambio de régimen'): AccionAlerta =>
  ({ type: 'cambio_regimen', label, payload: { temporaryImportIds, tipo, route: '/cambio-regimen' } });

export const accionRevisarFraccion = (code: string, label = 'Revisar fracción'): AccionAlerta =>
  ({ type: 'revisar_fraccion', label, payload: { fractionCode: code.replace(/\./g, ''), route: `/fracciones?code=${code.replace(/\./g, '')}` } });

export const accionVerObligacion = (obligacionId: string, label = 'Ver obligación'): AccionAlerta =>
  ({ type: 'ver_obligacion', label, payload: { obligacionId, route: `/calendario/${obligacionId}` } });

export const accionCotizar = (payload: Record<string, unknown>, label = 'Cotizar'): AccionAlerta =>
  ({ type: 'cotizar', label, payload: { ...payload, route: '/cotizador' } });

/** Ruta de navegación derivada de la acción (fuente única para UI y tests). */
export function rutaDeAccion(a: AccionAlerta): string {
  const p = a.payload;
  switch (a.type) {
    case 'armar_rt':
      return `/inventario?temporaryImportId=${encodeURIComponent(String(p.temporaryImportId ?? ''))}`;
    case 'cambio_regimen': {
      const ids = Array.isArray(p.temporaryImportIds) ? (p.temporaryImportIds as string[]) : [];
      const tipo = typeof p.tipo === 'string' ? p.tipo : 'F4';
      return `/cambio-regimen?ids=${encodeURIComponent(ids.join(','))}&tipo=${encodeURIComponent(tipo)}`;
    }
    case 'revisar_fraccion':
      return `/fracciones?code=${encodeURIComponent(String(p.fractionCode ?? ''))}`;
    case 'ver_obligacion':
      return `/calendario/${encodeURIComponent(String(p.obligacionId ?? ''))}`;
    case 'cotizar': {
      const { route: _r, ...rest } = p;
      void _r;
      return `/cotizador?prefill=${encodeURIComponent(JSON.stringify(rest))}`;
    }
  }
}

interface AlertaMinima {
  type: string;
  suggestedAction: unknown;
  affectedFraction?: string | null;
  affectedOperations?: string[];
}

/**
 * Traduce cualquier `suggestedAction` (nuevo o legacy) al vocabulario cerrado.
 * Devuelve null si no hay acción navegable.
 */
export function normalizarAccion(a: AlertaMinima): AccionAlerta | null {
  const raw = (a.suggestedAction && typeof a.suggestedAction === 'object') ? a.suggestedAction as Record<string, unknown> : null;
  const rawType = typeof raw?.type === 'string' ? raw.type : null;
  const payload = (raw?.payload && typeof raw.payload === 'object') ? raw.payload as Record<string, unknown> : {};
  const label = typeof raw?.label === 'string' ? raw.label : undefined;

  if (rawType && (TIPOS_ACCION as readonly string[]).includes(rawType)) {
    return { type: rawType as TipoAccion, label: label ?? rawType, payload };
  }

  const ops = a.affectedOperations ?? [];
  switch (rawType) {
    case 'review_operation': {
      const id = typeof payload.importId === 'string' ? payload.importId : ops[0];
      if (a.type === 'import_expiring' && id) return accionCambioRegimen([id], 'F4', label ?? 'Cambio de régimen / retorno');
      if (id && String(payload.route ?? '').includes('inventario')) return accionArmarRT(id, label);
      return null;
    }
    case 'view_fraction': {
      const code = typeof payload.fractionCode === 'string' ? payload.fractionCode : a.affectedFraction;
      return code ? accionRevisarFraccion(code, label) : null;
    }
    case 'recalculate_quotes': {
      const code = typeof payload.fractionCode === 'string' ? payload.fractionCode : a.affectedFraction;
      return accionCotizar(code ? { fractionCode: code } : {}, label ?? 'Recotizar');
    }
    default:
      break;
  }

  // Sin acción explícita: inferir por tipo cuando hay datos suficientes.
  if ((a.type === 'tariff_change' || a.type === 'antidumping_new') && a.affectedFraction) {
    return accionRevisarFraccion(a.affectedFraction);
  }
  if (a.type === 'import_expiring' && ops[0]) return accionCambioRegimen([ops[0]], 'F4');
  return null;
}
