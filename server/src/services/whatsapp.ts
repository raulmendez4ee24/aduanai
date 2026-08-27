import { classifyProduct } from './classifier';
import { calculateQuote } from './quoter';

const YCLOUD_API_KEY = process.env.YCLOUD_API_KEY;
const YCLOUD_FROM = process.env.YCLOUD_FROM_NUMBER;

interface WhatsAppMessage {
  from: string;
  body: string;
  timestamp: string;
}

export async function handleWhatsAppMessage(msg: WhatsAppMessage): Promise<string> {
  const text = msg.body.trim().toLowerCase();

  // Comando: clasificar
  if (text.startsWith('clasificar ') || text.startsWith('clasifica ')) {
    const product = msg.body.replace(/^(clasificar|clasifica)\s+/i, '').trim();
    if (product.length < 3) {
      return '❌ Describe el producto con al menos 3 caracteres.\n\nEjemplo: *Clasificar tornillos de acero inoxidable*';
    }

    try {
      const result = await classifyProduct(product);
      return formatClassificationForWhatsApp(result);
    } catch {
      return '❌ Error al clasificar. Intenta de nuevo en unos segundos.';
    }
  }

  // Comando: cotizar
  if (text.startsWith('cotizar ')) {
    const parts = msg.body.replace(/^cotizar\s+/i, '').trim().split(/\s+/);
    if (parts.length < 3) {
      return '❌ Formato: *Cotizar [fracción] [valor] [origen]*\n\nEjemplo: *Cotizar 8471.30.01 5000 China*';
    }

    const [fractionCode, valueStr, ...originParts] = parts;
    const customsValue = Number(valueStr);
    const origin = originParts.join(' ');

    if (isNaN(customsValue) || customsValue <= 0) {
      return '❌ El valor debe ser un número positivo.\n\nEjemplo: *Cotizar 8471.30.01 5000 China*';
    }

    try {
      const result = await calculateQuote({
        fractionCode,
        customsValue,
        origin,
        incoterm: 'CIF',
        currency: 'USD',
      });
      return formatQuoteForWhatsApp(result);
    } catch {
      return '❌ Error al cotizar. Verifica la fracción arancelaria.';
    }
  }

  // Comando: ayuda o mensaje no reconocido
  return `🤖 *ADUANAI Bot* — Comercio Exterior con IA

Comandos disponibles:

📦 *Clasificar [producto]*
Clasifica un producto en fracción TIGIE
_Ej: Clasificar laptops HP de 15 pulgadas_

💰 *Cotizar [fracción] [valor USD] [origen]*
Calcula impuestos de importación
_Ej: Cotizar 8471.30.01 5000 China_

❓ *Ayuda*
Muestra este mensaje

---
_ADUANAI — Tu asistente de comercio exterior_`;
}

function formatClassificationForWhatsApp(result: Awaited<ReturnType<typeof classifyProduct>>): string {
  const conf = result.confidence >= 80 ? '🟢' : result.confidence >= 60 ? '🟡' : '🔴';

  let msg = `📦 *Clasificación Arancelaria*\n\n`;
  msg += `*Fracción:* \`${result.fraction.code}\`\n`;
  msg += `${result.fraction.description}\n\n`;
  msg += `${conf} *Confianza:* ${result.confidence}%\n`;
  msg += `*Arancel NMF:* ${result.tariffs.nmf}%\n`;

  // Preferenciales
  const prefs = Object.entries(result.tariffs.preferential)
    .filter(([, rate]) => rate < result.tariffs.nmf)
    .map(([treaty, rate]) => `${treaty}: ${rate}%`)
    .join(', ');
  if (prefs) {
    msg += `*Preferenciales:* ${prefs}\n`;
  }

  // Regulaciones
  if (result.regulations.rrna.length > 0) {
    msg += `\n⚠️ *RRNA:* ${result.regulations.rrna.join(', ')}\n`;
  }
  if (result.regulations.noms.length > 0) {
    msg += `📋 *NOMs:* ${result.regulations.noms.join(', ')}\n`;
  }

  if (result.explanation?.simple) msg += `\n💡 ${result.explanation.simple}\n`;
  if (result.disclaimer) msg += `\n⚖️ _${result.disclaimer}_`;

  return msg;
}

