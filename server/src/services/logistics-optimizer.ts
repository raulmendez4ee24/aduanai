import { getAnthropicClient } from '../lib/anthropic';

// ============================================
// Dimensiones estándar de contenedores (cm, kg)
// ============================================

export const CONTAINER_SPECS: Record<string, { label: string; length: number; width: number; height: number; maxWeight: number }> = {
  CONTAINER_20FT:   { label: "Contenedor 20'",    length: 589,  width: 235, height: 239, maxWeight: 28200 },
  CONTAINER_40FT:   { label: "Contenedor 40'",    length: 1203, width: 235, height: 239, maxWeight: 28800 },
  CONTAINER_40FT_HC:{ label: "Contenedor 40' HC", length: 1203, width: 235, height: 269, maxWeight: 28560 },
  TRUCK_53FT:       { label: "Trailer 53'",       length: 1610, width: 245, height: 270, maxWeight: 20000 },
  TRUCK_48FT:       { label: "Trailer 48'",       length: 1463, width: 245, height: 270, maxWeight: 20000 },
  VAN_CLOSED:       { label: "Camioneta cerrada", length: 420,  width: 200, height: 200, maxWeight: 3500  },
};

// ============================================
// Cálculo de cubicaje
// ============================================

export interface CubicageResult {
  containerVolume: number;   // m³
  itemsVolume: number;       // m³
  totalWeight: number;       // kg
  volumeUsedPct: number;     // %
  weightUsedPct: number;     // %
  limitingFactor: 'volume' | 'weight' | 'both' | 'none';
  totalPieces: number;
  fitsAll: boolean;
  overflow: number;          // pieces that don't fit
  items: {
    description: string;
    quantity: number;
    fitQuantity: number;
    volumePerPiece: number;  // m³
    weightPerPiece: number;  // kg
    totalVolume: number;
    totalWeight: number;
  }[];
}

export function calculateCubicage(
  container: { length: number; width: number; height: number; maxWeight: number },
  items: { description: string; quantity: number; length: number; width: number; height: number; weight: number }[]
): CubicageResult {
  const containerVolM3 = (container.length * container.width * container.height) / 1_000_000;

  let totalVolume = 0;
  let totalWeight = 0;
  let totalPieces = 0;
  let overflow = 0;

  const itemResults = items.map(item => {
    const volPerPiece = (item.length * item.width * item.height) / 1_000_000;
    const totalItemVol = volPerPiece * item.quantity;
    const totalItemWeight = item.weight * item.quantity;

    totalVolume += totalItemVol;
    totalWeight += totalItemWeight;
    totalPieces += item.quantity;

    return {
      description: item.description,
      quantity: item.quantity,
      fitQuantity: item.quantity, // will adjust below
      volumePerPiece: volPerPiece,
      weightPerPiece: item.weight,
      totalVolume: totalItemVol,
      totalWeight: totalItemWeight,
    };
  });

  // Check if everything fits
  const volPct = containerVolM3 > 0 ? (totalVolume / containerVolM3) * 100 : 0;
  const wgtPct = container.maxWeight > 0 ? (totalWeight / container.maxWeight) * 100 : 0;
  const fitsAll = volPct <= 100 && wgtPct <= 100;

  // Calculate overflow if doesn't fit
  if (!fitsAll) {
    let runningVol = 0;
    let runningWgt = 0;

    for (const item of itemResults) {
      let fit = 0;
      for (let i = 0; i < item.quantity; i++) {
        const newVol = runningVol + item.volumePerPiece;
        const newWgt = runningWgt + item.weightPerPiece;
        if (newVol <= containerVolM3 && newWgt <= container.maxWeight) {
          fit++;
          runningVol = newVol;
          runningWgt = newWgt;
        } else {
          break;
        }
      }
      item.fitQuantity = fit;
      overflow += (item.quantity - fit);
    }
  }

  let limitingFactor: 'volume' | 'weight' | 'both' | 'none' = 'none';
  if (volPct > 100 && wgtPct > 100) limitingFactor = 'both';
  else if (volPct > wgtPct && volPct > 50) limitingFactor = 'volume';
  else if (wgtPct > volPct && wgtPct > 50) limitingFactor = 'weight';

  return {
    containerVolume: containerVolM3,
    itemsVolume: totalVolume,
    totalWeight,
    volumeUsedPct: Math.min(999, volPct),
    weightUsedPct: Math.min(999, wgtPct),
    limitingFactor,
    totalPieces,
    fitsAll,
    overflow,
    items: itemResults,
  };
}

