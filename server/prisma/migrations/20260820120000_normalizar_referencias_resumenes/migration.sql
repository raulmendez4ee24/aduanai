-- Lote 2 paso 0 (orden Raúl 20-ago): normalizar referencias de los resúmenes
-- viejos al formato parseable por citas-legales, para que el dedup del
-- retrieval y el matcher del Copilot crucen en ambos sentidos.
-- SOLO se toca `reference` — content y claseTexto INTACTOS. Idempotente.
-- Las referencias estructuralmente no-parseables (rangos, compuestas,
-- criterios AGA, tratados genéricos, notas de sección) NO se inventan:
-- quedan como están y se reportan (decisión de Raúl pendiente por categoría).

UPDATE legal_documents SET reference = 'Art. 151 LA'
 WHERE reference = 'Art. 151 Ley Aduanera' AND "claseTexto" = 'resumen';
UPDATE legal_documents SET reference = 'Art. 144 fracción III LA'
 WHERE reference = 'Art. 144 fr. III Ley Aduanera' AND "claseTexto" = 'resumen';
UPDATE legal_documents SET reference = 'Art. 24 fracción I LIVA'
 WHERE reference = 'Art. 24 fr. I LIVA' AND "claseTexto" = 'resumen';
