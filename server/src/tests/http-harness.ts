/**
 * Arnés HTTP mínimo para probar routers REALES (authenticate + clienteScope +
 * requirePermission + errorHandler) sin levantar index.ts. Firma JWT con el
 * mismo secreto que usa `authenticate` y escucha en un puerto efímero.
 *
 * Uso:
 *   const srv = await levantar(app => { app.use('/api/inventory', inventoryRouter); });
 *   const r = await srv.llamar('GET', '/api/inventory/products', { token, clienteId });
 *   await srv.cerrar();
 */
import express, { type Express } from 'express';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../lib/config';
import { errorHandler } from '../middlewares/error';

export interface Respuesta { status: number; body: any }

export interface Servidor {
  llamar(metodo: string, ruta: string, opts?: { token?: string; clienteId?: string; body?: unknown }): Promise<Respuesta>;
  cerrar(): Promise<void>;
}

export function tokenDe(userId: string, tenantId: string): string {
  return jwt.sign({ userId, tenantId }, getJwtSecret(), { expiresIn: '10m' });
}

export async function levantar(montar: (app: Express) => void): Promise<Servidor> {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  montar(app);
  app.use(errorHandler);
  const server: Server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const addr = server.address();
  const base = typeof addr === 'object' && addr ? `http://127.0.0.1:${addr.port}` : '';
  return {
    async llamar(metodo, ruta, opts = {}) {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (opts.token) headers.authorization = `Bearer ${opts.token}`;
      if (opts.clienteId) headers['x-cliente-id'] = opts.clienteId;
      const r = await fetch(base + ruta, { method: metodo, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
      const text = await r.text();
      let body: any = text;
      try { body = JSON.parse(text); } catch { /* xlsx u otro binario */ }
      return { status: r.status, body };
    },
    cerrar: () => new Promise<void>((resolve, reject) => server.close(e => (e ? reject(e) : resolve()))),
  };
}
