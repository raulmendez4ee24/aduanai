# CORPUS ÍNTEGRO — Plan Fase 0 (inventario y plan de carga)

**Estado:** BORRADOR PARA APROBACIÓN — cero documentos sembrados hasta que Raúl apruebe.
**Fecha:** 2026-08-19 · **Censo verificado por HTTP el 19-ago-2026** (las 15 URLs → 200).
**Principio rector:** texto VERBATIM de fuente oficial con URL + fecha de cotejo, o no entra. Un corpus grande y sucio es peor que uno chico y honesto.

> **Nota sobre FABLE-PROTOCOL.md:** no existe en ninguno de los dos repos (igual
> que lo documentó la radiografía de julio). Este plan aplica su espíritu operativo
> vigente en el proyecto: diseño → aprobación explícita → ejecución por fases con
> verificación medible y fail-closed. Si el protocolo existe en otro lado, indícalo
> y lo incorporo antes de la Fase 1.

---

## 1. CENSO DE FUENTES (verificado 19-ago-2026)

Todas las leyes de Diputados ofrecen **texto vigente en DOC (Word) además de PDF** —
la extracción verbatim se hace del DOC (estructura de párrafos limpia, sin los
artefactos de layout del PDF), cotejando el conteo de artículos contra el PDF.

| Fuente | URL oficial (verificada 200) | Última reforma DOF | Notas |
|---|---|---|---|
| **Ley Aduanera** | `diputados.gob.mx/LeyesBiblio/pdf/LAdua.pdf` + `doc/LAdua.doc` | **19-nov-2025** (cantidades act. 27-dic-2025) | La reforma nov-2025 es sustantiva — el corpus actual cita versiones previas en algunos resúmenes: cotejar al trocear. |
| **RGCE 2026** | `sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rgce/rgce/ReglasGeneralesComercioExteriorpara2026.pdf` | Publicación DOF **27-dic-2025** | ⚠️ Es la publicación ORIGINAL. La **1a RM (DOF 14-may-2026)** la modifica y NO hay consolidado oficial descargable: hay que compilar base + 1a RM, marcando cada regla modificada con su DOF. La 2a RM sigue SIN publicarse en DOF (DEFERRED #21) — las reglas afectadas se cargan en versión original con nota. Solo PDF (no hay Word del SAT). |
| — Anexo 10 (padrones) | `sat.gob.mx/...DOF_20260114_RGCE-2026_Anexo-10_Fraccion-I.pdf` | DOF 14-ene-2026 | Verificado en radiografía §7.1. |
| — Anexo 22 (llenado pedimento) | DOF `codigo=5778300` (15-ene-2026) | DOF 15-ene-2026 | Ya cotejado en `lib/anexo22.ts`; los apéndices clave (1, 2, 8, 16) entran como docs. |
| — Otros anexos clave (1, 1-A, 21, 24, 27) | por verificar POR LOTE en minisitio SAT/DOF | — | Se verifican al llegar su lote; si un anexo no está descargable de fuente oficial, NO entra (se registra). |
| **LIGIE (2022)** | `diputados.gob.mx/LeyesBiblio/pdf/LIGIE_2022.pdf` + `doc/LIGIE_2022.doc` | **23-abr-2026** | ⚠️ DOS hallazgos: (a) el DOC pesa cientos de MB (contiene la TARIFA completa del Art. 1); del corpus solo entran **Art. 2 (las 6 RGI + complementarias)** y las **Notas legales de sección/capítulo** (SÍ son texto oficial dentro del Art. 1); la tarifa NO entra al corpus RAG (ya vive en `Fraction`). (b) La modificación **23-abr-2026 es POSTERIOR al snapshot del catálogo (30-mar-2026)** — hallazgo colateral: hay que cotejar si tocó fracciones (afecta a `Fraction`, no a este corpus; se registra como pendiente aparte). |
| **LCE** | `pdf/LCE.pdf` + `doc/LCE.doc` | **01-may-2026** | ~98 artículos. |
| **LIVA** | `pdf/LIVA.pdf` + `doc/LIVA.doc` | **12-nov-2021** | ~43 artículos (algunos monstruo). |
| **LIEPS** | `pdf/LIEPS.pdf` + `doc/LIEPS.doc` | **07-nov-2025** (montos act. 22-dic-2025) | ~31 artículos, varios enormes (Art. 2). |
| **LFD** | `pdf/LFD.pdf` + `doc/LFD.doc` | **07-nov-2025** (montos RMF 28-dic-2025) | ⚠️ Ley ENORME (~300+ arts, 62 reformas). **Propuesta de alcance:** solo Título I, Capítulos I-III (derechos aduaneros: DTA, servicios aduaneros, ~30-40 arts). Cargarla completa es ruido para este dominio. Decisión tuya. |
| **Reglamento LA** | `regley/Reg_LAdua.pdf` + `regley/Reg_LAdua.doc` | **23-feb-2026** (reformado) | ~250 artículos. |
| Reglamento LCE | `regley/Reg_LCE.pdf` + `.doc` | 22-may-2014 | Disponible; propongo INCLUIRLO como lote opcional al final (lo usa antidumping/UPCI). |

**NO disponible en fuente oficial descargable (NO entra):**
- **RGCE consolidada con la 1a RM aplicada** — no existe; se compila internamente (ver arriba) con trazabilidad por regla.
- **Notas Explicativas de la TIGIE (NESA/OMA)** — licenciadas, no públicas. NO entran. (Las notas LEGALES de sección/capítulo sí, porque son parte de la LIGIE.)
- **2a RM RGCE 2026** — solo versión anticipada del Portal SAT, sin DOF (DEFERRED #21). No entra hasta DOF.

## 2. PLAN DE TROCEO

**Unidad = un documento por artículo/regla.** Excepciones:
- **Artículos monstruo** (151 LA, 176-178 LA, 2 LIEPS, 2-A LIVA, apéndices Anexo 22): un doc por FRACCIÓN o apartado, con `reference` = "Art. 151, fr. II LA".
- **RGI**: un doc por regla (6 RGI + complementarias) — corrige de raíz que la secuencia RGI viva solo como instrucción de prompt.
- **Notas de sección/capítulo LIGIE**: un doc por sección o capítulo ("Notas del Capítulo 61").
- **Transitorios**: un doc por decreto de reforma relevante (no por transitorio individual).

**Metadatos por documento** (mapeo a `LegalDocument` existente — sin columnas nuevas para esto):

| Campo del plan | Columna existente | Ejemplo |
|---|---|---|
| ley | `source` | "Ley_Aduanera" |
| artículo | `reference` | "Art. 54 LA" (formato EXACTO que parsea `citas-legales.ts` — se valida con `parseReferencia()` en el seed: referencia que no parsea → rechazo del lote) |
| título descriptivo | `title` | "Responsabilidad del agente aduanal por veracidad de datos" (⚠️ el título es lo ÚNICO no-verbatim: descriptor de navegación, NUNCA se presenta como texto legal) |
| fecha reforma | `publishedDate` (DOF de última reforma del artículo o de la ley) + `effectiveDate` | 2025-11-19 |
| URL | `officialUrl` | URL exacta del DOC/PDF de Diputados |
| fechaCotejo | `version` = `"cotejo:2026-08-XX·reforma:2025-11-19"` — **propuesta**: mejor columna nueva `fechaCotejo DateTime` (migración aditiva) para no encodear en string | — |
| verbatim | `content` | texto EXACTO del DOC, espacios normalizados, nada más |

**Estimación de volumen** (a confirmar por lote en extracción; conteos aproximados):

| Lote | Docs estimados |
|---|---:|
| Ley Aduanera (~203 arts + fracciones de monstruos + transitorios clave) | ~260 |
| RGCE 2026 (reglas 1.x-7.x ~700 + 1a RM) | ~730 |
| Anexos RGCE clave (10, 22+apéndices, 1, 21, 24) | ~60 |
| LIGIE: RGI + notas sección (21) + notas capítulo (~97) | ~110 |
| LCE (~98) + Reglamento LCE opcional (~90) | ~100-190 |
| LIVA (~43 + fracciones) | ~60 |
| LIEPS (~31 + fracciones) | ~50 |
| LFD (alcance propuesto: Título I aduanero) | ~40 |
| Reglamento LA (~250) | ~260 |
| **TOTAL** | **~1,670-1,760** (vs 44 actuales) |

**Costo de embeddings** (Voyage `voyage-4`, 1024 dims, guard `assertCorpusEmbedding` ACTIVO; backoff exponencial en 429/5xx ya probado en `lib/embeddings.ts`):
~1,700 docs × ~500-800 tokens ≈ **1.0-1.4M tokens → del orden de $0.10-0.30 USD** (tarifa clase voyage ~$0.06-0.18/M). El costo real es el COTEJO humano/agente por lote, no el embedding. Re-embeds por correcciones: presupuestar 2× → sigue siendo <$1.

**Nota de retrieval a vigilar:** el coseno corre en memoria en Node (sin pgvector). Con ~1,750 docs sigue siendo trivial (~2MB de vectores, ms de cómputo), pero el plan incluye medir la latencia del retrieval tras el último lote; si algún día el corpus crece 10×, ahí se justifica pgvector — no antes.

## 3. ESTRATEGIA DE CONVIVENCIA (44 actuales + íntegros)

**Los 44 resúmenes NO se borran** (valor de síntesis). Esquema propuesto:

1. **Columna nueva** en `LegalDocument`: `claseTexto String @default("resumen")` — valores `'texto_integro' | 'resumen'`. Migración aditiva: los 44 existentes quedan `'resumen'` por default (que es la verdad — los pocos ya cotejados verbatim, ej. Art. 15-A LIEPS, se reclasifican a mano en su lote).
2. **Retrieval prioriza texto íntegro para citas** (`rag-search.ts`): boost de +15% al `finalScore` de `texto_integro` cuando compite con un `resumen` del MISMO `reference` (dedup por referencia: si el íntegro del Art. 54 LA entra al top-K, el resumen del Art. 54 LA se excluye del contexto — el modelo no necesita dos versiones y el resumen ya no puede "ganarle" la cita al texto real).
3. **El sello del cliente ya distingue**: `texto_integro` con fechaCotejo → puede presentarse `verificado`; `resumen` → `sin_verificar` con nota "síntesis operativa, no texto legal". Esto conecta con el registro de autoridad del productor (§2.2 de la frontera) sin tocar consumidores.
4. **Supersesión**: si un íntegro sustituye funcionalmente a un resumen viejo desactualizado, se usa el mecanismo existente `isActive=false` + `supersededBy=<id>` — nunca DELETE.

## 4. PLAN DE CARGA POR LOTES (commit por ley, verificación tras cada lote)

Orden por valor/riesgo (lo más citado primero), un lote = un commit = un deploy:

| # | Lote | Verificación post-lote (preguntas de prueba) |
|---|---|---|
| 0 | **Infraestructura**: columna `claseTexto` + `fechaCotejo`, boost/dedup en rag-search, validador de seed (referencia parseable + URL 200 + verbatim no vacío + dims 1024), script `seed-corpus-integro.ts` por lote con `--dry` | suite nueva `test:corpus` (validador rechaza: referencia no parseable, URL rota, contenido vacío, dim≠1024) |
| 1 | **Ley Aduanera** | "¿Qué establece el Art. 54 LA?" · "¿Cuándo procede el embargo precautorio (151 LA)?" · "¿Qué es el reconocimiento aduanero (43 LA)?" · "Multas por datos inexactos (184 LA)" · verificación: las 4 citan `texto_integro` con la reforma 19-nov-2025 |
| 2 | **RGCE 2026 + 1a RM** | "¿Vigencia del registro IVA/IEPS (7.1.6)?" · "¿Qué es el despacho conjunto?" · "Rectificación de pedimentos (6.1.1)" · al menos 1 pregunta cuya regla cambió con la 1a RM debe citar la versión 1a RM |
| 3 | **LIVA + LIEPS** (fiscal importación) | "¿IVA en importación temporal IMMEX (24 y 28-A LIVA)?" · "¿Qué grava IEPS en importación?" · "Acreditamiento del IVA pagado en aduana (Art. 5)" — estas preguntas son las del futuro eval set de 3b: este lote lo ALIMENTA |
| 4 | **LFD (Título I aduanero) + LCE** | "¿Cómo se calcula el DTA (49 LFD)?" · "¿Quién impone cuotas compensatorias (LCE)?" |
| 5 | **LIGIE: RGI + notas** | "¿Qué dice la RGI 3b?" · "¿Notas del capítulo 61?" · verificación extra: el Clasificador podrá consumirlas después (conecta con DEFERRED #19, fuera de alcance aquí) |
| 6 | **Reglamento LA** | "¿Requisitos del despacho conjunto en RLA?" · "Obligaciones del agente (RLA 235+)" |
| 7 | **Anexos RGCE clave** (+ Reglamento LCE si apruebas) | preguntas por anexo |

**Reglas duras de cada lote** (además de las tuyas):
- Extracción del DOC oficial → troceo → **validador automático** (referencia parseable por `citas-legales.ts`, URL viva, contenido no vacío, sin frases tipo "en resumen"/"esto significa" que delaten síntesis) → muestra aleatoria de 5 docs cotejada a mano contra el PDF → seed con guard de dims → 3-5 preguntas de prueba vía `smartRetrieval` real → commit del lote (script + JSON verbatim versionado en el repo) → siguiente.
- Un lote que no pasa su verificación NO se commitea y no bloquea a los anteriores.
- El seed usa `assertCorpusEmbedding` (guard existente) y el backoff Voyage existente; cero fallback hash en corpus (el guard ya lo impide).
- **Cero texto generado por LLM en `content`.** El único campo redactado es `title` (descriptor), y va etiquetado como tal.

**Riesgos declarados:** (1) compilar RGCE+1a RM a mano es el lote más delicado — mitigación: tabla de reglas modificadas por la 1a RM cotejada contra el DOF, incluida en el commit; (2) el DOC de LIGIE es gigante — mitigación: extraer solo Art. 2 y notas, nunca la tarifa; (3) LFD completa sería ruido — pendiente tu decisión de alcance; (4) los DOC de Diputados son .doc binario (Word 97) — extracción con `textutil` (macOS) o `antiword`/`libreoffice --headless`, verificando conteo de artículos vs PDF.

---

**DETENTE.** Fase 0 entregada. Decisiones abiertas para tu aprobación: (a) alcance LFD (Título I vs completa), (b) incluir Reglamento LCE, (c) columna `fechaCotejo` dedicada vs encodear en `version`, (d) el orden de lotes propuesto. Ni un documento se siembra antes de tu aprobación.
