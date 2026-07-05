# GAP DE API — Expediente del Clasificador (sellos de verificación)

**Fecha:** 2026-07-05 · **Contexto:** la vista Expediente del Clasificador v2 está construida contra el tipo ideal `DatoLegalVerificado` (ver `client/src/pages/Classifier.tsx`). La respuesta ACTUAL de `POST /api/classify` no expone los metadatos de cotejo por dato, así que **hoy todo el expediente rinde sello ámbar "sin_verificar"** — honesto por diseño, no un bug. Este documento lista exactamente qué debe exponer el backend para que cada dato pueda rendir verde.

## El contrato que la UI ya consume

```ts
interface DatoLegalVerificado {
  texto: string            // la afirmación ("Regla General 1", "NOM-020-SCFI-2004", "IGI 35%")
  detalle?: string
  estado: 'verificado' | 'sin_verificar' | 'vencido'
  fuenteNombre?: string    // "DOF", "Diputados LeyesBiblio", "SNICE"
  fuenteUrl?: string       // URL oficial CLICKEABLE
  fechaPublicacion?: string
  fechaVerificacion?: string  // cuándo LO COTEJAMOS nosotros
  metodo?: 'manual' | 'scraper'
}
```

## Campos faltantes, por sección de la respuesta

| Sección de `ClassificationResult` | Hoy trae | Falta para sello verde | Fuente interna que YA tiene el dato |
|---|---|---|---|
| `legalBasis.legalNotes[]` | `{source, text}` | `officialUrl`, `publishedDate`, `verifiedAt`, `method` | La mayoría de las notas provienen del corpus `LegalDocument`, que YA guarda `officialUrl` y `publishedDate` (los verbatim de Fase 3 además tienen cotejo citable). El server solo tiene que ADJUNTARLOS al armar legalNotes |
| `legalBasis.griApplied[]` | `{rule, reasoning}` | referencia LIGIE + URL (diputados) + fecha de la consolidada | Constante — puede sellarse desde `lib/tariff-version.ts` + URL LeyesBiblio |
| `regulations.noms[]` | `string[]` (claves NOM) | por NOM: URL DOF de la NOM, fecha, y si su exigibilidad viene del Anexo 2.4.1 vigente | **Bloqueado por dato**: el Anexo 2.4.1 consolidado sigue PENDIENTE DE FUENTE (DEFERRED); el campo `Fraction.noms` del catálogo no está cotejado contra 2.4.1 |
| `tariffs.nmf` / `tariffs.preferential` | números | fuente del arancel (Base Única SNICE / decreto DOF 29-12-2025 si aplica) + fecha de esa versión + `verifiedAt` | `meta.tigieVersion` existe pero sin URL/fecha estructuradas por tasa |
| `alerts[].metadata` (cuotas antidumping) | `dofUrl`, `publishDate`, `resolutionNumber` ✓ | `verifiedAt` + `method`… **y credibilidad**: la tabla `AntidumpingDuty` está pendiente de reconstrucción con la lista oficial UPCI (DEFERRED #17) — la UI la muestra "sin_verificar (DOF declarado)" aunque traiga URL, a propósito | Se desbloquea con la reconstrucción UPCI, no con un campo |
| `padronCheck.required[]` | sector/nombre | URL del Anexo 10 DOF 14-01-2026 + fecha + `verifiedAt` | El seed `sat-padrones.ts` ya cita "(DOF 14-ene-2026)" en `legalBasis` — falta estructurarlo |
| `meta` | `tigieVersion`, `ligieVersion` | `catalogSource` (URL Base Única SNICE) + `catalogDate` + `verifiedAt` | Conocido en el server (seed del catálogo) |

## Cambio propuesto (compatible hacia atrás)

Añadir a cada elemento citable un objeto opcional `sello`:

```ts
sello?: {
  estado: 'verificado' | 'sin_verificar' | 'vencido'
  fuenteNombre: string
  fuenteUrl?: string
  fechaPublicacion?: string   // ISO
  fechaVerificacion?: string  // ISO — nuestro cotejo
  metodo: 'manual' | 'scraper'
}
```

La UI ya degrada con gracia: sin `sello` → ámbar. Con `sello` → lo que el backend afirme. **Regla del server (principio #4 del producto): jamás emitir `estado: 'verificado'` sin artefacto de cotejo citable (URL + fecha) — mejor ámbar que verde inventado.**

## Referencia viva del patrón

El motor del Risk Scorer YA emite este contrato por regla (`fundamento {articulo, citaCorta, fuente, url, fechaCotejo}` — `server/src/services/risk-scorer/rules.ts`). Extender ese patrón al Clasificador es replicación, no invención.

## Dato colateral medido

El Dashboard v2 computa "% corpus verificado" = docs con `officialUrl`+`publishedDate` / total → **11% en la primera corrida real**. Completar la metadata del corpus sube tanto esa métrica como la proporción de sellos verdes de esta pantalla.
