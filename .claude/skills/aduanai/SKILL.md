---
name: aduanai
description: Context and conventions for the ADUANAI platform - Mexican customs/comex SaaS with AI
---

# ADUANAI Project Context

ADUANAI is a SaaS platform for Mexican foreign trade (comercio exterior) powered by AI. It replaces manual customs processes with intelligent automation.

## Architecture

Monorepo with two directories:
- `server/` — Express 5 REST API with Prisma 7 ORM (PostgreSQL)
- `client/` — React 19 SPA with Vite, Tailwind CSS v4, TypeScript

## Backend Modules (17 route files, 114+ endpoints)

| Module | Route prefix | Purpose |
|--------|-------------|---------|
| auth | `/api/auth` | JWT login/register |
| classify | `/api/classify` | AI product classification to TIGIE tariff codes |
| quote | `/api/quote` | Import cost calculator (IGI, DTA, IVA, IEPS) |
| copilot | `/api/copilot` | AI regulatory consultation chat |
| stats | `/api/stats` | Dashboard KPIs and volume data |
| alerts | `/api/alerts` | Compliance alerts + fraction watching |
| fractions | `/api/fractions` | TIGIE fraction search (8,183 fractions in DB) |
| inventory | `/api/inventory` | IMMEX temporary import tracking, Annex 24/30 |
| fiscal | `/api/fiscal` | Tax credits, guarantees, certification, risk analysis |
| mve | `/api/mve` | Manifestacion de Valor en Aduana generation |
| logistics | `/api/logistics` | Container load planning + 3D optimization |
| updater | `/api/updater` | TIGIE decree analysis and auto-updates |
| operations | `/api/operations` | Case/expediente management |
| prevalidate | `/api/prevalidate` | Pedimento pre-validation |
| analytics | `/api/analytics` | Usage metrics |
| whatsapp | `/api/whatsapp` | WhatsApp bot integration |
| health | `/api/health` | Health check |

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | React | 19 |
| Routing | React Router | 7 |
| Styling | Tailwind CSS | 4 |
| Build | Vite | 8 |
| Backend | Express | 5 |
| ORM | Prisma | 7 |
| Database | PostgreSQL | — |
| AI | Anthropic Claude SDK | 0.87+ |
| Auth | JWT (jsonwebtoken) | — |
| Language | TypeScript | 6 |

## Frontend Conventions

### API Layer
- ALL backend calls go through `src/lib/api.ts` — never use raw `fetch` in components
- The `api` object has typed methods for every endpoint
- Vite proxies `/api` to `localhost:3001` in dev

### File Organization
```
client/src/
  lib/api.ts          — API client (DO NOT DUPLICATE)
  components/         — Shared components (Layout, etc.)
  pages/              — One file per route/page
  main.tsx            — Entry point with BrowserRouter
  App.tsx             — Route definitions
  index.css           — Tailwind imports + global styles
```

### Rules
1. **Always use `api.*` methods** from `src/lib/api.ts` — never raw fetch
2. **All types are defined in `api.ts`** — import them from there
3. **One page component per file** in `src/pages/`
4. **Layout wraps all authenticated routes** — pages receive no layout props
5. **Token stored in localStorage** as `aduanai_token`
6. **Proxy configured** — use relative paths (`/api/...`), never hardcode `localhost:3001`

### Current Frontend Routes
`/app` (dashboard), `/clasificador`, `/cotizador`, `/copilot`, `/expediente`, `/prevalidador`, `/mve`, `/logistics`, `/inventario`, `/fiscal`, `/alertas`, `/updates`, `/fracciones`, `/historial`, `/analytics`, `/whatsapp`

## Domain Context (Mexican Customs)

- **TIGIE** — Tarifa de la Ley de los Impuestos Generales de Importacion y Exportacion (Mexico's tariff schedule)
- **Fraccion arancelaria** — 8-10 digit tariff code (e.g., 8471.30.01)
- **NICO** — Numero de Identificacion Comercial (additional 2 digits)
- **IGI** — Impuesto General de Importacion (import duty)
- **DTA** — Derecho de Tramite Aduanero (customs processing fee)
- **IVA** — 16% value-added tax on imports
- **IEPS** — Special production/services tax (alcohol, tobacco, etc.)
- **Pedimento** — Official customs declaration document
- **IMMEX** — Maquiladora/export manufacturing program (temporary imports)
- **MVE** — Manifestacion de Valor en Aduana (customs value declaration)
- **Annex 24/30** — IMMEX inventory and fiscal accounting reports
- **RRNA** — Regulaciones y Restricciones No Arancelarias (non-tariff regulations)
- **NOM** — Norma Oficial Mexicana (mandatory standards)
- **COVE** — Comprobante de Valor Electronico (electronic value voucher)
- **T-MEC/USMCA** — US-Mexico-Canada trade agreement

## Backend Conventions

- Services in `server/src/services/` contain business logic
- Routes in `server/src/routes/` handle HTTP + call services
- Auth middleware via JWT in `server/src/middlewares/`
- AI calls use `@anthropic-ai/sdk` directly
- All responses follow `{ status: "ok", data: ... }` pattern
