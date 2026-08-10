// Configuración central y tipada del entorno (P1 — endurecimiento JWT_SECRET).
//
// Única fuente de verdad para leer/validar variables de entorno sensibles.
// Elimina el patrón inseguro `process.env.JWT_SECRET || 'dev-secret'`:
//   - JWT_SECRET es OBLIGATORIO en todos los entornos (sin valor por defecto).
//   - En producción debe tener longitud mínima razonable.
//   - Si falta o es inválido, se lanza un error CLARO pero NO sensible
//     (solo nombres de variables y reglas; nunca el valor, longitud ni fragmento).
// El servidor invoca assertConfig() al arrancar → fail-fast antes de servir.
// Los sitios de firma/verificación usan getJwtSecret() (lazy), de modo que las
// pruebas inyectan su propio secreto y ningún módulo duplica la lectura de env.

import { z } from 'zod';

const JWT_SECRET_MIN_PROD = 32;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET es obligatorio (sin valor por defecto)'),
});

export type AppConfig = z.infer<typeof envSchema>;

function formatearError(issues: readonly { path: readonly PropertyKey[]; message: string }[]): string {
  // Solo nombres de variables y reglas — jamás valores.
  const detalles = issues.map(i => `${i.path.map(String).join('.') || 'env'}: ${i.message}`).join('; ');
  return `Configuración de entorno inválida — ${detalles}`;
}

// Valida un objeto de entorno explícito (testeable, sin caché ni process.env).
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse({ NODE_ENV: env.NODE_ENV, JWT_SECRET: env.JWT_SECRET });
  if (!parsed.success) {
    throw new Error(formatearError(parsed.error.issues));
  }
  const cfg = parsed.data;
  if (cfg.NODE_ENV === 'production' && cfg.JWT_SECRET.length < JWT_SECRET_MIN_PROD) {
    throw new Error(formatearError([{ path: ['JWT_SECRET'], message: `debe tener al menos ${JWT_SECRET_MIN_PROD} caracteres en producción` }]));
  }
  return cfg;
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
