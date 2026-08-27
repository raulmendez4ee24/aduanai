/**
 * Política de Origin para /api.
 *
 * El servidor sirve el cliente estático él mismo, así que toda petición del
 * navegador desde cualquier dominio que apunte a este servicio (Railway,
 * aduanaia.lat, www.aduanaia.lat, …) es same-origin: Origin.host === Host.
 * Esas se permiten siempre, sin depender de una lista manual (CLIENT_URL) que
 * se desactualiza cada vez que se agrega un dominio — así se rompió el login
 * por https://www.aduanaia.lat el 26-ago-2026.
 *
 * CLIENT_URL sigue valiendo para orígenes cross-origin legítimos (p. ej. un
 * front servido aparte) y localhost para desarrollo.
 */

const ORIGENES_DEV = ['http://localhost:5173', 'http://localhost:5174'];

export function parsearOrigenesPermitidos(clientUrl: string | undefined): string[] {
  if (!clientUrl) return [];
  return clientUrl.split(',').map(u => u.trim()).filter(Boolean);
}

/**
 * @param origin   Cabecera Origin (undefined en peticiones sin navegador).
 * @param host     Cabecera Host de la petición (puede llevar puerto).
 * @param lista    Orígenes explícitos (CLIENT_URL parseada).
 * @param protocolo Protocolo efectivo de la petición (req.protocol, honra
 *                  X-Forwarded-Proto con trust proxy). Si se da, el same-origin
 *                  exige mismo protocolo: no se acepta http contra https.
 */
export function esOrigenPermitido(
  origin: string | undefined,
  host: string | undefined,
  lista: string[],
  protocolo?: string,
): boolean {
  if (!origin) return true;
  if (ORIGENES_DEV.includes(origin) || lista.includes(origin)) return true;
  if (!host) return false;

  let url: URL;
  try { url = new URL(origin); } catch { return false; }

  const hostSinPuerto = host.split(':')[0].toLowerCase();
  if (url.hostname.toLowerCase() !== hostSinPuerto) return false;
  if (protocolo && url.protocol !== `${protocolo}:`) return false;
  return true;
}