function formatQuoteForWhatsApp(result: Awaited<ReturnType<typeof calculateQuote>>): string {
  const fmt = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`;
  const parts: string[] = [];

  // Estado de cuota compensatoria
  const ad = result.compensatorias;
  const cv = result.breakdown.countervailingDuty;
  const hasCalculatedCV = !!cv && cv.amount > 0;
  const needsWeightForCV =
    !!ad &&
    (ad.rateType === 'specific_USD_kg' || ad.rateType === 'specific_USD_unit') &&
    !hasCalculatedCV;
  const rateLabel = (m: NonNullable<typeof ad>): string =>
    m.rateType === 'specific_USD_kg' ? `$${m.rate} USD/kg`
    : m.rateType === 'specific_USD_unit' ? `$${m.rate} ${m.rateUnit}`
    : `${m.rate}%`;

  // ── Bloque 1: cuota CALCULADA (banner crítico arriba)
  if (hasCalculatedCV && ad && cv) {
    parts.push(
      [
        `🚨 *CUOTA COMPENSATORIA*`,
        `Resolución: ${ad.resolutionNumber ?? ad.decree ?? 's/n'}`,
        `Cuota: ${rateLabel(ad)}`,
        `Monto: ${fmt(cv.amount)}`,
        `⚠️ Omitir = multa 130-150% (Art. 178 LA)`,
      ].join('\n'),
    );
  }

  // ── Bloque 2: needsWeight — cuota aplicable pero falta dato para calcular
  if (needsWeightForCV && ad) {
    const dataNeeded = ad.rateType === 'specific_USD_kg' ? 'PESO en kg' : 'NÚMERO de unidades';
    parts.push(
      [
        `🚨 *CÁLCULO INCOMPLETO*`,
        `Esta fracción tiene cuota compensatoria de ${rateLabel(ad)}. ` +
          `Falta declarar el ${dataNeeded} para calcularla. ` +
          `La cotización actual NO incluye la cuota — declara el dato antes de usar este cálculo en pedimento.`,
      ].join('\n'),
    );
  }

  // ── Bloque 3: encabezado
  parts.push(
    [
      `💰 *Cotización de Importación*`,
      `*Fracción:* \`${result.fraction}\``,
      `*Origen:* ${result.origin}`,
      `*Valor:* ${fmt(result.valueMXN)}`,
    ].join('\n'),
  );

  // ── Bloque 4: desglose
  const desglose: string[] = [`📊 *Desglose:*`];
  desglose.push(`• IGI (${result.breakdown.igi.rate}%): ${fmt(result.breakdown.igi.amount)}`);
  desglose.push(`• DTA (${result.breakdown.dta.rate}%): ${fmt(result.breakdown.dta.amount)}`);
  if (hasCalculatedCV && cv) {
    desglose.push(`• Cuota comp: ${fmt(cv.amount)}`);
  }
  if (result.breakdown.ieps) {
    desglose.push(`• IEPS (${result.breakdown.ieps.rate}%): ${fmt(result.breakdown.ieps.amount)}`);
  }
  desglose.push(`• IVA (${result.breakdown.iva.rate}%): ${fmt(result.breakdown.iva.amount)}`);
  desglose.push(`• Prevalidación: ${fmt(result.breakdown.prevalidation)}`);
  parts.push(desglose.join('\n'));

  // ── Bloque 5: total
  parts.push(
    [
      `💵 *Total Landed Cost:*`,
      `*${fmt(result.totalLandedCost)}*`,
      `~$${result.totalLandedCostUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD~`,
    ].join('\n'),
  );

  const tcDate = result.exchangeRateDate.slice(0, 10);
  parts.push(`💱 *TC ${result.exchangeRateSource} del ${tcDate}:* $${result.exchangeRate.toFixed(4)} MXN/USD`);
  if (result.exchangeRateWarning) parts.push(`⚠️ ${result.exchangeRateWarning}`);

  // ── Bloque 6: tratados preferenciales
  if (result.preferential && result.preferential.length > 0) {
    const lines = result.preferential.map(
      p => p.available && p.igi != null
        ? `• ${p.treaty}: IGI ${p.igi}% (ahorro ${fmt(p.savings * result.valueMXN)})`
        : `• ${p.note ?? `Tasa preferencial ${p.treaty} no disponible, se cotiza NMF.`}`,
    );
    parts.push(`🌎 *Con tratado:*\n${lines.join('\n')}`);
  }

  // ── Bloque 7: otras alertas (padrones, NOMs, etc.) — excluye las ya cubiertas
  // El quoter inyecta dos clases de alerta que ya tienen su propio bloque:
  //   1) "Cuota compensatoria $X USD/kg aplicable a CN — ..." (compliance-lookup)
  //   2) "🚨 CÁLCULO INCOMPLETO: ..." (quoter.ts cuando needsWeight)
  const otherAlerts = result.alertas.filter(a => {
    const lower = a.toLowerCase();
    return !lower.includes('cálculo incompleto') &&
           !lower.includes('calculo incompleto') &&
           !lower.startsWith('cuota compensatoria');
  });
  if (otherAlerts.length > 0) {
    parts.push(`⚠️ *Otras alertas:*\n${otherAlerts.map(a => `• ${a}`).join('\n')}`);
  }

  // ── Bloque 8: disclaimer Art. 54 LA (mismo tono que el banner web del Quoter)
  parts.push(
    `⚖️ _Estimación de apoyo técnico. La responsabilidad legal corresponde al importador y agente aduanal certificado (Art. 54 LA). Verifica los datos contra fuentes oficiales antes de declarar pedimento._`,
  );

  // ── Empaquetado final con respeto al límite ~4096 chars de WhatsApp
  const LIMIT = 3800;
  const full = parts.join('\n\n');
  if (full.length <= LIMIT) {
    return full;
  }

  // Modo recortado — prioridad: alertas críticas, encabezado, total, alertas, disclaimer
  const critical: string[] = [];
  for (const p of parts) {
    if (p.includes('CUOTA COMPENSATORIA') || p.includes('CÁLCULO INCOMPLETO')) {
      critical.push(p);
    }
  }
  const hdr = parts.find(p => p.includes('Cotización de Importación'));
  if (hdr) critical.push(hdr);
  const tot = parts.find(p => p.includes('Total Landed Cost'));
  if (tot) critical.push(tot);
  const oa = parts.find(p => p.includes('Otras alertas'));
  if (oa) critical.push(oa);
  critical.push(parts[parts.length - 1]); // disclaimer
  critical.push(`_Detalle completo en plataforma web — mensaje recortado por límite WhatsApp._`);
  return critical.join('\n\n');
}

/** ¿Hay proveedor de WhatsApp configurado? (el digest no promete envíos sin esto) */
export function whatsappConfigurado(): boolean { return !!(YCLOUD_API_KEY && YCLOUD_FROM); }

export async function sendWhatsAppMessage(to: string, body: string): Promise<void> {
  if (!YCLOUD_API_KEY || !YCLOUD_FROM) {
    console.warn('WhatsApp no configurado: falta YCLOUD_API_KEY o YCLOUD_FROM_NUMBER');
    return;
  }

  await fetch('https://api.ycloud.com/v2/whatsapp/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': YCLOUD_API_KEY,
    },
    body: JSON.stringify({
      from: YCLOUD_FROM,
      to,
      type: 'text',
      text: { body },
    }),
  });
}
