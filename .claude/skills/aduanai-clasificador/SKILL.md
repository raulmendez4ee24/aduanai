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

## Lecciones medidas (2026-07)
- Un HECHO "CUMPLE" inyectado al prompt **atrae** al modelo hacia esa fracción aunque sea de otro capítulo — solo se inyectan exclusiones (NO_CUMPLE). Ver commit `49866ec`.
- Expansiones de vocabulario sin ancla de heading arrastran capítulos equivocados: cada entrada de `lib/vocab-bridge.ts` lleva `headings` de su evidencia; verificar con `npx tsx src/tests/vocab-bridge-verify.ts` (falla si una entrada pierde sustento).
- Los residuales "Los demás." son opacos para el modelo — palanca de la siguiente ola en `docs/DEFERRED_WORK.md` #19 (freno en diseño).
- Si una fracción del catálogo parece mal (p. ej. dos fracciones describiendo lo mismo): puede ser residuo del seed legacy `tigie-data.ts` que el seed de la Base Única no sobrescribió. Cotejar contra fuente antes de tocar; smartphones = 8517.13.01 (caso resuelto, DEFERRED #18).
