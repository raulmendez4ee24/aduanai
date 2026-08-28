/**
 * CASO DE CONTROL end-to-end del pase RGI 6 (4ª revisión, prioridad 1).
 *
 * Ejecutar:  npx tsx src/tests/rgi6-control-arnes.ts        (necesita ANTHROPIC_API_KEY)
 *            RGI6_ESPECIFICA_VS_RESIDUAL=0 npx tsx src/tests/rgi6-control-arnes.ts   (antes)
 *
 * Corre `classifyProduct` COMPLETO sobre el caso que el revisor levantó y
 * imprime: fracción final, bloque `rgi6` (veredicto y descarte por escrito),
 * alternativas que sobreviven al filtro de la nota de exclusión y la
 * fundamentación legal que verá el usuario. No persiste nada.
 */
import { classifyProduct } from '../services/classifier';
import { prisma } from '../lib/prisma';

const CASOS = [
  { d: 'arnés eléctrico automotriz para iluminación de vehículo M1', uso: 'ensamble vehicular en planta armadora' },
  { d: 'arnés de cables para automóvil, cobre con conectores plásticos', uso: 'ensamble vehicular' },
];

async function main() {
  for (const c of CASOS) {
    console.log(`\n══════ ${c.d}  [uso: ${c.uso}]`);
    try {
      const r = await classifyProduct(c.d, undefined, { useCase: c.uso, sector: 'automotive_parts', importerType: 'IMMEX' });
      console.log(`FRACCIÓN: ${r.fraction.code} — ${r.fraction.description}`);
      console.log(`confianza: ${r.confidence}`);
      console.log(`RGI6: estado=${r.rgi6?.estado} ganadora=${r.rgi6?.ganadora ?? '—'}`);
      console.log(`  aviso: ${r.rgi6?.aviso ?? '—'}`);
      console.log(`  residual: ${r.rgi6?.residual?.codeFormatted ?? '—'} | candidata: ${r.rgi6?.candidata?.codeFormatted ?? '—'}`);
      console.log(`  justificación: ${r.rgi6?.justificacion ?? '—'}`);
      console.log(`  descarte: ${r.rgi6?.descarte ?? '—'}`);
      console.log(`ALTERNATIVAS: ${(r.alternatives ?? []).map(a => a.code).join(', ') || '(ninguna)'}`);
      console.log(`useBasedAnalysis: ${r.useBasedAnalysis ? r.useBasedAnalysis.byUse?.code : 'null'}`);
      console.log('DESCARTES ESCRITOS:');
      for (const d of r.legalBasis?.discardedFractions ?? []) console.log(`  - ${d.code}: ${d.reason}`);
      console.log('RGI APLICADAS:');
      for (const g of r.legalBasis?.griApplied ?? []) console.log(`  - ${g.rule}: ${g.reasoning.slice(0, 400)}`);
    } catch (e) {
      console.log('ERROR:', e instanceof Error ? e.message : e);
    }
  }
  await prisma.$disconnect();
}

main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
