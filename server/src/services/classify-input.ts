import { AppError } from '../middlewares/error';

export type ClassifyInputValidation =
  | { ok: true }
  | { ok: false; reason: string };

const INPUT_GUIDANCE =
  'Agrega material, uso, composición y características técnicas del producto.';

export const NO_CANDIDATE_MESSAGE =
  `La descripción es insuficiente para identificar un candidato aplicable en el catálogo. ${INPUT_GUIDANCE}`;

/**
 * Umbral mínimo, puro y sin dependencias de red/DB, para evitar ejecutar el
 * pipeline de clasificación con descripciones que no aportan datos útiles.
 */
export function validateClassifyInput(description: string): ClassifyInputValidation {
  const trimmed = description.trim();
  const usefulCharacters = trimmed.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  const descriptiveWords = (trimmed.match(/\p{L}+/gu) ?? [])
    .filter(word => Array.from(word).length >= 3);

  if (!/\p{L}/u.test(trimmed)) {
    return {
      ok: false,
      reason: `La descripción es insuficiente: debe incluir texto descriptivo. ${INPUT_GUIDANCE}`,
    };
  }

  if (usefulCharacters < 8) {
    return {
      ok: false,
      reason: `La descripción es insuficiente: incluye menos de 8 caracteres útiles. ${INPUT_GUIDANCE}`,
    };
  }

  if (descriptiveWords.length < 2) {
    return {
      ok: false,
      reason: `La descripción es insuficiente: incluye menos de 2 palabras de al menos 3 letras. ${INPUT_GUIDANCE}`,
    };
  }

  return { ok: true };
}

export function createClassifyInputError(reason: string): AppError {
  return new AppError(reason, 422);
}

export function createNoCandidateError(): AppError {
  return new AppError(NO_CANDIDATE_MESSAGE, 422);
}

export function isNoCandidateCode(code: unknown): boolean {
  return typeof code === 'string' && /SIN_CANDIDATO/i.test(code);
}
