/**
 * Infraestructura — SOLO lo que se puede afirmar con evidencia (Ola 3, Verificación → "Tus datos").
 *
 * Regla: cada línea dice de dónde sale. Lo que no está verificado se etiqueta
 * "pendiente de confirmar con el proveedor"; ninguna fecha ni certificación se
 * inventa. Consumido por GET /api/verification/confianza.
 */

export type EstadoAfirmacion = 'verificado' | 'pendiente' | 'no_integrado' | 'en_evaluacion';

export interface Afirmacion {
  clave: string;
  titulo: string;
  estado: EstadoAfirmacion;
  detalle: string;
  evidencia: string;
}

export interface InfraInfo {
  proveedor: { nombre: string; region: string; regionEstado: EstadoAfirmacion; evidencia: string };
  afirmaciones: Afirmacion[];
  enlaces: { avisoPrivacidad: string; auditoria: string; verificarHash: string };
  generadoAt: string;
}

export function infraInfo(): InfraInfo {
  const enRailway = !!process.env.RAILWAY_ENVIRONMENT_NAME || !!process.env.RAILWAY_SERVICE_NAME;
  return {
    proveedor: {
      nombre: 'Railway (aplicación y PostgreSQL)',
      region: 'pendiente de confirmar con el proveedor',
      regionEstado: 'pendiente',
      evidencia: enRailway
        ? `Variables RAILWAY_* presentes en el proceso (servicio ${process.env.RAILWAY_SERVICE_NAME ?? '?'}, entorno ${process.env.RAILWAY_ENVIRONMENT_NAME ?? '?'}); la región no se expone como variable y no consta en la documentación del repo.`
        : 'Proceso fuera de Railway (entorno local/CI); en producción el despliegue vive en Railway (railway.toml, docs/BACKUPS.md).',
    },
    afirmaciones: [
      {
        clave: 'transito',
        titulo: 'Cifrado en tránsito (HTTPS + HSTS)',
        estado: 'verificado',
        detalle: 'Todo el tráfico va por HTTPS; el servidor manda Strict-Transport-Security (max-age 1 año, includeSubDomains, preload).',
        evidencia: 'server/src/index.ts → helmet({ hsts: { maxAge: 31536000, includeSubDomains: true, preload: true } }).',
      },
      {
        clave: 'reposo',
        titulo: 'Cifrado en reposo de la base de datos',
        estado: 'pendiente',
        detalle: 'Pendiente de confirmar con el proveedor: no hay evidencia en el repo ni en la configuración accesible de que el volumen de PostgreSQL esté cifrado en reposo.',
        evidencia: 'Sin constancia en railway.toml ni en docs/; no se afirma hasta verificarlo en la consola de Railway.',
      },
      {
        clave: 'backups',
        titulo: 'Backups cifrados',
        estado: 'pendiente',
        detalle: 'El pipeline existe y es fail-closed (pg_dump → gzip → cifrado simétrico autenticado (ver docs/BACKUPS.md) → SHA-256 → almacenamiento R2/S3); a la última verificación documentada (2026-07-11) no había variables BACKUP_* configuradas en producción ni backups administrados del volumen. No se afirma que hoy existan backups hasta que se configuren y se registre el primer BackupRecord exitoso.',
        evidencia: 'server/src/services/backup.ts; docs/BACKUPS.md ("Qué falta configurar en prod").',
      },
      {
        clave: 'audit',
        titulo: 'Bitácora con cadena de hashes',
        estado: 'verificado',
        detalle: 'Cada acción queda en AuditLog con SHA-256 encadenado al registro anterior del tenant; la cadena se verifica en Auditoría y cualquier hash es comprobable públicamente sin sesión.',
        evidencia: 'server/src/services/audit-service.ts (recordAudit/verifyChain); GET /verify/audit/:hash.',
      },
      {
        clave: 'ots',
        titulo: 'Sellado de tiempo (OpenTimestamps / Bitcoin)',
        estado: 'verificado',
        detalle: 'Las acciones críticas se anclan a Bitcoin vía OpenTimestamps (proof .ots descargable). No constituye ni sustituye una constancia NOM-151-SCFI.',
        evidencia: 'server/src/services/timestamp.ts; GET /verify/timestamp/:hash.',
      },
      {
        clave: 'nom151',
        titulo: 'Constancia de conservación NOM-151',
        estado: 'no_integrado',
        detalle: 'Constancia NOM-151 vía PSC: no integrada. Solo un Prestador de Servicios de Certificación autorizado puede emitirla.',
        evidencia: 'Leyenda vigente en Auditoría y en los reportes (routes/audit.ts).',
      },
      {
        clave: 'tenant',
        titulo: 'Aislamiento por empresa (multi-tenant)',
        estado: 'verificado',
        detalle: 'Toda consulta lleva tenantId; en producción una consulta sin tenant falla (guard estricto). Los accesos cross-tenant deliberados están marcados en código.',
        evidencia: 'server/src/lib/tenant-guard.ts; suite cross-tenant-isolation.test.ts.',
      },
      {
        clave: 'soc2',
        titulo: 'SOC 2 / ISO 27001',
        estado: 'en_evaluacion',
        detalle: 'En evaluación. No hay auditoría iniciada ni fecha comprometida; se informará aquí cuando exista un alcance y un auditor.',
        evidencia: 'Sin documento de alcance en el repo.',
      },
    ],
    enlaces: { avisoPrivacidad: '/privacidad', auditoria: '/audit', verificarHash: '/verify/audit/' },
    generadoAt: new Date().toISOString(),
  };
}
