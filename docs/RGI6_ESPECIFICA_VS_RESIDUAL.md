# RGI 6 — subpartida específica frente a residual (4ª revisión, prioridad 1)

Rama `fix/motor-especifica-vs-residual`. Cierra el hallazgo más importante de la
cuarta revisión del producto.

## El hallazgo

> "El motor eligió 8544.42.99. Su RGI 6 analiza .05 contra .99 dentro de la
> 8544.42 y sigue sin razonar textualmente la 8544.30, que es la subpartida
> específica para juegos de cables de vehículos y la que su propio inventario
> demo usa para arneses (85443099). Y la advertencia autocontradictoria
> persiste: cita la Nota 2 de la Sección XVII que excluye al 85.44 del capítulo
> 87, y renglones después sugiere 'alternativa: 8708.99.XX'."

Regla dura pedida: **si existe una subpartida específica cuyo texto menciona el
tipo de producto o el uso/destino declarado, la RGI 6 debe compararla
textualmente y descartarla por escrito antes de caer en una residual.**

## Por qué no es "otra vuelta al prompt"

La ola v2 de iteración del prompt está cerrada sin mejora (memoria del
proyecto: `clasificador-v2-etapas-jul2026`). La regla se implementa como una
**compuerta determinista** sobre el catálogo + **un pase dirigido** de una sola
pregunta. El prompt general del clasificador solo se toca en un punto y por un
motivo legal, no de precisión (ver §5).

## Las piezas

| Pieza | Archivo | Qué hace |
|---|---|---|
| Tokenizador único | `server/src/services/rgi6-terminos.ts` | `extractSearchTerms` movido VERBATIM desde `classifier.ts` (mismas stopwords, mismo filtro) + plegado de acentos, singularización y raíz por prefijo. El retrieval y el pase usan el mismo criterio de "término significativo". |
| Detector de residual | `evaluarResidual` | Residualidad por TEXTO (`^Los/Las demás`, `^Otros`) y por POSICIÓN (sufijo `.99` con más de una fracción activa en la subpartida). Se resuelve contra `Subheading`/`Fraction` vía `subpartidas-hermanas.ts`; **no hay lista fija de fracciones**. |
| Candidata específica | `candidataEspecifica` | Hermana de la MISMA partida que le gana textualmente a la elegida. |
| Pase dirigido | `pasoRGI6` | UNA llamada al LLM (inyectable) que solo ve los dos textos, el producto, el uso declarado y las notas del corpus. Devuelve ganadora + justificación citando RGI 6 + descarte textual. |
| Fail-safe | `compararEspecificaVsResidual` | 429 / timeout / JSON roto / código fuera de la lista ⇒ `estado: 'no_ejecutado'`, se conserva la elección original y se dice. **Nunca se inventa el veredicto.** |
| Alternativas contradictorias | `filtrarAlternativasContradictorias` | Ver §4. |
| Veredicto en pantalla | `client/src/components/clasificador/HermanasClasificacion.tsx` | "Compara contra las hermanas" encabeza con el veredicto escrito, no solo la lista. |

## 1. Umbrales (y por qué esos)

Nada de números mágicos. La candidata califica por **una de dos vías**:

- **Vía eje de destino.** La hermana escribe en su texto el destino que el
  importador declaró y la elegida NO lo escribe. Sin umbral de raíces: esa
  coincidencia es exactamente la comparación que la RGI 6 exige. Es el caso del
  arnés — la descripción "arnés eléctrico automotriz…" no dice la palabra
  "cables", así que por coincidencia léxica pura la 8544.30 jamás aparecería.
- **Vía texto.** `UMBRAL_RAICES_SIN_EJE = 2` raíces significativas compartidas
  con el producto, **y más que las que comparte la subpartida elegida**. Dos y
  no una porque todas las subpartidas de una partida comparten el sustantivo
  del título ("cables" en toda la 85.44): una sola raíz no distingue nada y
  dispararía el pase en cualquier clasificación. El "más que la elegida" evita
  reabrir un caso donde el texto ya está pidiendo la que se eligió.

### Ejes de destino

Mecanismo GENERAL del Sistema Armonizado (muchas subpartidas se distinguen por
el destino de la mercancía), no una regla por producto. Misma disciplina de
curaduría que `lib/vocab-bridge.ts`: cada patrón del lado catálogo está
verificado contra descripciones reales de subpartidas activas, y
`src/tests/rgi6-especifica-residual.test.ts` falla si un eje pierde sustento.

| Eje | Lado catálogo (evidencia) | Lado producto |
|---|---|---|
| `medios_de_transporte` | 854430, 830230, 401310 | automotriz, automóvil, vehículo, camión, autobús, motocicleta… |
| `naves_aereas` | 401130, 880230 | aeronáutico, aeroespacial, avión, aeronave… |
| `embarcaciones` | 401694, 890190 | marítimo, embarcación, barco, buque, naval |
| `uso_domestico` | 741810, 842211 | doméstico, hogar, casa habitación |
| `uso_medico` | 401512, 902214 | médico, quirúrgico, hospital, odontológico, clínico |

