# Censo de discrepancias LLM↔canon — Fase 1a (Frontera Canónica)

**Fecha:** 2026-08-18 · **Artefacto:** `server/src/tests/discrepancias-1a-2026-08-18.json` · **Runner:** `discrepancias-1a-runner.ts` (in-process, temp 0, concurrencia 2, prompt INTACTO, checkpoint por caso)
**Set:** `accuracy-test-data.ts` completo (100 casos). **Corrida válida:** 100/100 con respuesta del modelo — 86 clasificados, 14 fallas cerradas honestas (candado / SIN_CANDIDATO / entrada insuficiente).
**NO es medición de accuracy:** la reconciliación no toca `fraction.code` por construcción; no hay delta top-1 que declarar y el baseline 61.6% queda intacto.

**Incidencias (regla de medición resiliente):** 3 lanzamientos — #1 cayó por detector incompleto de falla-cerrada (la familia "descripción insuficiente" no estaba en los regex; corregido), #2 cayó por error de red real en el caso 76 tras 3 reintentos (backoff endurecido a 5×15s), #3 completó reanudando del checkpoint. Cero casos repetidos con parámetros distintos.

## Resultados por campo (86 clasificados)

| Campo | Casos con discrepancia | % | Naturaleza dominante |
|---|---:|---:|---|
| `tariffs.preferential` | 86 | **100%** | El LLM emite tratados que el catálogo no rastrea (TLC Chile/Colombia/Perú, "TLCAN_legacy") y tasas sin respaldo. TODO se descartaba siempre. |
| `nico` | 84 | **97.7%** | 75: el LLM propone 01/03/06… y el catálogo cargado solo registra `00` (tabla NICO del extracto INCOMPLETA: `nicos[]` vacío en 8,256 filas, `nico` único en 8,183). 9: fracción sin NICO en catálogo. |
| `regulations.noms` | 82 | **95.3%** | El LLM lista NOMs (a veces con versión MÁS RECIENTE: NOM-004-SE-**2021** vs la **2006** de la tabla) — evidencia de que `FractionRegulation` está desactualizada. |
| `alternatives[].description` | 81 | 94.2% | Descripciones parafraseadas del LLM → sustituidas por las del catálogo. |
| `fraction.description` | 33 | 38.4% | La canónica es el texto crudo de la fila ("De algodón.", "Hechos totalmente a mano.") — legalmente el del catálogo, pero SIN contexto jerárquico (gap conocido: textos de partida/subpartida). |
| `regulations.rrna` | 33 | 38.4% | El LLM emitía avisos tipo consejo (SENASICA, avisos automáticos) sin respaldo en tablas (solo 2 filas RRNA cargadas). |
| `regulations.sectoralRegistry` | 29 | 33.7% | El LLM decía `false` donde el padrón SÍ es requerido — confirma que la derivación canónica previa era necesaria (ya estaba en la ruta pre-1a). |
| `tariffs.nmf` | 18 | **20.9%** | Contradicciones reales de arancel (LLM 25 vs catálogo 35; LLM 45 vs 25). **1 de cada 5 expedientes mostraba una tasa NMF equivocada.** |
| `alternatives[].code` | 3 | 3.5% | Alternativas fantasma ("8517.13.XX", "SIN_CANDIDATO") — ahora eliminadas. |

## Lectura

1. **El hallazgo (a) de la radiografía queda medido:** el 100% de los expedientes contenía al menos un dato legal del LLM que el catálogo contradice o no respalda. El más grave es `tariffs.nmf` (20.9% de tasas erróneas mostradas como dato).
2. **La reconciliación descarta ~todo lo que el LLM decía en preferenciales/NICO/NOMs/RRNA.** Pedirle esos campos es pagar tokens por datos que se tiran: **la Fase 1b está fuertemente justificada** para `tariffs`, `regulations` y (condicionado) `nico`.
3. **Tres huecos de datos canónicos que el censo expuso** (la frontera los hace visibles, no los crea):
   - **NICO:** cargar la tabla NICO completa de la Base Única (hoy casi todo `00`). Hasta entonces, la sustitución NICO fuerza `00` y borra la sugerencia del LLM.
   - **NOMs/RRNA (`FractionRegulation`):** filas con versiones posiblemente supersedidas → el registro de autoridad se degradó a `sin_verificar` con nota (decisión de este censo, reversible por Raúl); necesita cotejo Anexo 2.4.1 con `fechaCotejo` por fila.
   - **Descripciones:** 38.4% muestran texto-fragmento del catálogo; falta componer contexto jerárquico (textos padre TIGIE, pendiente conocido).

## Clases de cambio visibles al usuario (1a)

- **Corrección visible (mejora):** NMF ahora siempre del catálogo (antes 20.9% erróneo); alternativas fantasma desaparecen; sellos verdes reales en fracción/tarifas (cierra el GAP documentado en `Classifier.tsx`).
- **Pérdida visible (honesta):** tratados no rastreados desaparecen de preferenciales; los "consejos" RRNA sin respaldo desaparecen (las alertas defensivas canónicas siguen); NICO cambia a `00`/lista canónica en la mayoría de los casos.
- **Cambio de texto:** 38.4% de descripciones pasan al texto crudo del catálogo (a veces críptico) — evaluar presentación compuesta antes de 1c.
- **Confianza:** deja de ser número prominente; queda como detalle técnico "no calibrada" (precisión de aprobación #2; aplicado también a la demo pública).

## Estado y siguiente decisión

1a implementada, suite 10/10 (`npm run test:frontera`), commits locales en `main` SIN push (deploy de 1a pendiente de orden). **1b (recortar el JSON del prompt) requiere:** decisión sobre los 3 huecos de datos + re-medición con el harness oficial (gate: sin regresión top-1 vs 61.6%).
