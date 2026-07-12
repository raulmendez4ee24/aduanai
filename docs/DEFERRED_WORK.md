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

# Trabajo diferido — Fase 1b Clasificador (2026-07-01)

Hallazgos de la paridad bidireccional del fix anti-.99 (Fase 1b). Contexto:
commits `4990a2a` (candado `enforceCatalogFraction`) y el commit de la
reformulación de prompts. Ninguno bloquea el cierre de la Fase 1b.

## 10) Casos del accuracy set con línea base ROTA (pre-existentes, NO regresiones)

Verificado con el prompt VIEJO (A/B con stash, 2026-07-01) — ya fallaban antes
de cualquier cambio de la Fase 1b:

- **Caso 52** "Compresor de aire de tornillo rotativo, 100 HP" → esperado
  `84143001`, ambos prompts dan `8414.40.02` ("capacidad superior a 31.5 m³/min"
  — dudoso también en lo técnico: ~100 HP ≈ 12–15 m³/min). Revisar si el
  expectedFraction del accuracy set es correcto ANTES de culpar al clasificador.
- **Caso 13** "Televisor LED 55'' 4K Smart TV" → esperado `85287201`, prompt
  viejo da `8528.72.06`. Misma clase de problema (variante específica de la
  misma subpartida).

**Fix propuesto:** correr el accuracy-runner completo (159 casos) para separar
expectativas incorrectas del set vs errores reales del clasificador; cotejar
los expectedFraction dudosos contra la Base Única/SNICE.

## 11) Limitación documentada: criterios de material/dimensión no se aplican
## de forma confiable vía prompt (casos inox → .01 y 4mm → .04)

Con la reformulación condicional anti-.99 (Fase 1b), en 2 corridas ×2:
- "Tornillo acero inoxidable M10x40" NO llega a `.01` (da `.99` válido-pero-
  genérico, o el LLM emite `7318.15` truncado y el candado falla cerrado).
  OJO: con el prompt viejo este caso SÍ salía `.01` — el prompt viejo lo
  acertaba por su sesgo pro-.01, no por razonamiento; el trade-off se aceptó
  para matar el falso-específico del M8 (dirección de error menos dañina:
  residual genérica > específica falsa).
- "Tornillo 4mm × 30mm" NO llega a `.04` aunque cumple los umbrales numéricos
  (<6.4mm y <50.8mm) — ni siquiera con la REGLA DIMENSIONAL explícita añadida.
  Tope de iteración de prompt alcanzado por decisión del 2026-07-01.

**Fix propuesto (Fase 1c, aprobación pendiente): pre-check determinista.**
En código, no en prompt: (1) extraer atributos estructurados de la descripción
(material, diámetro, longitud, capacidad) con regex/parser ligero; (2) parsear
umbrales numéricos y materiales de las descripciones de las fracciones
candidatas del subheading; (3) resolver la comparación EN CÓDIGO
(ej. `4 < 6.4 ∧ 30 < 50.8 → 73181504 CUMPLE`; `material=carbono ≠ inoxidable →
73181501 NO CUMPLE`); (4) inyectar el veredicto ya resuelto al prompt como
hechos, no como tarea. El LLM elige entre opciones pre-filtradas en vez de
hacer aritmética. Cubre AMBOS casos (2 y 3) y reduce la varianza.

---

# Trabajo diferido — Fase 2 honestidad de datos (2026-07-01)

## 12) Corpus de precedentes por verificar contra TFJA/SAT reales — hoy sintético, no citable

Las 24 filas de `LegalPrecedent` son citas legales SINTÉTICAS: referencias con
placeholder ("Tesis V-P-2aS-XX/2023"), 0 de 24 con URL de fuente oficial.
Se conservan en BD (desactivar > borrar) pero están APAGADAS para todos los
consumidores vía `PRECEDENT_CORPUS_VERIFIED=false` en
`server/src/services/precedent-lookup.ts` (commit `2a4bb35`): Clasificador
(prompt, result.precedents, litigationAlert) y /api/precedents devuelven vacío.
El módulo Precedentes está oculto del menú (AppLayout, comentado, reversible).

**Fix:** cotejar cada precedente contra TFJA/SCJN/SAT reales (número de tesis
verificable + URL oficial); corregir o eliminar los no verificables; poblar
`source` con URL citable; SOLO entonces flip a `PRECEDENT_CORPUS_VERIFIED=true`
y restaurar el item del menú. No reactivar parcialmente sin cotejo completo.

