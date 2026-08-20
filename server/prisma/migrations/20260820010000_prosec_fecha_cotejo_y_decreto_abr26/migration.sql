-- PROSEC · Frontera Canónica (orden Raúl 19-ago, prioridad ALTA).
-- 1) fechaCotejo: sin ella la fila es aproximación → 'sin_verificar'.
-- 2) Las 11 filas EXACTAS del Segundo del "DECRETO por el que se modifica la
--    Tarifa de la LIGIE, y el Decreto PROSEC" (DOF 23-abr-2026, vespertina;
--    vigente 24-abr-2026), VERBATIM — incluida la errata tipográfica del
--    propio DOF ("0; 0008%"). Arancel "Ex." = tasa 0. Idempotente.

-- AlterTable
ALTER TABLE "prosec_eligibility" ADD COLUMN IF NOT EXISTS "fechaCotejo" TIMESTAMP(3);

-- Filas exactas del decreto (INSERT solo si no existe la combinación)
INSERT INTO "prosec_eligibility" ("id","fractionCode","matchType","sector","prosecRate","conditions","active","effectiveDate","decree","fechaCotejo","notes","createdAt","updatedAt")
SELECT * FROM (VALUES
  ('prosec_abr26_01','72083901','exact','electric',0,'{"descripcionDecreto":"De espesor inferior a 3 mm.","arancelDecreto":"Ex.","acotacion":null}'::jsonb,true,TIMESTAMP '2026-04-24',E'DOF 23-04-2026 (Tarifa 15 · Segundo, Art. 5 fr. I PROSEC)',TIMESTAMP '2026-08-19','Industria Eléctrica',now(),now()),
  ('prosec_abr26_02','72085104','exact','electric',0,'{"descripcionDecreto":"De espesor superior a 10 mm.","arancelDecreto":"Ex.","acotacion":"Excepto: Placas de acero de espesor superior a 10 mm, grados SHT-80, SHT-110, AR-400, SMM-400 o A-516, y placas de acero de espesor superior a 70 mm, grado A-36"}'::jsonb,true,TIMESTAMP '2026-04-24',E'DOF 23-04-2026 (Tarifa 15 · Segundo, Art. 5 fr. I PROSEC)',TIMESTAMP '2026-08-19','Industria Eléctrica',now(),now()),
  ('prosec_abr26_03','72112999','exact','electric',0,'{"descripcionDecreto":"Los demás.","arancelDecreto":"Ex.","acotacion":"Únicamente: Flejes con un contenido de carbono igual o superior a 0.6%"}'::jsonb,true,TIMESTAMP '2026-04-24',E'DOF 23-04-2026 (Tarifa 15 · Segundo, Art. 5 fr. I PROSEC)',TIMESTAMP '2026-08-19','Industria Eléctrica',now(),now()),
  ('prosec_abr26_04','72251999','exact','electronics',0,'{"descripcionDecreto":"Los demás.","arancelDecreto":"Ex.","acotacion":null}'::jsonb,true,TIMESTAMP '2026-04-24',E'DOF 23-04-2026 (Tarifa 15 · Segundo, Art. 5 fr. II b) PROSEC)',TIMESTAMP '2026-08-19','Industria Electrónica',now(),now()),
  ('prosec_abr26_05','72082601','exact','automotive',0,'{"descripcionDecreto":"De espesor superior o igual a 3 mm pero inferior a 4.75 mm.","arancelDecreto":"Ex.","acotacion":null}'::jsonb,true,TIMESTAMP '2026-04-24',E'DOF 23-04-2026 (Tarifa 15 · Segundo, Art. 5 fr. XIX PROSEC)',TIMESTAMP '2026-08-19','Industria Automotriz y de Autopartes',now(),now()),
  ('prosec_abr26_06','72082701','exact','automotive',0,'{"descripcionDecreto":"De espesor inferior a 3 mm.","arancelDecreto":"Ex.","acotacion":null}'::jsonb,true,TIMESTAMP '2026-04-24',E'DOF 23-04-2026 (Tarifa 15 · Segundo, Art. 5 fr. XIX PROSEC)',TIMESTAMP '2026-08-19','Industria Automotriz y de Autopartes',now(),now()),
  ('prosec_abr26_07','72091601','exact','automotive',0,'{"descripcionDecreto":"De espesor superior a 1 mm pero inferior a 3 mm.","arancelDecreto":"Ex.","acotacion":null}'::jsonb,true,TIMESTAMP '2026-04-24',E'DOF 23-04-2026 (Tarifa 15 · Segundo, Art. 5 fr. XIX PROSEC)',TIMESTAMP '2026-08-19','Industria Automotriz y de Autopartes',now(),now()),
  ('prosec_abr26_08','72091701','exact','automotive',0,'{"descripcionDecreto":"De espesor superior o igual a 0.5 mm pero inferior o igual a 1 mm.","arancelDecreto":"Ex.","acotacion":null}'::jsonb,true,TIMESTAMP '2026-04-24',E'DOF 23-04-2026 (Tarifa 15 · Segundo, Art. 5 fr. XIX PROSEC)',TIMESTAMP '2026-08-19','Industria Automotriz y de Autopartes',now(),now()),
  ('prosec_abr26_09','72112999','exact','automotive',0,'{"descripcionDecreto":"Los demás.","arancelDecreto":"Ex.","acotacion":"Únicamente: Flejes con un contenido de carbono igual o superior a 0.6%."}'::jsonb,true,TIMESTAMP '2026-04-24',E'DOF 23-04-2026 (Tarifa 15 · Segundo, Art. 5 fr. XIX PROSEC)',TIMESTAMP '2026-08-19','Industria Automotriz y de Autopartes',now(),now()),
  ('prosec_abr26_10','72253091','exact','automotive',0,'{"descripcionDecreto":"Los demás, simplemente laminados en caliente, enrollados.","arancelDecreto":"Ex.","acotacion":"Excepto: Con un contenido de boro superior o igual a 0; 0008%, de espesor superior a 10 mm; con un contenido de boro superior o igual a 0; 0008%, de espesor superior o igual a 4; 75 mm, pero inferior o igual a 10 mm; con un contenido de boro superior o igual a 0; 0008%, de espesor superior o igual a 3 mm, pero inferior a 4; 75 mm; con un contenido de boro superior o igual a 0; 0008%, de espesor inferior a 3 mm; de acero rápido. (Errata tipográfica del propio DOF: «0; 0008%» por 0.0008% — se conserva VERBATIM)"}'::jsonb,true,TIMESTAMP '2026-04-24',E'DOF 23-04-2026 (Tarifa 15 · Segundo, Art. 5 fr. XIX PROSEC)',TIMESTAMP '2026-08-19','Industria Automotriz y de Autopartes',now(),now()),
  ('prosec_abr26_11','72254091','exact','automotive',0,'{"descripcionDecreto":"Los demás, simplemente laminados en caliente, sin enrollar.","arancelDecreto":"Ex.","acotacion":"Únicamente: Con un contenido de boro superior o igual a 0.0008%, de espesor superior a 10 mm, excepto de grado herramienta."}'::jsonb,true,TIMESTAMP '2026-04-24',E'DOF 23-04-2026 (Tarifa 15 · Segundo, Art. 5 fr. XIX PROSEC)',TIMESTAMP '2026-08-19','Industria Automotriz y de Autopartes',now(),now())
) AS v(id,"fractionCode","matchType",sector,"prosecRate",conditions,active,"effectiveDate",decree,"fechaCotejo",notes,"createdAt","updatedAt")
WHERE NOT EXISTS (
  SELECT 1 FROM "prosec_eligibility" p
  WHERE p."fractionCode" = v."fractionCode" AND p.sector = v.sector AND p."matchType" = 'exact'
);
