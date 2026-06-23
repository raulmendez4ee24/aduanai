import { lookupCompliance } from '../src/services/compliance-lookup';
import { buildClassifierAlerts } from '../src/services/classifier-alerts';

async function show(frac: string, country: string, label: string) {
  const c = await lookupCompliance(frac, country);
  const regTypes = c.regulations.map(r => r.type);
  console.log(`\n[${label}] ${frac} + ${country}`);
  console.log(`  domesticOrigin: ${c.domesticOrigin}`);
  console.log(`  antidumping (cuota): ${c.antidumping ? c.antidumping.resolutionNumber + ' ' + c.antidumping.rate + c.antidumping.rateUnit : 'NINGUNA'}`);
  console.log(`  regulaciones: ${regTypes.length ? regTypes.join(', ') : '(ninguna)'} ${regTypes.includes('padron_sectorial') ? '← padrón' : ''}`);
  const alerts = await buildClassifierAlerts({ fractionCode: frac, description: label, countryOfOrigin: country, declaredValueUSD: 0.5, declaredQuantity: 1000 });
  console.log(`  alertas del clasificador: ${alerts.map(a => a.type).join(', ') || '(ninguna)'}`);
}

(async () => {
  console.log('=== TORNILLOS DE ACERO (73181599) — importación CN vs origen nacional MX ===');
  await show('73181599', 'CN', 'Tornillos China (importación real)');
  await show('73181599', 'MX', 'Tornillos México (origen nacional)');

  console.log('\n=== AGUACATE (cap 08) — MX vs CN ===');
  await show('08044001', 'MX', 'Aguacate Hass México');
  await show('08044001', 'PE', 'Aguacate Perú (importación)');
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