## 13) Analizador de decretos sin hogar visible

El único componente real del módulo Actualizaciones (`/updates`) es el
analizador de decretos con IA (pega texto de decreto → análisis de impacto).
Las tablas TIGIEUpdate/UpdateNotification tienen 0 filas y NO existe pipeline
de monitoreo DOF (verificado: los setInterval de index.ts son tokens, pilot
lifecycle, retención, thresholds y backups). El módulo quedó oculto del menú;
la página sigue viva por URL directa /updates.

**Fix:** cuando haya hogar natural, mover el analizador de decretos a un lugar
visible — candidato: Biblioteca Legal. Si algún día se construye el pipeline
DOF real, restaurar el item Actualizaciones con datos verdaderos.

---

# Trabajo diferido — Fase 3 Copilot/corpus (2026-07-02)

## 14) Patrón "huérfano por cambio de reference" en el corpus legal

El upsert de `seedLegalDocuments` usa `(source, reference)` como clave. Cuando
una corrección CAMBIA la reference (como el fix de junio: "Regla 7.1.5 RGCE
2026" → "Reglas 7.1.1, 7.1.2 y 7.1.3 RGCE 2026"), el doc corregido se inserta
bajo la clave nueva pero **la fila vieja con el contenido incorrecto queda
huérfana en prod** y el retrieval la sigue sirviendo (así volvió a salir la
cita "Regla 7.1.5" en la batería 3.3, pese a que el seed estaba corregido).
Resuelto para este caso: huérfano desactivado (isActive=false, supersededBy
anotado) el 2026-07-02.

**Regla de proceso:** toda corrección que cambie la `reference` de un doc DEBE
acompañarse de la desactivación del huérfano en prod (isActive=false +
supersededBy), idealmente en el propio seed o script de despliegue.

**Barrido 2026-07-02 de correcciones pasadas seed-vs-BD:** antidumping ✓ (las
19 desactivadas viven en DESACTIVADAS_PENDIENTE_VERIF del seed, delete+recreate),
sectores ✓ (regulations.ts dejó de sembrar padron_sectorial con comentario
explícito), ISAN ✓ (tarifa 2026 cotejada con fuente DOF en regimes-programs.ts).
No se encontraron más bombas de este tipo.

## 15) Vigencia "1/2/3 años por rubro" del registro IVA/IEPS — desactualizada

Cotejo RGCE 2026 (DOF 27-12-2025, regla 7.1.6): el Registro modalidad IVA e
IEPS se otorga con vigencia de UN AÑO renovable para TODOS los rubros (A/AA/
AAA); dos años solo para Comercializadora/OEA/Socio Comercial Certificado. El
esquema "1/2/3 años por rubro" que citaban el corpus y la memoria de junio ya
no está vigente. Corpus corregido 2026-07-02. Si alguna otra parte del producto
(UI, prompts, docs) menciona vigencias 1/2/3 por rubro, corregirla con esta
misma cita.

---

## 16) Criterios SAT sintéticos en el corpus — pendientes de cotejo real

"Criterio Normativo AGA 7/2024" (desactivado 2026-07-04, atribución incorrecta
al Art. 78 LA), "Criterio Normativo AGA 4/2024" (desactivado 2026-07-04) y
"Criterio Normativo AGCE 5/2024" (desactivado 2026-07-05) fueron retirados del
seed y sus filas huérfanas desactivadas (isActive=false) en LOCAL y PROD.
Razón común: referencia NO cotejable contra fuente oficial. Si algún criterio
resulta REAL en el cotejo, se restaura con su texto verbatim y URL oficial.

CORRECCIÓN (2026-07-05): la nota previa afirmaba que el AGCE 5/2024
"contradecía el catálogo" por decir 8517.13 — FALSO. Verificado contra el
catálogo: 8517.13.01 "Teléfonos inteligentes." SÍ existe activa (subpartida
creada por HS 2022). Su desactivación es SOLO por referencia no cotejable.
El hallazgo real derivado es del CATÁLOGO → ver #18.

## 18) Catálogo: smartphones duplicados en dos subpartidas activas — RESUELTO 2026-07-11; queda cotejo primario

RESUELTO (Clasificador v2, Etapa 0, commit 25156e3): la descripción de
8517.14.01 era residuo del seed curado legacy. Canónica de smartphones =
8517.13.01 (subpartida SA 2022 exclusiva). 85171401 corregida a "Teléfonos
celulares (no smartphones)." en seed + DB local + DB prod; keyword
'smartphone' movida a 85171301; caso #12 del set → 85171301 sin dual (no son
espejos); 2 entradas de knowledge-base-v2 reescritas.

