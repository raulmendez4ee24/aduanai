import { lookupCompliance } from '../src/services/compliance-lookup';
import { checkAntidumpingDuty, calculateExposure } from '../src/services/antidumping';
import { generateAntidumpingAlerts } from '../src/services/alert-generator';

const has = (s: string) => s.includes('$2.07 USD/kg');
const wrong = (s: string) => /2\.07\s*%/.test(s);

(async () => {
  console.log('=== RES-29/2024 (2.07 USD/kg) — formato en cada módulo ===\n');

  // 1) compliance-lookup → Clasificador alerts + Cotizador
  const c = await lookupCompliance('73181599', 'CN');
  const cuotaAlerta = (c.alertas || []).find(a => a.toLowerCase().includes('cuota')) || '';
  console.log('[compliance-lookup] alerta:', cuotaAlerta);
  console.log('  → "$2.07 USD/kg":', has(cuotaAlerta), '| "2.07%" (malo):', wrong(cuotaAlerta));

  // 2) antidumping checkAntidumpingDuty (cuotas activas / banner)
  const duties = await checkAntidumpingDuty({ fractionCode: '73181599', countryOfOrigin: 'CN', weightKg: 1500, valueUSD: 100000, units: 1500 });
  const calc = duties[0]?.calculation || '';
  console.log('\n[antidumping.checkAntidumpingDuty] calculation:', calc);
  console.log('  → "$2.07 USD/kg":', has(calc), '| "2.07%" (malo):', wrong(calc));

  // 3) alert-generator → alerta de la campana (el que estaba roto)
  const alerts = await generateAntidumpingAlerts('demo-tenant');
  const a = alerts.find(x => (x.affectedFraction === '73181599'));
  if (a) {
    console.log('\n[alert-generator] title:', a.title);
    console.log('[alert-generator] content:', a.content.slice(0, 180));
    console.log('  → "$2.07 USD/kg":', has(a.title + a.content), '| "2.07%" (malo):', wrong(a.title + a.content));
  } else {
    console.log('\n[alert-generator] (sin alerta para 73181599 — el demo no tiene imports recientes que matcheen; verifico con otra cuota %):');
    const anyAlert = alerts[0];
    if (anyAlert) console.log('  ejemplo de alerta generada:', anyAlert.title);
    else console.log('  (no se generaron alertas antidumping para el demo)');
  }
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
