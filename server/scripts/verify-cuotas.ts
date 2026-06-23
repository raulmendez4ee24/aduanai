// Verificación end-to-end del flujo de cuotas del Clasificador (compliance-lookup).
import { lookupCompliance } from '../dist/services/compliance-lookup.js';

const CASES: [string, string, string][] = [
  ['61091001', 'CN', 'Camisetas de algodón China — NO debe mostrar cuota (RES-TX-19 borrada)'],
  ['73181599', 'CN', 'Tornillos acero China — SÍ debe mostrar RES-29/2024'],
  ['73181504', 'CN', 'Tornillos pequeños (sin cuota exacta) — NO debe heredar por prefijo'],
  ['62034201', 'CN', 'Pantalones algodón China — NO debe mostrar cuota (RES-TX-22 borrada)'],
];

(async () => {
  for (const [frac, country, label] of CASES) {
    const r = await lookupCompliance(frac, country);
    const ad = r.antidumping;
    const cuotaAlert = (r.alertas || []).find((a) => a.toLowerCase().includes('cuota'));
    console.log(`\n${frac} + ${country}`);
    console.log(`  ${label}`);
    console.log(`  antidumping: ${ad ? `${ad.resolutionNumber} — ${ad.rate} ${ad.rateUnit}` : 'NULL (sin cuota) ✓'}`);
    console.log(`  alerta cuota: ${cuotaAlert || '(ninguna)'}`);
  }
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
