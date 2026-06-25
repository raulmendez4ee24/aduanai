// Pobla isan_rates en prod con la TARIFA ISAN 2026 verificada (DOF 28-dic-2025,
// Anexo 15 RMF, Art. 3 LFISAN). Solo toca ISANRate. Luego corre calculateISAN
// real para casos de prueba y reporta base/tramo/monto.
import { prisma } from '../dist/lib/prisma.js';
import { calculateISAN, ISAN_2026 } from '../dist/services/regimes-programs.js';

const DOF = 'DOF 28-dic-2025 — Anexo 15 RMF 2026 (Tarifa ISAN, Art. 3 LFISAN)';
const TRAMOS = [
  { priceRangeMin: 0.01,      priceRangeMax: 383940.35, fixedAmount: 0.00,     marginalRate: 2 },
  { priceRangeMin: 383940.36, priceRangeMax: 460728.35, fixedAmount: 7678.67,  marginalRate: 5 },
  { priceRangeMin: 460728.36, priceRangeMax: 537516.64, fixedAmount: 11518.25, marginalRate: 10 },
  { priceRangeMin: 537516.65, priceRangeMax: 691092.34, fixedAmount: 19197.04, marginalRate: 15 },
  { priceRangeMin: 691092.35, priceRangeMax: null,      fixedAmount: 42233.35, marginalRate: 17 },
];

async function main() {
  console.log('isan_rates ANTES:', await prisma.iSANRate.count());
  await prisma.iSANRate.deleteMany({});
  for (const t of TRAMOS) {
    await prisma.iSANRate.create({
      data: {
        fractionCode: '8703', vehicleType: 'passenger',
        priceRangeMin: t.priceRangeMin, priceRangeMax: t.priceRangeMax,
        fixedAmount: t.fixedAmount, marginalRate: t.marginalRate,
        exempt: false, active: true, fiscalYear: 2026, notes: DOF,
      },
    });
  }
  console.log('isan_rates DESPUÉS:', await prisma.iSANRate.count(), '(5 tramos 8703 passenger)');
  console.log('Params escalares (mismo DOF):', JSON.stringify(ISAN_2026));

  console.log('\n──── calculateISAN real en prod (fracción 8703) ────');
  const casos = [
    { precio: 300000, nota: '≤356,934.05 → exento 100% (Art.8-II)' },
    { precio: 400000, nota: 'T2 5% → 50% (Art.8-II)' },
    { precio: 500000, nota: 'T3 10% completo' },
    { precio: 1200000, nota: 'T5 17% − descuento 7% (>1,060,189.93)' },
  ];
  for (const c of casos) {
    const r = await calculateISAN('87032301', c.precio, false);
    console.log(`\n  precio $${c.precio.toLocaleString('es-MX')} — ${c.nota}`);
    console.log(`    applies=${r.applies} exempt=${r.exempt} ISAN=$${r.amountMXN.toLocaleString('es-MX')}`);
    console.log(`    ${r.calculation}`);
  }
  // eléctrico
  const e = await calculateISAN('87034001', 600000, true);
  console.log(`\n  eléctrico/híbrido $600,000 → applies=${e.applies} exempt=${e.exempt} ISAN=$${e.amountMXN} (${e.calculation})`);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
