# SELLO — Sistema de diseño de ADUANAI

**Versión:** 1.0 (2026-07-05) · **Estado:** fundación implementada (tokens + componentes base + `/design-system`)
**Alma:** instrumento oficial mexicano — sobrio, preciso, confiable. El usuario es un agente aduanal de 35-60 años: **la claridad gana sobre lo llamativo, siempre.**

Todo prompt de rediseño posterior referencia este documento. Si una pantalla contradice esta especificación, la pantalla está mal.

---

## 1. Principios

1. **Papel y tinta.** La app se lee como un documento oficial bien impreso: fondos papel, texto tinta, bordes finos. Nada "flota" salvo lo que de verdad flota (modales, popovers).
2. **El dato legal siempre lleva sello.** Cualquier afirmación legal (fracción, cuota, multa, fecha DOF) aparece con su `SelloVerificacion`: verificado, sin verificar o vencido. La procedencia no es un footer — es parte del dato.
3. **El color significa.** Petróleo = acción/activo. Verde sello = SOLO verificación. Ámbar = sin verificar/advertencia. Carmín = error/hallazgo crítico — escaso a propósito: cuando aparece, importa.
4. **Legible a los 55.** Base 16px, line-height 1.6, contraste alto. Nada de 13px para contenido; 13px es exclusivo de captions/encabezados de tabla.
5. **Sin teatro.** Cero gradientes decorativos, cero glassmorphism, cero sombras suaves de startup, cero animaciones de entrada dentro de la app. Transiciones de 150ms en hover/focus y ya.

## 2. Tokens de color (light, único modo)

Fuente única: `@theme` en `client/src/index.css`. **Prohibido** el hex inline en componentes; si falta un token, se agrega aquí primero.

| Token | Hex | Uso |
|---|---|---|
| `papel` | `#F7F8F7` | Fondo de la app |
| `papel-2` | `#EEF1EF` | Fondos alternos, filas zebra, sidebar |
| `superficie` | `#FFFFFF` | Cards, paneles, modales |
| `tinta` | `#131A1C` | Texto principal |
| `tinta-suave` | `#5A6467` | Texto secundario, labels |
| `linea` | `#E1E5E3` | TODOS los bordes (1px) |
| `petroleo` | `#144B41` | Primario: botones principales, links, focus ring, activos |
| `petroleo-suave` | `#E7EFEC` | Fondos de estados activos/seleccionados |
| `sello` | `#0E6B4F` | Verde de verificación — SOLO `SelloVerificacion` y estados "verificado" |
| `ambar` | `#96660A` | Advertencias, datos sin verificar |
| `ambar-suave` | `#FBF3E2` | Fondo de advertencias |
| `carmin` | `#A32C33` | Errores y hallazgos críticos (escaso) |
| `carmin-suave` | `#F9ECED` | Fondo de errores |

Utilidades generadas (Tailwind v4): `bg-papel`, `text-tinta`, `border-linea`, `ring-petroleo`, `bg-ambar-suave`, etc.

## 3. Tipografía

Self-host en `client/public/fonts/` (woff2, subset latin, `font-display: swap`). Sin Google Fonts remotas.

| Rol | Familia | Token/clase | Reglas |
|---|---|---|---|
| Display | **Spectral 600** | `font-sello-display` | H1/H2, títulos de reportes, cifras protagonistas. Tracking ligeramente apretado (`tracking-tight`) |
| UI/Cuerpo | **Public Sans** 400-700 | `font-sello-ui` | Todo lo demás. **Base 16px**, line-height 1.6 en cuerpo |
| Datos | **IBM Plex Mono** 400/500 | `font-sello-mono` | Fracciones, cuotas, montos, folios, fechas DOF, IDs. **Siempre con `tabular-nums`** (la clase lo incluye) |

**Escala tipográfica (la única):** 13 (caption/encabezado de tabla) · 14 (secundario) · **16 (base)** · 18 · 22 · 28 · 36 · 48.
Prohibido `text-[Npx]` arbitrario fuera de la escala. Nada de contenido a 13px o menos.

> Nota de migración: los tokens viejos (`--font-display`/`--font-body`/`--font-mono` = DM Serif/Outfit/JetBrains) siguen vivos SOLO porque las pantallas no migradas los usan (`font-mono` ×294). Los componentes Sello usan exclusivamente `font-sello-*`. Al migrar la última pantalla, los viejos se eliminan y `font-mono` pasa a apuntar a Plex Mono.

## 4. Forma y espacio

