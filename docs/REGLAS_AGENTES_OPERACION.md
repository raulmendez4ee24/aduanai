# Reglas para agentes del Plan Operación (27-ago-2026)

Cada agente trabaja en su worktree/rama y entrega commits limpios. Estas reglas
existen para que 5 ramas paralelas se integren sin pelearse.

## Propiedad de archivos (evita conflictos)
1. **NO edites** `server/prisma/schema.prisma` ni crees migraciones. Si te falta
   un campo/modelo, escríbelo en tu reporte final bajo "SCHEMA REQUERIDO" con el
   fragmento Prisma exacto; el integrador lo agrega en una migración común.
   Mientras tanto usa columnas Json existentes o tablas nuevas de Fase 0.
2. **NO edites** `client/src/lib/api.ts`. Crea `client/src/lib/api/<tu-modulo>.ts`
   e importa `request` desde `../api-core` (existe: `export { request }`).
3. Rutas y montajes: puedes añadir líneas en `client/src/App.tsx`,
   `client/src/components/shell/nav.ts` y `server/src/index.ts`, pero SOLO
   líneas nuevas (import + una línea de Route/mount/nav) y en el bloque marcado
   `// ── OPERACIÓN 2026-08 ──` al final de cada lista. Nunca reordenes.
4. Archivos compartidos que puedes tocar con cuidado (adds, no rewrites):
   `server/src/services/permissions.ts` (añadir módulos/roles en las listas),
   `server/src/lib/tenant-guard.ts` (solo si el censo lo exige).
5. Todo lo demás de tu módulo es tuyo: `server/src/routes/<x>.ts`,
   `server/src/services/<x>*.ts`, `client/src/pages/<X>.tsx`,
   `client/src/components/<x>/…`, `server/src/tests/<x>*.test.ts`.

## Calidad
- TDD: cada regla de negocio nueva tiene un test `server/src/tests/<x>.test.ts`
  (estilo tsx + node:assert; script `test:<x>` en `server/package.json`).
- `npx tsc --noEmit -p .` limpio en `server/` y en `client/` antes de cada commit.
- Multi-tenant: TODO where lleva `tenantId` (guard estricto en prod). Cross-tenant
  deliberado → `sinGuardaDeTenant`.
- Cliente: si el recurso lo soporta, acepta y persiste `clienteId` y filtra por
  él cuando venga en query (`?clienteId=`). El selector global vive en
  `localStorage['aduanai_cliente']` y `api-core` lo manda como header
  `X-Cliente-Id`; en server léelo con `clienteIdDe(req)` de
  `server/src/lib/cliente-contexto.ts`.
- PDF = vista imprimible con print CSS + folio (patrón de Pre-Glosa), sin librerías.
- Excel = `xlsx` en server (endpoints `/export.xlsx`, `/import` multipart o base64).
- Nada de datos legales inventados: donde falte fuente oficial, estructura +
  pipeline + etiqueta "pendiente de fuente oficial" visible en UI.
- Sin `console.log` en producción; usa `logger`.
- Cada pantalla nueva: sin datos falsos, estado vacío honesto, errores visibles.

## Estado persistente y ayuda (Ola 3 lo aplica, pero facilita)
- Mantén el estado del formulario principal en UN objeto (`form`) con
  `useState`; Ola 3 lo cambiará por `useEstadoPersistente('<ruta>', inicial)`.
- Exporta desde tu página un `const GUIA_MODULO = { titulo, pasos: string[] }`
  para el botón "?".

## Entrega
- Commits pequeños en español con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Reporte final: rama, commits, tests (salida resumida), rutas/montajes
  añadidos, SCHEMA REQUERIDO (si aplica), lo que NO cerraste y por qué.
- No hagas push. No toques prod.
