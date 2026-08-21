# Radar de pedimentos — UI v1 (Fase 1.5)

**Estado: IMPLEMENTADO 2026-08-13** (brainstorming con el usuario; decisiones registradas abajo; adición "criterios actualizados" solicitada por el usuario el mismo día).
Backend ya existente y estable: `POST /api/pedimentos/radar` (Fase 1.3, commit d6ca0ba), flag beta `PEDIMENTO_READER_ENABLED` apagado en prod. Cambios de servidor: **solo un endpoint de lectura** para "criterios actualizados" (abajo); el parser y el motor no se tocan.

## Decisiones de alcance (del brainstorming)

1. **Propósito**: ambas cosas, empezando por demo — v1 optimizada para enseñarse en una llamada (subes archivo M → semáforo del lote), con estructura lista para crecer a herramienta diaria.
2. **Ubicación**: página nueva `/radar` ("Radar de pedimentos"), entrada de menú propia con badge **BETA**.
3. **`declarado`**: NO va en v1. Se evalúa solo con lo que el archivo prueba; el tri-estado queda sin declarar (el escudo refleja únicamente evidencia verificable). Panel declarado = v1.1.
4. **Drill-down**: fila expandible (hallazgos completos + banderas + proveniencia campo por campo). Sin página de detalle por partida en v1.

## Flujo y estados de la página

`client/src/pages/RadarPedimentos.tsx`, ruta `/radar` dentro del Layout autenticado.

### Estado 1 — Carga
- Dropzone: arrastrar o seleccionar archivo (`.txt` SAAI M, pipe-delimited). Lectura client-side como texto (`FileReader`); validación local: no vacío, ≤2 MB (límite del endpoint), nombre ≤64 chars.
- Selector discreto `tipoSujeto`: `agente` (default) / `agencia` — afecta el checklist del motor.
- Texto de apoyo honesto: qué es un archivo M, y que el agente está obligado a entregarlo sin cargo (LA 162-VII) — palanca real de adquisición del dato.

### Estado 2 — Evaluando
- Indicador de progreso simple (sin porcentajes inventados).

### Estado 3 — Resultado
1. **Banner beta**: renderiza `avisoValidacion` del server verbatim + `layoutVersion`.
2. **Resumen del lote**:
   - Conteo por banda (VERDE / AMARILLO / NARANJA / ROJO / ROJO_CRÍTICO) — tarjetas con los colores de banda ya usados en `/risk-scorer`.
   - **Hallazgos destacados** arriba, en rojo: `FRACCION_INEXISTENTE`, `LISTADO_69B`, `CUOTA_ACTIVA` con pedimento+partida y mensaje del server.
   - Colapsable **"Transparencia del parseo"**: pedimentos excluidos (con motivo), `registrosIgnorados` (conteo por tipo), `advertenciasIntegridad`. Nada se oculta ni se resume en silencio.
3. **Tabla radar** (orden del server = severidad desc): pedimento (15 con espacios), partida, fracción+NICO, descripción (truncada por el server a 80), valor USD, exposición, escudo %, chip de banda.
   - **Fila expandible**: hallazgos completos (destacados resaltados), banderas, y proveniencia en mono compacto (`registro.campo@línea` por dato + `origenDatos`).
   - Contenedor con `overflow-x: auto` (la página nunca scrollea horizontal).
4. Botón "Evaluar otro archivo" (reset al estado 1).

### Estado 4 — Errores (tratados como feature, no como falla genérica)
- **422 fail-closed**: título "El archivo no coincide con el layout VOCE-SAAI M3 v9.0", lista de `detalles` línea por línea, `layoutVersion`, y referencia al documento oficial (Lineamientos Técnicos VUCEM). Sin extracción parcial — se explica por qué.
- **403**: "Lector de pedimentos deshabilitado (beta)".
- **413**: lote excede 200 partidas por solicitud.
- **400 / red**: mensaje estándar con reintento.

## Capa API (`client/src/lib/api.ts`)

Siguiendo el patrón existente (cero fetch crudo en componentes):
- Tipos nuevos: `RadarHallazgo`, `RadarFila`, `RadarResumen`, `RadarResponse` — espejo del JSON del endpoint (incluye `beta`, `avisoValidacion`, `layoutVersion`, `data.archivo`, `data.resumen`, `data.radar`).
- Método: `api.pedimentosRadar(nombreArchivo: string, contenido: string, tipoSujeto: 'agente' | 'agencia')`.
- El 422 llega con shape distinto (`{status:'error', message, detalles, layoutVersion}`): el helper lo tipa y el componente lo distingue por código HTTP.

## Sistema visual

- **Sistema Sello** (tokens/componentes de `client/src/components/ui/`, spec `docs/DESIGN_SYSTEM.md`): papel+tinta, sin sombras/glass.
- `RiskScorer.tsx` usa el estilo glass anterior — **no se toca en esta fase**; el radar nace en Sello. La paleta semántica de bandas se mantiene consistente con la existente.

## Criterios actualizados — "regulación en vivo" (adición aprobada 2026-08-12)

