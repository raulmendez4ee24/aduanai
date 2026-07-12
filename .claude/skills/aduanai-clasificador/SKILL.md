---
name: aduanai-clasificador
description: Use when working on the ADUANAI classifier - measuring accuracy, editing the classifier prompt or retrieval, touching the vocab bridge dictionary, the numeric/structural prechecks, or the accuracy test set. Also when tempted to add product-specific rules or when a fraction seems wrong in the catalog.
---

# Clasificador ADUANAI — reglas de trabajo

## Regla de oro
Prohibida cualquier regla (prompt, código o dato) que nombre productos/casos del accuracy set. Solo mecanismos generales: parsers, diccionarios verificados, criterios estructurales. El overfitting invalida la medición.

## Candados (NUNCA aflojar)
- `enforceCatalogFraction` (classifier.ts): todo código que sale debe existir activo en el catálogo `Fraction` — falla cerrada.
- Regla simétrica específica/residual en el prompt.
- Tests: `classifier-candado.test.ts` debe pasar tras CUALQUIER cambio.

## Medición de accuracy
```sh
cd server && npx tsx src/tests/accuracy-direct-runner.ts 2   # 99 casos, temp 0, ~90 min, ~$7 API
```
- Resultado en `/tmp/accuracy-v2-*.json`; línea base oficial en `src/tests/baseline-*.json`.
- Compara SIEMPRE con matriz de movimiento (ganados/perdidos por id), no solo el %.
- Estabilidad entre corridas ~97%: ±3 casos son ruido; dos corridas con la misma firma = regresión real.
- No iterar a ciegas contra el set; una medición por tanda de cambios.

## Estado al cierre de la ola v2 (2026-07-12)
- ACTIVO: pre-check numérico (`lib/numeric-precheck.ts`) en modo **solo-exclusiones** (A1). CUMPLE se computa pero NO se inyecta.
- APAGADOS (código presente, sin conectar al prompt/retrieval): `lib/vocab-bridge.ts` (diccionario anclado) y `lib/structural-precheck.ts` — su integración no cumplió criterios de cierre (artefactos `medicion-*.json` en tests/).
- Línea base oficial vigente: `baseline-v2.2-temp0-2026-07-04.json` (61.6%).

## Lecciones medidas (2026-07)
- Un HECHO "CUMPLE" inyectado al prompt **atrae** al modelo hacia esa fracción aunque sea de otro capítulo — si se inyectan hechos, solo exclusiones (NO_CUMPLE). Ver commit `49866ec` y la matriz de `medicion-etapas0-3-2026-07-11.json`.
- Expansiones de vocabulario sin ancla de heading arrastran capítulos equivocados; incluso ancladas no movieron el número. Antes de reconectar `vocab-bridge`, correr `npx tsx src/tests/vocab-bridge-verify.ts`.
- Los residuales "Los demás." son opacos para el modelo — palanca de la siguiente ola en `docs/DEFERRED_WORK.md` #19 (freno en diseño).
- Corridas con `Request timed out` o error de crédito NO son mediciones — descártalas por completo (no promediar con casos válidos).
- Si una fracción del catálogo parece mal (p. ej. dos fracciones describiendo lo mismo): puede ser residuo del seed legacy `tigie-data.ts` que el seed de la Base Única no sobrescribió. Cotejar contra fuente antes de tocar; smartphones = 8517.13.01 (caso resuelto, DEFERRED #18).
