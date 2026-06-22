# Trabajo diferido — Incidente cuotas compensatorias

Notas creadas el 2026-06-21 durante el cierre del fix de cuotas compensatorias
antidumping (commits `753e5a0`, `80ab8a7` + cierre de regresión). Lo que sigue
abajo NO bloquea el cierre del incidente, pero debe atenderse en una sesión
dedicada antes de declarar la plataforma "production-grade" para el módulo
de compliance fiscal.

---

## 1) Eval formal de retrieval contra el corpus legal (42 docs)

**Estado actual:** El retrieval ya tiene rerank con Claude Haiku
(`server/src/services/rag-search.ts:rerankWithLLM`, top-12 → top-K con
threshold 55/100). Lo único que falta es medirlo: hoy no hay métricas de
recall/MRR/NDCG sobre el corpus de `LegalDocument`.

**Antes de ampliar el corpus (Firecrawl u otro scraper):**

1. Construir 15–20 golden queries reales de clientes (textil/electrónica/
   antidumping/IMMEX/origen). Usar como base las plantillas ya identificadas
   en `server/src/services/copilot.ts` y el set de productos en
   `server/src/tests/accuracy-test-data.ts`.
2. Por cada query, anotar el "doc ideal" esperado (id de LegalDocument).
3. Correr `searchLegalDocuments(q, { topK: 12, hardFilter: true })` y medir
   recall@5 y recall@12 antes del rerank.
4. Correr `smartRetrieval(q)` y medir lo mismo post-rerank, más gate rate
   (`shouldRespond=false` vs `true`).
5. Decisión:
   - recall@12 < 80% → corpus o chunking insuficiente; ampliar (Firecrawl).
   - recall@12 ≥ 80% y rerank descarta gold doc → ajustar threshold/prompt
     de `rerankWithLLM` antes de tocar el corpus.
   - Si ambos limpios → ampliar tiene ROI claro.

**Output esperado:** `server/src/tests/retrieval-quality.ts` + reporte
en `test-results/retrieval-report.json` análogo a `accuracy-report.json`.

---

## 2) Snapshot + rollback seguro para `reseed-upci`

**Riesgo actual:** `server/src/services/antidumping-upci.ts:reseed` hace
`prisma.antidumpingDuty.deleteMany()` antes de insertar el nuevo set. Si
el seed nuevo viene corrupto o el insert falla a la mitad, **se queda sin
cuotas en producción** y todo el sistema cotiza sin cuota (después del
fail-closed actual: lanza error en `lookupCompliance`, lo cual es mejor
que cotizar mal, pero rompe operación 100%).

**Antes del próximo deploy con cambios en antidumping:**

1. Antes del `deleteMany`, hacer snapshot a una tabla `AntidumpingDutyArchive`
   con timestamp y motivo (`reseed`, `manual`, etc.).
2. Si el insert posterior falla, restaurar automáticamente del snapshot.
3. Exponer endpoint admin `POST /admin/antidumping/restore-snapshot/:date`
   para rollback manual.
4. Schema sugerido:
   ```prisma
   model AntidumpingDutyArchive {
     id              String   @id @default(cuid())
     archivedAt      DateTime @default(now())
     archiveReason   String
     originalId      String
     // … resto idéntico a AntidumpingDuty
   }
   ```

**Sin esto, cualquier `reseed-upci` mal validado es un incidente de prod.**

---

## 3) Pendientes menores del code review (no bloqueantes hoy)

Estos los identificó `oh-my-claudecode:code-reviewer` y NO entraron en el
cierre del incidente porque están fuera del scope CRITICAL. Atender cuando
se toque el código aledaño:

- **HIGH** `classifier-alerts.ts:84` — `declaredQuantity * rate` para
  `specific_USD_kg` no valida que la unidad declarada sea kg. Si el cliente
  declara "500 piezas", el banner muestra `500 × $2.07 = $1,035 USD` como
  si fuera peso. Fix: agregar `declaredUnit` al input del builder y solo
  calcular cuando coincide con `rateType`.
- **MEDIUM** `quoter-multi.ts:~378` — multa Art. 178 LA usa multiplicador
  fijo `* 1.4` mientras `classifier-alerts.ts` muestra rango 130–150%.
  Exponer `min`/`max` en el quoter para consistencia visual.
- **MEDIUM** `antidumping.ts:91-104` — match por prefijo de partida
  (4 dígitos, `startsWith`) aplica monto de cuota sin distinguir
  fracciones hermanas. Para prefix-match, NO aplicar el monto: solo
  advertir + requerir confirmación manual.
- **MEDIUM** `prevalidator-v2.ts:303` — comentario menciona aceptar
  identificador `GA`, pero el código solo chequea `CC`/`EE`. Agregar `GA`
  o quitar el comentario.

---

## 4) Versionado de tasas para auditoría retroactiva

El schema tiene `effectiveDate`/`expiryDate` en `AntidumpingDuty`, pero
ningún query usa esos campos para reconstruir "qué tasa aplicaba el día X".
Si SAT pide glosa retroactiva, no podemos demostrar qué tasa estuvo vigente
en una fecha concreta — solo lo que está activo *hoy*.

**Fix sugerido:** historial inmutable (`AntidumpingRateHistory`) con
`fromDate`, `toDate`, `rate`, `rateType`. Las cotizaciones guardan el
`rateHistoryId` específico, no solo el monto.

---

## Notas de proceso

- Eval de retrieval y snapshot de `reseed-upci` se acordaron diferir
  explícitamente con el cliente en la sesión del 2026-06-21.
- El bug CRITICAL en `quoter.ts:175` + propagación de `declaredQuantity`
  desde el Classifier UI + fail-closed de `lookupCompliance` + disclaimer
  de banner + tests de regresión SÍ se cerraron en esa sesión.
- Antes de tocar cualquier item de este documento, leer los commits
  asociados al incidente (`git log --grep="antidumping\|cuotas"`).
