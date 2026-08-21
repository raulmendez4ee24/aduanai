-- D7 (auditoría 21-ago-2026): la regla ADU_001 de glosa_risk_rules recomendaba
-- "considerar aduana alterna (Lázaro Cárdenas, Altamira, Progreso)" cuando la
-- aduana declarada tiene alta tasa histórica de Reconocimiento Aduanero.
-- Aconsejar aduana-shopping para bajar la probabilidad de revisión es
-- exactamente la conducta que el SAT perfila — incompatible con un producto
-- de cumplimiento. Texto nuevo verbatim del seed corregido
-- (prisma/seed/glosa-risk-rules.ts, RULES['ADU_001'].recommendation).
--
-- Censo de solo lectura contra prod (21-ago-2026,
-- prisma/seed/verify-no-aduana-shopping.mjs vía railway ssh): de 15 filas en
-- glosa_risk_rules, únicamente ADU_001.recommendation tenía lenguaje
-- prohibido; ningún otro campo ni fila de la tabla.
--
-- Idempotente: UPDATE por ruleCode con IS DISTINCT FROM — re-ejecutar no
-- escribe nada. No inserta ni borra filas; NO es un reseed (no toca las
-- otras 14 filas, que nadie más auditó).
UPDATE "glosa_risk_rules"
SET "recommendation" = 'Prepara evidencia documental reforzada antes del despacho (factura, packing list, certificados, transferencias) — esta aduana tiene mayor probabilidad histórica de Reconocimiento Aduanero.'
WHERE "ruleCode" = 'ADU_001'
  AND "recommendation" IS DISTINCT FROM 'Prepara evidencia documental reforzada antes del despacho (factura, packing list, certificados, transferencias) — esta aduana tiene mayor probabilidad histórica de Reconocimiento Aduanero.';