- **Radius:** 6px cards/modales (`rounded-sello`), 4px inputs/botones/badges (`rounded-sello-sm`). **Nada de pills** salvo badges.
- **Sombras: NINGUNA en cards.** Cards = borde 1px `linea`. Sombra (`shadow-sello-float`) SOLO en flotantes: modales, popovers, dropdowns.
- **Espaciado:** escala de 4px. Densidad generosa: padding 20-24px en cards.
- **Transiciones:** 150ms ease en hover/focus. **Sin animaciones de entrada** dentro de la app (la landing pública puede conservar las suyas hasta su migración).
- **Focus visible SIEMPRE:** ring 2px `petroleo` con offset 2px (`focus-visible:ring-2 ring-petroleo ring-offset-2`). Incluido en todos los componentes base.

## 5. Voz y texto

- Español mexicano. **Sentence case**: "Generar reporte" (no "Generar Reporte" ni "GENERAR REPORTE").
- Verbos activos y específicos: el botón dice exactamente lo que hace ("Descargar dictamen PDF", no "Aceptar").
- Datos siempre con unidad y fuente: "1.74 USD/kg — DOF 15-ago-2024 [sello]".
- Fechas visibles en formato corto mexicano: `12-jun-2026` (en Plex Mono cuando son dato).

## 6. Componentes base (`client/src/components/ui/`)

| Componente | Variantes/estados | Notas |
|---|---|---|
| `Button` | primario (petróleo) / secundario (borde línea) / destructivo (carmín) / ghost · sm/md/lg · `disabled`, `loading` | Radius 4, focus ring, verbo específico |
| `Card` | slots `header` / body (children) / `footer` | Superficie + borde línea + radius 6, sin sombra |
| `Badge` | neutral / petroleo / ambar / carmin | Radius 4 (la única pill permitida), 13px, sin uppercase |
| **`SelloVerificacion`** | `verificado` / `sin_verificar` / `vencido` + popover | **El componente firma.** Ver §7 |
| `Input` / `Select` / `Textarea` | label arriba (tinta-suave), error (carmín debajo), `disabled` | 16px, borde línea, focus petróleo |
| `DataTable` | columnas `align: 'right'` + `mono` para numéricas | Encabezados 13px uppercase tracking-wide tinta-suave; zebra `papel-2`; celdas 14-16px |
| `EmptyState` | ícono + una línea + botón de acción | Un vacío es una invitación a actuar, no un mensaje triste |

## 7. SelloVerificacion — contrato

```ts
interface SelloVerificacionProps {
  estado: 'verificado' | 'sin_verificar' | 'vencido';
  fuenteNombre?: string;     // "DOF", "Diputados LeyesBiblio", "SNICE"
  fuenteUrl?: string;        // clickeable en el popover
  fechaPublicacion?: string; // ISO — se muestra "12-jun-2026" en Plex Mono
  fechaVerificacion?: string;// última verificación nuestra
  metodo?: 'manual' | 'scraper';
}
```

- **verificado**: badge verde `sello` + ✓ + `"DOF · 12-jun-2026"` (fecha de PUBLICACIÓN, Plex Mono).
- **sin_verificar**: badge outline ámbar, "Sin verificar".
- **vencido**: badge gris (tinta-suave) + ícono alerta, "Requiere revalidación".
- Hover/click/Enter → popover flotante (única sombra permitida) con: fuente (nombre + URL clickeable), fecha de publicación, fecha de última verificación, método. Cierra con Escape y click fuera. Navegable por teclado (`aria-expanded`, foco al abrir).
- Aparece **junto a cada dato legal de toda la app**. Compacto por diseño.

Mapa de datos existentes → props: el motor del Risk Scorer ya entrega `fundamento {articulo, citaCorta, fuente, url, fechaCotejo}` por regla; corpus/BibliotecaLegal tienen `officialUrl`. El Clasificador (`legalNotes {source, text}`) requiere extensión de API para llevar URL+fecha — pendiente de migración coordinada.

## 8. QA visual

Ruta **`/design-system`** (solo build de desarrollo): muestra todos los tokens, la escala tipográfica, y cada componente con sus variantes/estados, incluido `SelloVerificacion` en sus 3 estados con popover funcional. Es el espejo: toda revisión de rediseño empieza ahí.

## 9. Prohibiciones (herencia de marca)

- ❌ Identidad KAN Logic: obsidiana/negro, dorado champagne, Cormorant Garamond. ADUANAI es otra marca con otra alma.
- ❌ Dark mode (por ahora), gradientes decorativos, glassmorphism, sombras difusas tipo startup.
- ❌ Hex inline, `text-[Npx]` arbitrario, pills fuera de Badge, animaciones de entrada en la app.
