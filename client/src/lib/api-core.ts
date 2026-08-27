/**
 * Núcleo HTTP compartido (Operación 2026-08). `api.ts` y los módulos nuevos
 * (`client/src/lib/api/<modulo>.ts`) importan `request` de aquí para no pelear
 * por un solo archivo gigante. Manda el cliente/RFC activo como X-Cliente-Id.
 */
export const CLIENTE_STORAGE_KEY = 'aduanai_cliente';

export function clienteActivo(): string | null {
  try { return localStorage.getItem(CLIENTE_STORAGE_KEY); } catch { return null; }
}
export function setClienteActivo(id: string | null): void {
  try {
    if (id) localStorage.setItem(CLIENTE_STORAGE_KEY, id); else localStorage.removeItem(CLIENTE_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('aduanai:cliente', { detail: id }));
  } catch { /* storage bloqueado */ }
}

export const API_BASE = '/api';

// Fase 4.5: guard para no disparar N redirects cuando varias peticiones
// paralelas (Dashboard carga 7 a la vez) reciben 401 al mismo tiempo.
let redirectingToLogin = false;
export function redirigiendoALogin(): boolean { return redirectingToLogin; }
export function marcarRedireccionALogin(): void { redirectingToLogin = true; }

export async function request<T>(path: string, options?: RequestInit, timeoutMs?: number): Promise<T> {
  const token = localStorage.getItem('aduanai_token');
  const controller = timeoutMs !== undefined ? new AbortController() : undefined;
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      ...(controller ? { signal: controller.signal } : {}),
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        // Operación 2026-08: cliente/RFC activo (selector global del shell).
        ...(clienteActivo() ? { 'X-Cliente-Id': clienteActivo()! } : {}),
        ...options?.headers,
      },
    });

    if (!res.ok) {
      // Fase 4.5: sesión expirada — antes cada módulo se tragaba el 401 y
      // pintaba "Sin clasificaciones"/"Sin inventario" como si no hubiera datos.
      // Un 401 con token presente = token vencido/revocado → limpiar y mandar a
      // login con mensaje. Los endpoints /auth/* se excluyen (ahí un 401 es
      // credencial inválida y lo maneja su propia pantalla).
      if (res.status === 401 && token && !path.startsWith('/auth/')) {
        if (!redirectingToLogin) {
          redirectingToLogin = true;
          localStorage.removeItem('aduanai_token');
          window.location.href = '/login?expired=1';
        }
        throw new Error('Tu sesión expiró. Inicia sesión de nuevo.');
      }
      // BUG-1 (24-ago-2026): un 502/503/504 del gateway trae HTML crudo de la
      // plataforma ("Application failed to respond") — NUNCA se muestra ese
      // texto al usuario. Se normaliza a un mensaje claro y reintentable.
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        throw new Error('El servicio no respondió (error temporal). Intenta de nuevo en unos segundos.');
      }
      const error = await res.json().catch(() => ({ message: null }));
      throw new Error(error.message || `El servidor respondió con un error (${res.status}). Intenta de nuevo.`);
    }

    // Respuesta 200 que no es JSON (p. ej. una página de error interpuesta):
    // mensaje claro, nunca el SyntaxError del parser.
    try {
      return await res.json();
    } catch {
      throw new Error('El servidor devolvió una respuesta inválida. Intenta de nuevo.');
    }
  } catch (error) {
    if (controller?.signal.aborted) {
      throw new Error('La consulta tardó demasiado. Intenta de nuevo.');
    }
    throw error;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

