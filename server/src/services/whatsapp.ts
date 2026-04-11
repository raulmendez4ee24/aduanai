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

  msg += `\n💡 ${result.explanation.simple}\n`;
  msg += `\n⚖️ _${result.disclaimer}_`;

  return msg;
}

function formatQuoteForWhatsApp(result: Awaited<ReturnType<typeof calculateQuote>>): string {
  const fmt = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`;

  let msg = `💰 *Cotización de Importación*\n\n`;
  msg += `*Fracción:* \`${result.fraction}\`\n`;
  msg += `*Origen:* ${result.origin}\n`;
  msg += `*Valor:* ${fmt(result.valueMXN)}\n\n`;

  msg += `📊 *Desglose:*\n`;
  msg += `• IGI (${result.breakdown.igi.rate}%): ${fmt(result.breakdown.igi.amount)}\n`;
  msg += `• DTA (${result.breakdown.dta.rate}%): ${fmt(result.breakdown.dta.amount)}\n`;
  msg += `• IVA (${result.breakdown.iva.rate}%): ${fmt(result.breakdown.iva.amount)}\n`;
  if (result.breakdown.ieps) {
    msg += `• IEPS (${result.breakdown.ieps.rate}%): ${fmt(result.breakdown.ieps.amount)}\n`;
  }
  msg += `• Prevalidación: ${fmt(result.breakdown.prevalidation)}\n\n`;

  msg += `💵 *Total Landed Cost:*\n`;
  msg += `*${fmt(result.totalLandedCost)}*\n`;
  msg += `~$${result.totalLandedCostUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD~\n`;

  if (result.preferential && result.preferential.length > 0) {
    msg += `\n🌎 *Con tratado:*\n`;
    for (const p of result.preferential) {
      msg += `• ${p.treaty}: IGI ${p.igi}% (ahorro ${fmt(p.savings * result.valueMXN)})\n`;
    }
  }

  return msg;
}

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