// ============================================
// IA — Optimización de carga
// ============================================

export async function optimizeLoad(
  containerType: string,
  container: { length: number; width: number; height: number; maxWeight: number },
  items: { description: string; quantity: number; length: number; width: number; height: number; weight: number; stackable: boolean; fragile: boolean }[],
  cubicage: CubicageResult
) {
  const client = getAnthropicClient();

  const itemsList = items.map(i =>
    `- ${i.description}: ${i.quantity} pzas, ${i.length}x${i.width}x${i.height}cm, ${i.weight}kg/pza, ${i.stackable ? 'apilable' : 'NO apilable'}, ${i.fragile ? 'FRAGIL' : 'resistente'}`
  ).join('\n');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    system: `Eres un experto en logistica de comercio exterior y cubicaje de contenedores.
Analiza la carga y genera recomendaciones de acomodo optimizado.
Responde en JSON valido:
{
  "loadingOrder": ["descripcion del orden de carga paso a paso"],
  "arrangement": "descripcion general del acomodo optimo",
  "tips": ["consejos especificos"],
  "spaceOptimization": "que hacer con el espacio sobrante o como resolver el exceso",
  "alternativeContainer": "si aplica, sugerir otro contenedor",
  "estimatedLoadTime": "tiempo estimado de carga"
}`,
    messages: [{
      role: 'user',
      content: `Contenedor: ${containerType} (${container.length}x${container.width}x${container.height}cm, max ${container.maxWeight}kg)
Volumen usado: ${cubicage.volumeUsedPct.toFixed(1)}%, Peso usado: ${cubicage.weightUsedPct.toFixed(1)}%
${cubicage.fitsAll ? 'Todo cabe' : `NO cabe todo: ${cubicage.overflow} piezas de sobra`}
Factor limitante: ${cubicage.limitingFactor}

Items:
${itemsList}`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
  const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(jsonStr);
}

// ============================================
// IA — Análisis de costos
// ============================================

export async function analyzeCosts(
  items: { description: string; quantity: number; length: number; width: number; height: number; weight: number }[],
  origin?: string,
  destination?: string
) {
  const client = getAnthropicClient();

  const totalVol = items.reduce((s, i) => s + (i.length * i.width * i.height * i.quantity) / 1_000_000, 0);
  const totalWgt = items.reduce((s, i) => s + i.weight * i.quantity, 0);
  const totalPcs = items.reduce((s, i) => s + i.quantity, 0);

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    system: `Eres un experto en costos de logistica internacional y transporte maritimo/terrestre.
Genera un analisis comparativo de costos para diferentes opciones de envio.
Usa precios estimados realistas del mercado 2026 para rutas comunes a Mexico.
Responde en JSON valido:
{
  "options": [
    {
      "name": "nombre de la opcion",
      "containers": "descripcion (ej: 1x40ft HC)",
      "estimatedCost": 3500,
      "costPerPiece": 7.00,
      "volumeUtilization": 85,
      "pros": ["ventaja 1"],
      "cons": ["desventaja 1"]
    }
  ],
  "recommendation": "cual opcion recomiendas y por que",
  "savingsVsWorst": 2500,
  "notes": "notas adicionales"
}`,
    messages: [{
      role: 'user',
      content: `Necesito enviar mercancia:
- Volumen total: ${totalVol.toFixed(2)} m³
- Peso total: ${totalWgt.toFixed(0)} kg
- Total piezas: ${totalPcs}
- Origen: ${origin || 'Asia (China/Shenzhen)'}
- Destino: ${destination || 'Mexico (Manzanillo/Lazaro Cardenas)'}
- Items: ${items.map(i => `${i.quantity}x ${i.description} (${i.length}x${i.width}x${i.height}cm, ${i.weight}kg)`).join(', ')}

Compara: FCL 20ft, FCL 40ft, FCL 40ft HC, LCL consolidado, y cualquier otra opcion relevante.`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
  const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(jsonStr);
}