## 2. Lectura del texto de subpartida

La primera medición e2e contra el LLM real **ratificó la residual**: el modelo
leyó "Juegos de cables para bujías de encendido *y demás juegos de cables de los
tipos utilizados en los medios de transporte*" como si el segundo miembro solo
cubriera análogos del primero (conjuntos de encendido), y concluyó que un arnés
de iluminación no encajaba.

El pase incorpora ahora dos criterios de lectura, generales y sin nombrar
ningún producto:

1. `"A … y demás B de los tipos utilizados en …"` son **dos supuestos
   independientes**; el segundo no hereda la función del primero.
2. Para la RGI 3a por vía de la RGI 6, describir por **destino** acota más que
   describir por una característica constructiva común a casi toda la partida
   ("provistos de piezas de conexión").
3. La residual es el cajón de lo que **no** encaja en ninguna específica del
   mismo nivel, no una alternativa que compita con ella.

Con eso, el caso de control sale 8544.30.99 con justificación y descarte
escritos (test `RGI6_E2E=1 npm run test:rgi6`).

## 3. Dónde se ve el veredicto

- `legalBasis.griApplied` → "Regla General 6 (RGI 6) — específica vs residual",
  con la justificación completa. Es lo que la pantalla del Clasificador ya
  renderiza como justificación legal y lo que va al dictamen.
- `legalBasis.discardedFractions` → el descarte textual de la perdedora.
- `legalBasis.legalNotes` → las notas del corpus usadas, con
  `(cotejo pendiente)` cuando `LegalDocument.fechaCotejo` es nulo.
- Bloque `rgi6` de la respuesta → estado, residual, candidata, ganadora,
  justificación, descarte, notas y aviso legible.
- Panel "Compara contra las hermanas" → encabeza con el veredicto; en ámbar
  cuando el pase no pudo ejecutarse.

## 4. Alternativas contradictorias

`NOTAS_EXCLUSION` mapea la **referencia del corpus** a su lectura estructurada.
Hoy hay una entrada: `Nota 2 Sección XVII LIGIE`. Del texto que está en
`LegalDocument`: las partes de mercancías de los capítulos 86-89 van a su
capítulo **salvo** cuando son mercancía cubierta por una partida específica de
los capítulos 84-90. De ahí:

- `capitulosExcluidos = 86, 87, 88, 89`
- `capitulosQueRetienen = 84, 85, 90` (la exclusión solo muerde cuando la
  mercancía se quedó FUERA de 86-89 gracias a una partida específica de 84-90;
  si la clasificación final ya está en 86-89, la nota respalda esa colocación).

Si el razonamiento cita la nota y la clasificación final está en un capítulo que
la nota retiene:

- se retiran las alternativas del capítulo excluido, con constancia escrita y
  la marca "cotejo pendiente";
- se retira también `useBasedAnalysis` cuando su `byUse` apunta ahí. Esto no es
  redundante: en la corrida real del caso de control **no había ninguna
  alternativa de cap 87** y la contradicción vivía exactamente en ese campo
  ("alternativa por uso: 8708.99.99").

**Si la nota no está en el corpus, NO se filtra nada** y queda dicho en
`legalBasis.discardedFractions` ("…esa nota no está en el corpus legal cargado:
no se filtraron alternativas por ella").

`Nota 2 Sección XVII LIGIE` tiene `claseTexto = 'resumen'` y `fechaCotejo = null`
en el corpus: **cotejo pendiente**, y así se muestra. Nada se marca como
cotejado por la mera presencia de una URL.

## 5. El único cambio al prompt general

La regla `CABLES Y ARNESES` de `USE_BASED_RULES` mandaba el arnés automotriz a
"potencial 8708.99" — justo lo que la Nota 2 de la Sección XVII impide cuando la
mercancía está cubierta por una partida específica de 84-90 (la 85.44 lo es). Era
la fuente de la advertencia autocontradictoria. Ahora apunta a la 8544.30 y
prohíbe ofrecer 8708.xx en el mismo dictamen que invoca la nota.

## 6. Medición

`npx tsx src/tests/rgi6-disparo-baseline.ts` recorre las predicciones de la
línea base y dice, **sin gastar una sola llamada al LLM**, en qué casos abre la
compuerta. Los casos donde no abre son bit a bit idénticos a antes de la regla.

Resultados y números concretos: ver el reporte de la rama.

## 7. Interruptor

`RGI6_ESPECIFICA_VS_RESIDUAL=0` apaga el pase sin tocar el resto del motor
(`rgi6Activo()`); el bloque `rgi6` sale con `estado: 'apagado'`.