PENDIENTE (nuevo alcance de este item): re-verificar el texto de 8517.14.01
contra la Base Única SNICE / fuente primaria cuando esté accesible — el
cotejo del 2026-07-11 fue vía fuente secundaria honesta (ficha Camtom,
vigente 2026) + estructura SA 2022; snice.gob.mx no respondió ese día.

## 17) Cuota activa sobre fracción INEXISTENTE en catálogo (73181505)

AntidumpingDuty tiene una cuota ACTIVA (73181505, CN, 2.07 USD/kg) cuya
fracción NO existe en el catálogo de 8,256 (verificado 2026-07-04 durante la
paridad del Risk Scorer). NO se tocó (regla vigente: tabla intocable hasta la
lista UPCI 2026). Evidencia adicional de que la tabla necesita RECONSTRUCCIÓN
completa con la lista oficial de la UPCI — no parches. El Risk Scorer solo
evalúa cuotas de fracciones válidas, así que esta fila es invisible para el
scoring (falla silenciosa del dato, no del producto).

---

## Notas de proceso

- Eval de retrieval y snapshot de `reseed-upci` se acordaron diferir
  explícitamente con el cliente en la sesión del 2026-06-21.
- El bug CRITICAL en `quoter.ts:175` + propagación de `declaredQuantity`
  desde el Classifier UI + fail-closed de `lookupCompliance` + disclaimer
  de banner + tests de regresión SÍ se cerraron en esa sesión.
- Antes de tocar cualquier item de este documento, leer los commits
  asociados al incidente (`git log --grep="antidumping\|cuotas"`).

## 19) [PALANCA GRANDE — SIGUIENTE OLA] Residuales "Los demás." opacos: inyectar el texto de la partida/subpartida padre

Identificado en la medición del Clasificador v2 (2026-07-11, artefacto
tests/medicion-etapas0-3-2026-07-11.json): las fracciones residuales se
describen solo como "Los demás." y el modelo no sabe "los demás QUÉ" — p. ej.
8704.21.99 no dice que es un vehículo de carga, ni 7219.33.01 que es laminado
plano inoxidable. Ni el diccionario de vocabulario ni los pre-checks pueden
compensarlo (verificado: el término del heading no existe a nivel fracción).
Diseño propuesto para la siguiente ola: inyectar junto a cada candidata el
texto de su partida (4 díg.) y subpartida (6 díg.) — "8704.21.99: Los demás.
[partida 87.04: Vehículos automóviles para transporte de mercancías]" — como
dato del catálogo, no como regla. Requiere: fuente para textos de
partida/subpartida (la tabla Fraction hoy no los almacena), presupuesto de
tokens en el prompt, y medición propia. FRENO ACORDADO: diseño presentado y
aprobado ANTES de implementar. Este es el techo principal del set actual
(~10+ de los 34 fallos restantes son residual-vs-específica con residual
opaca o retrieval que no alcanza la residual).

## 20) Cierre de la ola Clasificador v2 (2026-07-12) — residuales sin explicar

La ola cerró SIN mejorar el número (línea base oficial sigue: 61.6%,
baseline-v2.2). Estado final: E0 (catálogo smartphones) + E1 numérico en modo
solo-exclusiones ACTIVOS; E2 (vocab-bridge) y E3 (estructural) APAGADOS
(código presente, sin conectar). Mediciones: medicion-etapas0-3-2026-07-11
(61.6% plano, +4/−4) y medicion-a1a2-2026-07-12 (56.6% con 6 timeouts de API;
techo teórico 62.6% < meta 63.6%). Regla acordada: no iterar más contra este
set.

Residuales SIN causa confirmada (para la siguiente ola):
- #20 cámara réflex → 90.06 (3 corridas idénticas post-E0/E1: regresión real
  pequeña, mecanismo no identificado; no revirtió con solo-exclusiones).
- #84 tubo soldado → 7304: no era (solo) el CUMPLE numérico; persiste con A1.
  Probable retrieval/orden de candidatas.
- #93 sandalia y #97 reloj: perdidos solo en la última corrida (posible
  inestabilidad; 1 sola observación).
