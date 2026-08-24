-- Cotejo 24-ago-2026 contra la Base Única LIGIE (BASEUNICA-LIGIE_20260330,
-- ligie-fractions-2026.json, 8,183 fracciones): la fracción 8544.42.01 NO
-- existe en la TIGIE 2026 — es residuo del seed legacy (tigie-data.ts) que
-- quedó ACTIVO porque seed-ligie-2026 usa skipDuplicates. El clasificador la
-- estaba proponiendo en vivo (caso arnés de la re-verificación). En 2026 la
-- subpartida 8544.42 se compone de 8544.42.05 (naves aéreas) y 8544.42.99
-- (Los demás.). Mismo patrón que scripts/fix-retired-fractions.ts (7318.15.05
-- → active=false + reapuntar referencias). Es una de las "13 legacy activas
-- por cotejar" del backlog — las otras 12 siguen pendientes de su cotejo.
-- Idempotente.
UPDATE "fractions" SET "active" = false, "updatedAt" = NOW()
WHERE "code" = '85444201' AND "active" = true;

-- Precio estimado sintético (source='internal', sin decreto) que apuntaba a
-- la fracción retirada → a la residual sobreviviente 8544.42.99.
UPDATE "estimated_prices" SET "fractionCode" = '85444299'
WHERE "fractionCode" = '85444201';