Requisito del usuario: que el agente aduanal **vea** que el radar sigue la regulación al día — es argumento de venta, no nota de commit.

- **Server**: `GET /api/risk/criterios` (autenticado, junto a `/api/risk/weights`): devuelve `RULES_VERSION` + las vigencias estructuradas de `vigencias.ts` (hoy solo `PRORROGA_E2`: instrumento, versión, estado VERSION_ANTICIPADA/PUBLICADA_DOF, fechas, `prorrogaHasta`, `fechaCotejo`, `urlOficial`). **Fuente única = `vigencias.ts`** — el panel jamás puede divergir de lo que el motor aplica, porque lee el mismo objeto.
- **Cliente**: tarjeta/panel "Criterios actualizados" visible en `/radar` (junto al banner beta), con lenguaje humano: "Prórroga MVE vigente hasta 30-sep-2026 — 2a RM RGCE 2026, 3a versión anticipada (Portal SAT 31-jul-2026) · cotejado 12-ago-2026" + link a la fuente oficial. Si `estado = VERSION_ANTICIPADA` se dice tal cual (pendiente de DOF) — honestidad ante todo.
- El shape es una **lista** de criterios para crecer (TLCUEM, decretos, etc.) sin rediseño.

## Fuera de alcance v1 (anotado para v1.1)

- Panel `declarado` (contexto del expediente).
- Exportar (PDF/CSV).
- Vista de detalle por partida con factores/checklist tipo `/risk-scorer`.
- Historial de lotes en UI (los assessments ya se persisten server-side con `_lote`; un historial futuro los lee, no requiere cambios ahora).

## Verificación

- `tsc` cliente 0 errores; `npm run build` cliente OK (**Node 22** — Node 18 rompe Vite 8).
- Prueba manual contra server local con `PEDIMENTO_READER_ENABLED=true`: los 3 fixtures sintéticos del server (limpio / medio / crítico) deben renderizar VERDE / AMARILLO+ROJO / ROJO_CRÍTICO con sus hallazgos destacados, y un archivo corrupto debe mostrar el estado 422 con detalles.
- El aviso beta y la advertencia "validación con archivos reales PENDIENTE" son visibles en todo resultado.

## Adenda — Fase A (aprobada por Raúl 2026-08-21, rama `feat/radar-ui-v1-fase-a`)

Confirmado sin cambios: fila por partida con orden por severidad del server
(la UI no reordena), agrupación visual por pedimento a v1.1, fila expandible
sin página por partida, proveniencia `registro.campo@línea` + `origenDatos` en
mono solo dentro de la fila expandida, 422 sin extracción parcial con
`detalles` línea por línea + `layoutVersion` + link a Lineamientos VUCEM.

Tres correcciones aplicadas:
1. **Vocabulario único.** El estado interno `noConfirmado` puntúa (fail-safe,
   mismo principio que F1-VAL-02 sin fecha). La etiqueta es la que ya emite
   el Risk Scorer para un factor declarativo: el motor manda
   `origenEfectivo: 'declarado'` y la UI pinta **"DECLARADO POR USUARIO"** —
   `components/OrigenBadge.tsx` es compartido por `/risk-scorer` y `/radar`,
   así la cadena es idéntica por construcción. Sin tercer término. La fila
   expandida lista "Factores que suman exposición" (`reglasActivas`, solo
   puntos > 0, con su badge). La UI del radar no contiene la palabra
   "cumple" como estado (test `test:radar-fase-a`).
2. **`/radar/:loteId`.** El POST genera un `loteId` y cada `RiskAssessment`
   lo lleva en `input._lote` junto con el snapshot de su fila y la meta del
   lote (archivo, excluidos, ignorados, advertencias). `GET
   /api/pedimentos/radar/:loteId` reconstruye la misma respuesta (banda /
   exposición / escudo desde las columnas; 404 para lote inexistente o de
   otro tenant). Tras evaluar, la UI navega a `/radar/:loteId` (replace); un
   refresh recupera la pantalla ("recuperado de lo persistido"). Sin
   historial (v1.1).
3. **413.** Límite = `DEFAULT_MAX_PARTIDAS_LOTE` (200) configurable por
   `RADAR_MAX_PARTIDAS`; el mensaje declara límite y partidas del archivo
   (`limite`, `partidas` en el JSON). Toda pantalla de error (422/413/404/red)
   lleva "Cargar otro archivo" — pantalla completa, nunca callejón sin salida.

Corrección de coherencia encontrada en la verificación: el radar no pasaba
`fechaEvaluacion` al motor (sí lo hace `/api/risk/assess`), por lo que la MVE
puntuaba +8 dentro de la prórroga mientras la tarjeta "Criterios actualizados"
de la misma pantalla decía lo contrario. Ahora evalúa con la fecha del día.

Verificado de verdad (server local + Vite, 21-ago): POST 200 → GET por lote
idéntico campo por campo → 404 con id ajeno; 422 con el registro 551 mutilado
("esperados 26 campos, encontrados 25"); 413 con el fixture de 2 partidas y
`RADAR_MAX_PARTIDAS=1`; refresh en `/radar/:loteId` conserva la pantalla.
