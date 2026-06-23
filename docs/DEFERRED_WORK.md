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

## 3) WhatsApp formatter no muestra cuota compensatoria ni alertas

**Descubierto en el smoke test post-fix (2026-06-21):** `formatQuoteForWhatsApp`
en `server/src/services/whatsapp.ts:112-141` solo imprime IGI, DTA, IEPS,
IVA y Prevalidación. **No itera `result.alertas` ni muestra la línea de
cuota compensatoria** cuando aplica.

**Por qué importa ahora**: el fix del bug específico de cuotas (commit
`d2627fe`) hace que el quoter legacy emita un alerta tipo
`🚨 CÁLCULO INCOMPLETO: cuota specific_USD_kg... declara weightKg` cuando
el usuario manda `cotizar 73181505 25000 China` sin peso. Hoy esa alerta
se pierde — el usuario recibe el quote SIN saber que falta declarar peso
para que la cuota se calcule. Riesgo: aceptan el quote pensando que está
completo, y al declarar pedimento les cae multa Art. 178 LA.

**Fix sugerido** (lugar: `whatsapp.ts:127` después de Prevalidación):

```ts
// Cuota compensatoria — mostrar línea cuando aplica
if (result.breakdown.countervailingDuty && result.breakdown.countervailingDuty.amount > 0) {
  const cv = result.breakdown.countervailingDuty;
  msg += `🚨 *Cuota compensatoria:* ${fmt(cv.amount)}\n`;
}
msg += `• Prevalidación: ${fmt(result.breakdown.prevalidation)}\n\n`;

// Alertas críticas (cálculo incompleto, padrones, etc.)
if (result.alertas?.length > 0) {
  msg += `⚠️ *Alertas:*\n`;
  for (const a of result.alertas) {
    msg += `${a}\n`;
  }
  msg += `\n`;
}
```

Verificación: después del cambio, el reply al `cotizar 73181505 25000 China`
(sin peso) debe incluir el texto `CÁLCULO INCOMPLETO` o `declara weightKg`.

---

## 4) Pendientes menores del code review (no bloqueantes hoy)

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

## 5) Versionado de tasas para auditoría retroactiva

El schema tiene `effectiveDate`/`expiryDate` en `AntidumpingDuty`, pero
ningún query usa esos campos para reconstruir "qué tasa aplicaba el día X".
Si SAT pide glosa retroactiva, no podemos demostrar qué tasa estuvo vigente
en una fecha concreta — solo lo que está activo *hoy*.

**Fix sugerido:** historial inmutable (`AntidumpingRateHistory`) con
`fromDate`, `toDate`, `rate`, `rateType`. Las cotizaciones guardan el
`rateHistoryId` específico, no solo el monto.

---

## 6) [ALTA PRIORIDAD] Cobertura completa de los 16 sectores del Anexo 10 por fracción

Hoy solo hay reglas `padron_sectorial` para 5 grupos de mercancía (siderúrgico
72/73, calzado 64, cigarros 24, alcohol etílico 2207) por **prefijo de capítulo**.
Faltan TODOS los demás sectores del Anexo 10 (textil 11, químicos 1, automotriz 16,
armas 4-8, etc.) y la granularidad es por capítulo, no por fracción.

**Impacto:** un IMMEX textil / químico / automotriz NO ve su padrón sectorial en
el sistema → riesgo de declarar sin inscripción y que le rebote el pedimento.

**Fix:** cargar la cobertura completa de los 16 sectores con las **listas oficiales
de fracciones** del Anexo 10 / Acuerdos respectivos (no por capítulo, por fracción).

## 7) Precisión del split Sector 14 (Siderúrgico) vs 15 (Productos siderúrgicos)

El remapeo del 2026-06-23 aproximó cap. 72 → Sector 14 y cap. 73 → Sector 15. El
Anexo 10 separa estos dos sectores por **fracciones específicas**, no por capítulo
completo.

**Fix:** obtener las listas de fracciones del Acuerdo que define 14 y 15 y reasignar
con precisión (algunas de 73 pueden ser 14 y viceversa).

## 8) Sector correcto para licores terminados (partida 2208)

En el remapeo del 2026-06-23 se QUITÓ la regla de 2208 (aguardientes/licores) del
Sector 12 "Alcohol etílico" porque alcohol etílico ≠ licores terminados. Falta
verificar contra el Anexo 10 a qué sector (si alguno) pertenecen los licores de 2208
y volver a cargarlo. No quedó ningún sector asignado a 2208 por ahora.

## 9) PROSEC ≠ Padrón Sectorial Anexo 10 — revisar el flag `sectoralRegistry`

880 fracciones tienen `Fraction.sectoralRegistry=true`, derivado de columnas **PROSEC**
de la BASEUNICA-LIGIE (programa de promoción sectorial), NO del Padrón Sectorial del
Anexo 10. Son dos cosas distintas y hoy están conflacionadas.

**Fix:** separar PROSEC de Padrón Sectorial; decidir si `sectoralRegistry` debe reflejar
Anexo 10 (y entonces recalcularlo) o PROSEC (y renombrar el campo para no confundir).

---

## Notas de proceso

- Eval de retrieval y snapshot de `reseed-upci` se acordaron diferir
  explícitamente con el cliente en la sesión del 2026-06-21.
- El bug CRITICAL en `quoter.ts:175` + propagación de `declaredQuantity`
  desde el Classifier UI + fail-closed de `lookupCompliance` + disclaimer
  de banner + tests de regresión SÍ se cerraron en esa sesión.
- Antes de tocar cualquier item de este documento, leer los commits
  asociados al incidente (`git log --grep="antidumping\|cuotas"`).
