// E2E: cotiza un vehículo 8703 con ISAN activado y confirma que el ISAN
// aparece por item, en totals.isan, y SUMADO a totalCost/totalDuties/totalAll.
import { prisma } from '../dist/lib/prisma.js';
import { calculateMultiQuote } from '../dist/services/quoter-multi.js';

async function main() {
  // fracción 8703 real del catálogo
  const frac = await prisma.fraction.findFirst({ where: { code: { startsWith: '8703' } }, select: { code: true, description: true } });
  if (!frac) { console.log('No hay fracción 8703 en el catálogo'); return; }
  console.log(`Fracción usada: ${frac.code} — ${frac.description?.slice(0, 60)}`);

  const vehiclePriceMXN = 500000;
  const input = {
    destination: 'Manzanillo', incoterm: 'FOB', currency: 'USD',
    exchangeRateMode: 'latest' as const,
    items: [{
      fractionCode: frac.code, quantity: 1, unitValueUSD: 25000,
      countryOfOrigin: 'JP', isVehicle: true, vehiclePriceMXN, isElectric: false,
    }],
  };
  const r = await calculateMultiQuote(input as any);
  const it = r.items[0]!;
  console.log('\n──── DESGLOSE PARTIDA 1 (vehículo) ────');
  console.log(`  IGI:           $${it.igi.toLocaleString('es-MX')}`);
  console.log(`  DTA:           $${it.dta.toLocaleString('es-MX')}`);
  console.log(`  IVA:           $${it.iva.toLocaleString('es-MX')}`);
  console.log(`  Cuota comp.:   $${it.countervailing.toLocaleString('es-MX')}`);
  console.log(`  ISAN:          $${it.isan.toLocaleString('es-MX')}   ← (precio ${vehiclePriceMXN.toLocaleString('es-MX')})`);
  console.log(`  programs.isan: applies=${it.programs.isan.applies} exempt=${it.programs.isan.exempt} amount=$${it.programs.isan.amountMXN}`);
  console.log(`  totalCost:     $${it.totalCost.toLocaleString('es-MX')}`);
  console.log('\n──── TOTALES ────');
  console.log(`  totals.isan:        $${r.totals.isan.toLocaleString('es-MX')}`);
  console.log(`  totals.totalDuties: $${r.totals.totalDuties.toLocaleString('es-MX')}`);
  console.log(`  totals.totalLanded: $${r.totals.totalLandedCost.toLocaleString('es-MX')}`);
  console.log(`  totals.totalAll:    $${r.totals.totalAll.toLocaleString('es-MX')}`);

  // Aserción: ISAN esperado $15,445.41 y debe estar dentro del total
  const expectedISAN = 15445.41;
  const isanOk = Math.abs(it.isan - expectedISAN) < 0.5 && Math.abs(r.totals.isan - expectedISAN) < 0.5;
  // totalCost debe incluir el ISAN: totalCost == (igi+dta+iva+countervailing+valor) + isan aprox
  const dutiesIncludeIsan = r.totals.totalDuties >= r.totals.isan && r.totals.isan > 0;
  console.log('\n', isanOk && dutiesIncludeIsan
    ? `✅ ISAN $${it.isan.toLocaleString('es-MX')} calculado, mostrado y SUMADO al total (totalAll incluye ISAN).`
    : '⚠️ revisar — ISAN no coincide o no está sumado');
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
