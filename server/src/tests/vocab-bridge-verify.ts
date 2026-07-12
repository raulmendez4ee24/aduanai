/**
 * Verificador del puente de vocabulario (Etapa 2) — re-verifica CADA término
 * de expansión contra el catálogo vivo con la MISMA regla de matching que usa
 * findRelatedFractions (stem por prefijo + frontera de palabra). Falla si
 * cualquier entrada pierde sustento (p. ej. tras un update TIGIE).
 *
 *   npx tsx src/tests/vocab-bridge-verify.ts
 */
import { prisma } from '../lib/prisma';
import { VOCAB_BRIDGE, VOCAB_BRIDGE_VERSION } from '../lib/vocab-bridge';

function stemLikeRetrieval(term: string): string {
  return term.length >= 6 ? term.slice(0, Math.max(5, term.length - 3)) : term;
}

async function main(): Promise<void> {
  console.log(`vocab-bridge ${VOCAB_BRIDGE_VERSION} — ${VOCAB_BRIDGE.length} entradas`);
  let ok = 0;
  let bad = 0;
  for (const e of VOCAB_BRIDGE) {
    for (const term of e.expand) {
      const stem = stemLikeRetrieval(term);
      const rows = await prisma.$queryRawUnsafe<{ code: string }[]>(
        `SELECT code FROM fractions WHERE active = true AND description ~* $1 LIMIT 3`,
        `\\m${stem}`,
      );
      if (rows.length > 0) {
        ok++;
        console.log(`  ✓ ${term} (\\m${stem}) → ${rows.map(r => r.code).join(', ')}`);
      } else {
        bad++;
        console.error(`  ✗ ${term} (\\m${stem}) → SIN MATCH EN CATÁLOGO — entrada sin sustento: ${e.match}`);
      }
    }
  }
  console.log(`\n${ok} términos verificados, ${bad} sin sustento`);
  await prisma.$disconnect();
  if (bad > 0) process.exit(1);
}

void main().catch(err => { console.error(err); process.exit(1); });
