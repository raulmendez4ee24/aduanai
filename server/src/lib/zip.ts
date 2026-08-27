/**
 * Escritor/lector ZIP mínimo sin dependencias (Ola 2, 27-ago-2026).
 *
 * Formato ZIP "stored" (método 0, sin compresión): local file header +
 * datos + central directory + end of central directory. Suficiente para el
 * paquete de auditoría (PDF/HTML/JSON ya comprimidos o pequeños) y evita
 * meter `archiver`/`jszip` al bundle. CRC-32 estándar. Nombres en UTF-8
 * (bit 11 del flag). Sin ZIP64: tope práctico 4 GB / 65 535 entradas —
 * muy por encima de cualquier expediente.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface EntradaZip {
  nombre: string;
  contenido: Buffer | string;
  fecha?: Date;
}

function fechaDos(d: Date): { time: number; date: number } {
  const y = Math.max(1980, d.getUTCFullYear());
  const time = (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2);
  const date = ((y - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate();
  return { time, date };
}

/** Construye un ZIP stored en memoria. Nombres duplicados se rechazan. */
export function crearZip(entradas: EntradaZip[], fechaBase: Date = new Date()): Buffer {
  const vistos = new Set<string>();
  const locales: Buffer[] = [];
  const centrales: Buffer[] = [];
  let offset = 0;
  for (const e of entradas) {
    const nombre = e.nombre.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!nombre) throw new Error('Entrada ZIP sin nombre');
    if (vistos.has(nombre)) throw new Error(`Entrada ZIP duplicada: ${nombre}`);
    vistos.add(nombre);
    const datos = Buffer.isBuffer(e.contenido) ? e.contenido : Buffer.from(e.contenido, 'utf8');
    const nombreBuf = Buffer.from(nombre, 'utf8');
    const crc = crc32(datos);
    const { time, date } = fechaDos(e.fecha ?? fechaBase);

    const local = Buffer.alloc(30 + nombreBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);        // versión necesaria
    local.writeUInt16LE(0x0800, 6);    // flags: UTF-8
    local.writeUInt16LE(0, 8);         // método: stored
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(datos.length, 18);
    local.writeUInt32LE(datos.length, 22);
    local.writeUInt16LE(nombreBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nombreBuf.copy(local, 30);

    const central = Buffer.alloc(46 + nombreBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);      // versión creada por
    central.writeUInt16LE(20, 6);      // versión necesaria
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(datos.length, 20);
    central.writeUInt32LE(datos.length, 24);
    central.writeUInt16LE(nombreBuf.length, 28);
    central.writeUInt16LE(0, 30);      // extra
    central.writeUInt16LE(0, 32);      // comentario
    central.writeUInt16LE(0, 34);      // disco
    central.writeUInt16LE(0, 36);      // atributos internos
    central.writeUInt32LE(0, 38);      // atributos externos
    central.writeUInt32LE(offset, 42); // offset del local header
    nombreBuf.copy(central, 46);

    locales.push(local, datos);
    centrales.push(central);
    offset += local.length + datos.length;
  }
  const dirTam = centrales.reduce((a, b) => a + b.length, 0);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(0, 4);
  fin.writeUInt16LE(0, 6);
  fin.writeUInt16LE(entradas.length, 8);
  fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(dirTam, 12);
  fin.writeUInt32LE(offset, 16);
  fin.writeUInt16LE(0, 20);
  return Buffer.concat([...locales, ...centrales, fin]);
}

export interface EntradaZipLeida {
  nombre: string;
  tamano: number;
  crc: number;
  offset: number;
}

/** Lee la tabla central (central directory) de un ZIP: nombres, tamaños, CRC. */
export function listarEntradasZip(zip: Buffer): EntradaZipLeida[] {
  // End of central directory: buscar la firma desde el final (comentario ≤ 64 KB).
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65535); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP inválido: sin end of central directory');
  const total = zip.readUInt16LE(eocd + 10);
  let pos = zip.readUInt32LE(eocd + 16);
  const out: EntradaZipLeida[] = [];
  for (let n = 0; n < total; n++) {
    if (zip.readUInt32LE(pos) !== 0x02014b50) throw new Error(`ZIP inválido: entrada central ${n} corrupta`);
    const crc = zip.readUInt32LE(pos + 16);
    const tamano = zip.readUInt32LE(pos + 24);
    const nLen = zip.readUInt16LE(pos + 28);
    const eLen = zip.readUInt16LE(pos + 30);
    const cLen = zip.readUInt16LE(pos + 32);
    const offset = zip.readUInt32LE(pos + 42);
    const nombre = zip.subarray(pos + 46, pos + 46 + nLen).toString('utf8');
    out.push({ nombre, tamano, crc, offset });
    pos += 46 + nLen + eLen + cLen;
  }
  return out;
}

/** Extrae el contenido de una entrada stored (para verificación en tests). */
export function leerEntradaZip(zip: Buffer, entrada: EntradaZipLeida): Buffer {
  const p = entrada.offset;
  if (zip.readUInt32LE(p) !== 0x04034b50) throw new Error('ZIP inválido: local header');
  const nLen = zip.readUInt16LE(p + 26);
  const eLen = zip.readUInt16LE(p + 28);
  const inicio = p + 30 + nLen + eLen;
  return zip.subarray(inicio, inicio + entrada.tamano);
}
