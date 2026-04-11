import { getAnthropicClient } from '../lib/anthropic';

const SYSTEM_PROMPT = `Eres el Copilot de ADUANAI, un asistente experto en comercio exterior mexicano. Tu conocimiento abarca:

- Ley Aduanera 2026 y sus reformas
- Reglas Generales de Comercio Exterior (RGCE) 2026
- Tratados de Libre Comercio: TMEC, TLCUE, CPTPP, y demás vigentes
- Normas Oficiales Mexicanas (NOMs) aplicables a importación/exportación
- Regulaciones y Restricciones No Arancelarias (RRNA)
- Procedimientos aduaneros: despacho, tránsito, transbordo
- Regímenes aduaneros: definitivo, temporal, depósito fiscal, etc.
- IMMEX y maquiladoras
- Certificación IVA/IEPS (Anexo 31)
- Padrón de importadores y sectorial
- VUCEM y trámites electrónicos
- Sanciones y multas por incumplimiento

REGLAS:
1. Responde SIEMPRE citando el fundamento legal (artículo, regla, o norma)
2. Si no estás seguro, dilo explícitamente
3. Usa lenguaje claro pero profesional
4. Si la pregunta requiere asesoría legal específica, recomienda consultar con un agente aduanal o abogado especializado
5. Responde en español
6. Sé conciso pero completo

DISCLAIMER: Incluye al final de cada respuesta: "Esta información es orientativa. Consulte con su agente aduanal para asesoría específica."`;

export async function chatWithCopilot(
  message: string,
  history: { role: string; content: string }[]
): Promise<string> {
  const messages = [
    ...history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: message },
  ];

  const response = await getAnthropicClient().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages,
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}
