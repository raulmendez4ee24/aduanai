-- Misión CIERRE TOTAL 25-ago-2026 (Bloque 1, bugs de regla Pre-Glosa).
-- Los textos que ve el usuario salen de glosa_risk_rules (buildFlag), no del
-- código: corregirlos exige migración de datos (prod no re-ejecuta el seed).
-- Idempotente: UPDATE por ruleCode con el texto final.

-- CLA_001: la redacción prometía datos del SAT ("reclasificada por el SAT en
-- >15% de los pedimentos del sector") que la plataforma NO tiene. La señal
-- real es interna y por tenant: ≥15% de clasificaciones propias de la
-- fracción marcadas incorrectas en 12 meses (mínimo 5; menos = no_evaluado).
UPDATE "glosa_risk_rules" SET
  "description" = 'Más del 15% de tus clasificaciones de esta fracción en los últimos 12 meses fueron marcadas como incorrectas en la plataforma (señal interna; mínimo 5 clasificaciones para evaluar).',
  "detectionLogic" = '{"type":"reclassification_history","thresholdPct":15,"minSample":5,"windowDays":365,"scope":"tenant"}'::jsonb,
  "updatedAt" = NOW()
WHERE "ruleCode" = 'CLA_001';

-- REG_001: muere "A4" y "diferir IVA" — las claves temporales IMMEX son
-- IN/AF (A4 es depósito fiscal, Apéndice 2 Anexo 22) y sin certificación el
-- IVA causado se PAGA O GARANTIZA en el despacho (Art. 28-A LIVA); no hay
-- diferimiento que perder. Coherente con el código (glosa-simulator.ts §13).
UPDATE "glosa_risk_rules" SET
  "description" = 'Importación temporal IMMEX (claves IN/AF) sin certificación IVA-IEPS: el IVA causado se paga o se garantiza en el despacho (Art. 28-A LIVA).',
  "detectionLogic" = '{"type":"immex_no_certification","regimes":["IN","AF"]}'::jsonb,
  "recommendation" = 'Considerar obtener la certificación IVA-IEPS (Anexo 31 RGCE) para aplicar el crédito fiscal del Art. 28-A LIVA, o garantizar el IVA en el despacho.',
  "legalBasis" = 'Art. 28-A LIVA · Anexo 31 RGCE',
  "updatedAt" = NOW()
WHERE "ruleCode" = 'REG_001';
