/**
 * Cliente directo a OpenTimestamps calendar servers — sin dependencia npm.
 *
 * OpenTimestamps agrupa miles de hashes en un Merkle tree y publica la raíz
 * en una transacción Bitcoin (~1 c/hora). El proof inicial es "incomplete":
 * solo prueba que el hash llegó al calendar. Después de la confirmación de
 * Bitcoin (~10 min) y suficiente cantidad de bloques (~6h), el calendar
 * devuelve un proof "completo" con la attestation Bitcoin embebida.
 *
 * Costo: GRATIS — el calendar agrupa muchos hashes en una sola transacción.
 *
 * Endpoints públicos:
 *   POST {calendar}/digest         — submit hash
 *   GET  {calendar}/timestamp/<hex>— recuperar/upgradear proof
 *
 * Verificación independiente: cualquier persona puede tomar el .ots, instalar
 * opentimestamps-client (`pip install opentimestamps-client`) y correr
 * `ots verify`.
 */

import { logger } from './logger';

const CALENDARS = [
  'https://alice.btc.calendar.opentimestamps.org',
  'https://bob.btc.calendar.opentimestamps.org',
  'https://finney.calendar.eternitywall.com',
];

const PRIMARY = CALENDARS[0]!;

export interface OTSSubmitResult {
  proof: Buffer;
  calendarUrl: string;
}

/**
 * Envía un hash SHA-256 a un calendar OpenTimestamps. Devuelve el proof
 * inicial (incomplete) que comprueba que el hash llegó al calendar pero
 * todavía no está anclado en Bitcoin.
 */
export async function submitToCalendar(contentHashHex: string): Promise<OTSSubmitResult> {
  if (!/^[0-9a-fA-F]{64}$/.test(contentHashHex)) {
    throw new Error(`contentHash inválido (esperado SHA-256 hex 64 chars): ${contentHashHex}`);
  }
  const hashBytes = Buffer.from(contentHashHex, 'hex');

  let lastError: Error | null = null;
  for (const calendar of CALENDARS) {
    try {
      const res = await fetch(`${calendar}/digest`, {
        method: 'POST',
        body: new Uint8Array(hashBytes),
        // 8 segundos de timeout con AbortController
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`${calendar} respondió ${res.status}`);
      const proof = Buffer.from(await res.arrayBuffer());
      if (proof.length === 0) throw new Error('proof vacío');
      return { proof, calendarUrl: calendar };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logger.warn(`Calendar ${calendar} falló, probando siguiente`, {
        action: 'ots_calendar_fallback',
        errorMessage: lastError.message,
      });
    }
  }
  throw lastError ?? new Error('Todos los calendars fallaron');
}

/**
 * Pide al calendar el proof actualizado. Si todavía está pending devuelve
 * el mismo proof. Si Bitcoin ya confirmó, devuelve uno expandido con la
 * attestation Bitcoin.
 */
export async function upgradeFromCalendar(contentHashHex: string, calendarUrl?: string): Promise<Buffer | null> {
  const calendar = calendarUrl ?? PRIMARY;
  try {
    const res = await fetch(`${calendar}/timestamp/${contentHashHex}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) return null; // todavía no agregado al calendario
    if (!res.ok) throw new Error(`upgrade ${calendar} respondió ${res.status}`);
    const proof = Buffer.from(await res.arrayBuffer());
    return proof.length > 0 ? proof : null;
  } catch (err) {
    logger.warn('Upgrade falló', { action: 'ots_upgrade_failed', errorMessage: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/**
 * Parser simple del proof .ots para detectar attestation Bitcoin.
 *
 * Formato simplificado: el proof contiene una serie de operaciones (cada una
 * con un opcode) y attestations al final. La attestation Bitcoin está
 * marcada con el "tag" 0x05 88 60 0c c2 8d 41 18 (bitcoin block).
 * Si esa secuencia aparece, hay attestation Bitcoin y los siguientes bytes
 * codifican el block height (varint).
 *
 * NO reemplaza un parser completo — pero sirve para detectar si está confirmado.
 */
const BITCOIN_TAG = Buffer.from('0588960d73d71901', 'hex'); // attestation tag for Bitcoin per OTS spec

export interface ParsedAttestation {
  hasBitcoinAttestation: boolean;
  bitcoinBlockHeight: number | null;
  // Bytes raw del proof — para descarga
  proofSizeBytes: number;
}

export function parseProof(proof: Buffer): ParsedAttestation {
  // Buscar attestation Bitcoin via signature de bytes
  // El tag oficial OTS para Bitcoin attestation es 0x0588960d73d71901
  const idx = proof.indexOf(BITCOIN_TAG);
  if (idx === -1) {
    return { hasBitcoinAttestation: false, bitcoinBlockHeight: null, proofSizeBytes: proof.length };
  }
  // Después del tag (8 bytes) viene un varint con la longitud y otro varint con el block height
  let pos = idx + BITCOIN_TAG.length;
  // Saltar length varint
  const lengthRead = readVarint(proof, pos);
  if (!lengthRead) return { hasBitcoinAttestation: true, bitcoinBlockHeight: null, proofSizeBytes: proof.length };
  pos = lengthRead.next;
  // Leer block height varint
  const heightRead = readVarint(proof, pos);
  return {
    hasBitcoinAttestation: true,
    bitcoinBlockHeight: heightRead?.value ?? null,
    proofSizeBytes: proof.length,
  };
}

function readVarint(buf: Buffer, pos: number): { value: number; next: number } | null {
  let value = 0;
  let shift = 0;
  let p = pos;
  while (p < buf.length) {
    const byte = buf[p]!;
    value |= (byte & 0x7f) << shift;
    p++;
    if ((byte & 0x80) === 0) return { value, next: p };
    shift += 7;
    if (shift >= 64) return null;
  }
  return null;
}

/**
 * Estima el timestamp de confirmación a partir del block height de Bitcoin.
 * Block 0 = 2009-01-03; cada bloque ≈ 10 minutos.
 * Aproximación útil cuando no se puede consultar el explorador.
 */
export function estimateBitcoinTimestamp(blockHeight: number): Date {
  const genesis = new Date('2009-01-03T18:15:05Z').getTime();
  return new Date(genesis + blockHeight * 10 * 60 * 1000);
}

export const CALENDAR_URL = PRIMARY;
export { CALENDARS };
