// Configuración central y tipada del entorno (P1/P1.1 — endurecimiento JWT_SECRET).
//
// Única fuente de verdad para leer/validar variables de entorno sensibles.
// Elimina el patrón inseguro `process.env.JWT_SECRET || 'dev-secret'`:
//   - JWT_SECRET es OBLIGATORIO y de longitud mínima en TODOS los entornos
//     (development, test, production, staging, preview, NODE_ENV ausente o
//     cualquier otro valor). La fortaleza NUNCA depende de NODE_ENV.
//   - Sin ningún fallback (ni `||`, ni `??`, ni ternario, ni default).
//   - Si falta o es inválido, se lanza un error CLARO pero NO sensible
//     (solo nombres de variables y reglas; nunca el valor, longitud ni fragmento).
// El servidor invoca assertConfig() al arrancar → fail-fast antes de servir.
// Los sitios de firma/verificación usan getJwtSecret() (lazy), de modo que las
// pruebas inyectan su propio secreto y ningún otro módulo lee process.env.JWT_SECRET.

import { z } from 'zod';

// Longitud mínima aplicada por igual a TODOS los entornos.
export const JWT_SECRET_MIN_LENGTH = 32;

export type EntornoNormalizado = 'development' | 'test' | 'production_like';

// Normaliza CUALQUIER NODE_ENV a una clasificación interna. Acepta valores como
// staging/preview/review/qa/desconocido y NODE_ENV ausente. Esta clasificación
// NUNCA se usa para debilitar la validación de JWT_SECRET; es solo informativa.
export function normalizarEntorno(nodeEnv: string | undefined): EntornoNormalizado {
  const v = (nodeEnv ?? '').trim().toLowerCase();
  if (v === 'test') return 'test';
  // Default operativo cuando NODE_ENV está ausente o es de desarrollo local.
  if (v === '' || v === 'development' || v === 'dev' || v === 'local') return 'development';
  // production, staging, preview, review, qa y cualquier otro string no vacío.
  return 'production_like';
}

const envSchema = z.object({
  // ≥32 SIEMPRE. Sin fallback. El mensaje describe la regla, nunca el valor.
  JWT_SECRET: z.string().min(JWT_SECRET_MIN_LENGTH, `debe tener al menos ${JWT_SECRET_MIN_LENGTH} caracteres`),
});

export interface AppConfig {
  NODE_ENV: EntornoNormalizado;
  JWT_SECRET: string;
}

function formatearError(issues: readonly { path: readonly PropertyKey[]; message: string }[]): string {
  // Solo nombres de variables y reglas — jamás valores.
  const detalles = issues.map(i => `${i.path.map(String).join('.') || 'env'}: ${i.message}`).join('; ');
  return `Configuración de entorno inválida — ${detalles}`;
}

// Valida un objeto de entorno explícito (testeable, sin caché ni process.env).
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse({ JWT_SECRET: env.JWT_SECRET });
  if (!parsed.success) {
    throw new Error(formatearError(parsed.error.issues));
  }
  return { NODE_ENV: normalizarEntorno(env.NODE_ENV), JWT_SECRET: parsed.data.JWT_SECRET };
}

let cache: AppConfig | null = null;

// Config cacheada leída de process.env. Lanza (fail-fast) si es inválida.
export function getConfig(): AppConfig {
  return (cache ??= loadConfig());
}

// Validación temprana en el arranque del servidor.
export function assertConfig(): void {
  getConfig();
}

// Secreto JWT — única vía autorizada de obtenerlo. Sin fallback.
export function getJwtSecret(): string {
  return getConfig().JWT_SECRET;
}

// Solo para pruebas: limpia la caché tras inyectar/retirar variables de entorno.
export function resetConfigCache(): void {
  cache = null;
}
