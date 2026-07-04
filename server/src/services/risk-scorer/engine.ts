/**
 * RISK SCORER — motor determinista (función pura; CERO LLM, CERO I/O).
 *
 * evaluate(signals, weights) → AssessmentResultado
 * - Exposición: Σ por factor de min(Σ puntos de reglas, peso del factor).
 * - Escudo: ítems completos aplicables / ítems aplicables (defensas NO restan exposición).
 * - Banda: matriz exposición × escudo, con banderas que elevan (69-B definitivo, EMBARGO activo).
 */
import type {
  AssessmentResultado, Banda, ChecklistResultado, FactorId,
  FactorResultado, ReglaResultado, Signals,
} from './types';
import { RISK_RULES, RULES_VERSION } from './rules';
import { SHIELD_ITEMS } from './shield';

export const DISCLAIMER =
  'Evaluación determinista de exposición con fundamentos citables (fuente y fecha de cotejo por regla). ' +
  'Las señales marcadas "declarado" provienen del usuario y NO fueron verificadas por el sistema. ' +
  'No constituye asesoría legal; valida con tu área legal/agente aduanal.';

export function evaluate(signals: Signals, weights: Record<string, number>): AssessmentResultado {
  // ── Dimensión A: exposición ──
  const porFactor = new Map<FactorId, ReglaResultado[]>();
  const banderas: string[] = [];

  for (const rule of RISK_RULES) {
    const puntos = Math.max(0, Math.min(rule.maxPuntos, rule.evaluar(signals)));
    const res: ReglaResultado = {
      id: rule.id, factor: rule.factor, descripcion: rule.descripcion,
      puntos, maxPuntos: rule.maxPuntos, bandera: rule.bandera,
      origenSenal: rule.origenSenal, fundamento: rule.fundamento,
    };
    if (puntos > 0 && rule.bandera) banderas.push(rule.bandera);
    const list = porFactor.get(rule.factor) ?? [];
    list.push(res);
    porFactor.set(rule.factor, list);
  }

  const factores: FactorResultado[] = [...porFactor.entries()].map(([factor, reglas]) => {
    const peso = weights[factor] ?? 0;
    const bruto = reglas.reduce((a, r) => a + r.puntos, 0);
    return { factor, puntos: Math.min(bruto, peso), peso, reglas };
  });
  const exposicion = Math.min(100, factores.reduce((a, f) => a + f.puntos, 0));

  // ── Dimensión B: escudo ──
  const checklist: ChecklistResultado[] = SHIELD_ITEMS.map(item => {
    const aplicable = item.aplica(signals);
    const completo = aplicable ? item.completo(signals) === true : false;
    return {
      id: item.id, grupo: item.grupo, descripcion: item.descripcion,
      aplicable, completo, origenSenal: item.origenSenal,
      accionSugerida: item.accionSugerida, fundamento: item.fundamento,
    };
  });
  const aplicables = checklist.filter(c => c.aplicable);
  const completos = aplicables.filter(c => c.completo);
  const escudoPct = aplicables.length === 0 ? 100 : Math.round((completos.length / aplicables.length) * 100);

  // ── Banda (matriz §4 del diseño) ──
  const banda = calcularBanda(exposicion, escudoPct, banderas);

  // ── Faltantes accionables: primero escudo incompleto (ordenado por grupo crítico), luego reglas activas declaradas ──
  const faltantes: string[] = [
    ...aplicables.filter(c => !c.completo).slice(0, 5).map(c => `${c.accionSugerida} [${c.fundamento.articulo}]`),
    ...factores.flatMap(f => f.reglas)
      .filter(r => r.puntos > 0 && r.origenSenal !== 'verificado')
      .sort((a, b) => b.puntos - a.puntos)
      .slice(0, 3)
      .map(r => `Atiende: ${r.descripcion} [${r.fundamento.articulo}]`),
  ].slice(0, 6);

  return {
    exposicion, escudoPct, banda, banderas: [...new Set(banderas)],
    factores, checklist, faltantes,
    rulesVersion: RULES_VERSION, disclaimer: DISCLAIMER,
  };
}

export function calcularBanda(exposicion: number, escudoPct: number, banderas: string[]): Banda {
  const conBandera = banderas.length > 0;
  const filaAlta = exposicion >= 60 || conBandera;
  if (filaAlta) {
    if (escudoPct >= 80) return 'NARANJA';
    if (escudoPct >= 50) return 'ROJO';
    return 'ROJO_CRITICO';
  }
  if (exposicion >= 30) {
    if (escudoPct >= 80) return 'AMARILLO';
    if (escudoPct >= 50) return 'NARANJA';
    return 'ROJO';
  }
  return escudoPct >= 50 ? 'VERDE' : 'AMARILLO';
}
