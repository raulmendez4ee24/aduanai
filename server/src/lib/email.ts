import { Resend } from 'resend';
import type { Digest } from '../services/digest-semanal';

/** Tope por llamada a Resend: el SDK usa fetch sin señal; un socket colgado bloqueaba jobs enteros (digest). */
const EMAIL_TIMEOUT_MS = 15000;

let resend: Resend | null = null;
function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
    // Todas las llamadas del SDK pasan por fetchRequest(path, options) → fetch(url, options):
    // se inyecta AbortSignal.timeout en cada request.
    const original = resend.fetchRequest.bind(resend);
    resend.fetchRequest = <T>(path: string, options: Record<string, unknown> = {}) =>
      original<T>(path, { ...options, signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS) });
  }
  return resend;
}
/** ¿Hay proveedor de email configurado? (el digest no promete envíos sin esto) */
export function emailConfigurado(): boolean { return !!process.env.RESEND_API_KEY; }

const FROM = process.env.EMAIL_FROM || 'ADUANAI <noreply@aduanai.mx>';
const APP_URL = process.env.APP_URL || 'https://kanaduana-production.up.railway.app';

/** Envío genérico de email — usado por alertas de monitoring y otros casos no plantilla. */
export async function sendEmail(opts: { to: string; subject: string; html: string; text?: string }): Promise<void> {
  const r = getResend();
  if (!r) {
    console.warn(`[email] Resend not configured — skipping send to ${opts.to}: ${opts.subject}`);
    return;
  }
  await r.emails.send({
    from: FROM,
    to: opts.to,
    subject: opts.subject,
    html: emailBase(opts.subject, opts.html),
    text: opts.text,
  });
}

function emailBase(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:#1a1a1a;padding:28px 40px;text-align:center;">
              <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:1px;">ADUANAI</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9f9f9;padding:20px 40px;text-align:center;border-top:1px solid #eeeeee;">
              <p style="margin:0;color:#999999;font-size:12px;">© ${new Date().getFullYear()} ADUANAI — Plataforma de Comercio Exterior México</p>
              <p style="margin:6px 0 0;color:#bbbbbb;font-size:11px;">Si no solicitaste este correo, puedes ignorarlo con seguridad.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendVerificationEmail(to: string, name: string, code: string): Promise<void> {
  const subject = 'Verifica tu cuenta — ADUANAI';
  const body = `
    <h2 style="margin:0 0 8px;color:#1a1a1a;font-size:24px;font-weight:700;">Hola, ${name}</h2>
    <p style="margin:0 0 28px;color:#555555;font-size:15px;line-height:1.6;">Para activar tu cuenta en ADUANAI, ingresa el siguiente código de verificación:</p>
    <div style="text-align:center;margin:0 0 28px;">
      <div style="display:inline-block;background:#1a1a1a;color:#ffffff;font-size:36px;font-weight:700;letter-spacing:10px;padding:20px 36px;border-radius:8px;font-family:'Courier New',Courier,monospace;">${code}</div>
    </div>
    <p style="margin:0 0 8px;color:#888888;font-size:13px;text-align:center;">Este código expira en <strong>10 minutos</strong>.</p>
    <p style="margin:0;color:#888888;font-size:13px;text-align:center;">Si no creaste esta cuenta, ignora este mensaje.</p>
  `;
  const html = emailBase(subject, body);

  if (!process.env.RESEND_API_KEY) {
    console.log(`[EMAIL DEV] To: ${to} | Subject: ${subject} | Code: ${code}`);
    return;
  }

  await getResend()!.emails.send({ from: FROM, to, subject, html });
}

export async function sendPasswordResetEmail(to: string, name: string, code: string): Promise<void> {
  const subject = 'Recupera tu contraseña — ADUANAI';
  const body = `
    <h2 style="margin:0 0 8px;color:#1a1a1a;font-size:24px;font-weight:700;">Hola, ${name}</h2>
    <p style="margin:0 0 28px;color:#555555;font-size:15px;line-height:1.6;">Recibimos una solicitud para restablecer la contraseña de tu cuenta. Usa el siguiente código:</p>
    <div style="text-align:center;margin:0 0 28px;">
      <div style="display:inline-block;background:#1a1a1a;color:#ffffff;font-size:36px;font-weight:700;letter-spacing:10px;padding:20px 36px;border-radius:8px;font-family:'Courier New',Courier,monospace;">${code}</div>
    </div>
    <p style="margin:0 0 8px;color:#888888;font-size:13px;text-align:center;">Este código expira en <strong>10 minutos</strong>.</p>
    <p style="margin:0;color:#888888;font-size:13px;text-align:center;">Si no solicitaste este cambio, tu contraseña sigue siendo la misma.</p>
  `;
  const html = emailBase(subject, body);

  if (!process.env.RESEND_API_KEY) {
    console.log(`[EMAIL DEV] To: ${to} | Subject: ${subject} | Code: ${code}`);
    return;
  }

  await getResend()!.emails.send({ from: FROM, to, subject, html });
}

export async function sendWelcomeEmail(to: string, name: string): Promise<void> {
  const subject = 'Bienvenido a ADUANAI';
  const body = `
    <h2 style="margin:0 0 8px;color:#1a1a1a;font-size:24px;font-weight:700;">¡Bienvenido, ${name}!</h2>
    <p style="margin:0 0 20px;color:#555555;font-size:15px;line-height:1.6;">Tu cuenta está lista. Ya puedes acceder a todas las herramientas de ADUANAI para simplificar tu operación de comercio exterior.</p>
    <ul style="color:#555555;font-size:14px;line-height:2;padding-left:20px;margin:0 0 28px;">
      <li>Clasificación arancelaria con IA</li>
      <li>Cotización de impuestos de importación</li>
      <li>Expediente electrónico</li>
      <li>Control IMMEX Anexo 24/30</li>
    </ul>
    <div style="text-align:center;margin:0 0 8px;">
      <a href="${APP_URL}/dashboard" style="display:inline-block;background:#1a1a1a;color:#ffffff;font-size:15px;font-weight:600;padding:14px 32px;border-radius:6px;text-decoration:none;letter-spacing:0.3px;">Ir al Dashboard</a>
    </div>
  `;
  const html = emailBase(subject, body);

  if (!process.env.RESEND_API_KEY) {
    console.log(`[EMAIL DEV] To: ${to} | Subject: ${subject} | Welcome email sent`);
    return;
  }

  await getResend()!.emails.send({ from: FROM, to, subject, html });
}

export async function sendInvitationEmail(opts: {
  to: string;
  name: string;
  inviterName: string;
  tenantName: string;
  roles: string[];
  acceptUrl: string;
  expiresAt: Date;
}): Promise<void> {
  const subject = `${opts.inviterName} te invitó a ${opts.tenantName} en ADUANAI`;
  const expiry = opts.expiresAt.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  const body = `
    <h2 style="margin:0 0 8px;color:#1a1a1a;font-size:24px;font-weight:700;">Hola, ${opts.name}</h2>
    <p style="margin:0 0 20px;color:#555;font-size:15px;line-height:1.6;"><strong>${opts.inviterName}</strong> te invitó a unirte a <strong>${opts.tenantName}</strong> en ADUANAI con el siguiente rol:</p>
    <div style="background:#f5f5f5;border-radius:8px;padding:16px;margin:0 0 20px;">
      <p style="margin:0;color:#1a1a1a;font-size:14px;font-family:'Courier New',monospace;">${opts.roles.join(', ')}</p>
    </div>
    <div style="text-align:center;margin:0 0 20px;">
      <a href="${opts.acceptUrl}" style="display:inline-block;background:#059669;color:#ffffff;font-size:15px;font-weight:600;padding:14px 32px;border-radius:6px;text-decoration:none;">Aceptar invitación</a>
    </div>
    <p style="margin:0;color:#888;font-size:13px;text-align:center;">Esta invitación expira el ${expiry}.</p>
  `;
  const html = emailBase(subject, body);
  if (!process.env.RESEND_API_KEY) {
    console.log(`[EMAIL DEV] To: ${opts.to} | Invitation to ${opts.tenantName} | Accept: ${opts.acceptUrl}`);
    return;
  }
  await getResend()!.emails.send({ from: FROM, to: opts.to, subject, html });
}

export async function sendDemoInviteEmail(to: string, name: string, demoEmail: string, demoPassword: string, expiresAt: Date): Promise<void> {
  const subject = 'Tu acceso demo a ADUANAI';
  const expiryStr = expiresAt.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const body = `
    <h2 style="margin:0 0 8px;color:#1a1a1a;font-size:24px;font-weight:700;">Hola, ${name}</h2>
    <p style="margin:0 0 20px;color:#555555;font-size:15px;line-height:1.6;">Te hemos preparado una cuenta demo para que explores ADUANAI. Aquí están tus credenciales:</p>
    <div style="background:#f5f5f5;border-radius:8px;padding:20px;margin:0 0 20px;">
      <p style="margin:0 0 8px;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Email</p>
      <p style="margin:0 0 16px;color:#1a1a1a;font-size:16px;font-weight:600;font-family:'Courier New',monospace;">${demoEmail}</p>
      <p style="margin:0 0 8px;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Contraseña</p>
      <p style="margin:0;color:#1a1a1a;font-size:16px;font-weight:600;font-family:'Courier New',monospace;">${demoPassword}</p>
    </div>
    <div style="text-align:center;margin:0 0 20px;">
      <a href="${APP_URL}/login" style="display:inline-block;background:#1a1a1a;color:#ffffff;font-size:15px;font-weight:600;padding:14px 32px;border-radius:6px;text-decoration:none;">Iniciar sesión</a>
    </div>
    <p style="margin:0;color:#888888;font-size:13px;text-align:center;">Esta cuenta expira el ${expiryStr}.</p>
  `;
  const html = emailBase(subject, body);
  if (!process.env.RESEND_API_KEY) {
    console.log(`[EMAIL DEV] To: ${to} | Demo invite | Email: ${demoEmail} Pass: ${demoPassword}`);
    return;
  }
  await getResend()!.emails.send({ from: FROM, to, subject, html });
}

export async function sendDemoSummaryEmail(to: string, name: string, classifications: { description: string; fraction: string; confidence: number }[]): Promise<void> {
  const subject = 'Resumen de tu demo — ADUANAI';
  const classRows = classifications.map(c =>
    `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#555;font-size:13px;">${c.description.slice(0, 60)}...</td><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#1a1a1a;font-weight:600;font-family:'Courier New',monospace;font-size:14px;">${c.fraction}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#059669;font-weight:600;font-size:14px;">${c.confidence}%</td></tr>`
  ).join('');

  const body = `
    <h2 style="margin:0 0 8px;color:#1a1a1a;font-size:24px;font-weight:700;">Hola, ${name}</h2>
    <p style="margin:0 0 20px;color:#555555;font-size:15px;line-height:1.6;">Gracias por tu tiempo en la demo de ADUANAI. Aquí tienes un resumen de las clasificaciones que vimos:</p>
    ${classifications.length > 0 ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #eee;border-radius:8px;overflow:hidden;">
      <tr style="background:#f9f9f9;">
        <th style="padding:10px 12px;text-align:left;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;">Producto</th>
        <th style="padding:10px 12px;text-align:left;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;">Fracción</th>
        <th style="padding:10px 12px;text-align:left;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;">Confianza</th>
      </tr>
      ${classRows}
    </table>` : '<p style="color:#888;font-size:14px;">No se realizaron clasificaciones durante la demo.</p>'}
    <p style="margin:0 0 20px;color:#555555;font-size:15px;line-height:1.6;">¿Listo para empezar? Te ofrecemos un <strong>piloto gratuito de 30 días</strong> con acceso completo a la plataforma.</p>
    <div style="text-align:center;margin:0 0 8px;">
      <a href="https://wa.me/523326617755?text=Hola%2C%20me%20interesa%20el%20piloto%20de%20ADUANAI" style="display:inline-block;background:#1a1a1a;color:#ffffff;font-size:15px;font-weight:600;padding:14px 32px;border-radius:6px;text-decoration:none;">Solicitar piloto gratuito</a>
    </div>
  `;
  const html = emailBase(subject, body);
  if (!process.env.RESEND_API_KEY) {
    console.log(`[EMAIL DEV] To: ${to} | Demo summary | ${classifications.length} classifications`);
    return;
  }
  await getResend()!.emails.send({ from: FROM, to, subject, html });
}

function formatDateEs(d: Date): string {
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

export async function sendPilotActivatedEmail(to: string, name: string, companyName: string, loginEmail: string, password: string, pilotEndsAt: Date, classificationLimit: number): Promise<void> {
  const subject = 'Tu piloto de ADUANAI está activo';
  const endStr = formatDateEs(pilotEndsAt);
  const body = `
    <h2 style="margin:0 0 8px;color:#1a1a1a;font-size:24px;font-weight:700;">¡Bienvenido, ${name}!</h2>
    <p style="margin:0 0 20px;color:#555555;font-size:15px;line-height:1.6;">Hemos activado tu piloto gratuito de 30 días para <strong>${companyName}</strong>. Tienes acceso completo a todos los módulos:</p>
    <ul style="color:#555555;font-size:14px;line-height:2;padding-left:20px;margin:0 0 24px;">
      <li>Clasificación arancelaria con IA</li>
      <li>Cotizador de impuestos</li>
      <li>Expediente electrónico + Pre-validador</li>
      <li>Inventario IMMEX (Anexo 24/30)</li>
      <li>Fiscal Guardian + Auto-MVE</li>
      <li>Optimizador de logística</li>
    </ul>
    <div style="background:#f5f5f5;border-radius:8px;padding:20px;margin:0 0 20px;">
      <p style="margin:0 0 8px;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Email</p>
      <p style="margin:0 0 16px;color:#1a1a1a;font-size:16px;font-weight:600;font-family:'Courier New',monospace;">${loginEmail}</p>
      <p style="margin:0 0 8px;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Contraseña temporal</p>
      <p style="margin:0;color:#1a1a1a;font-size:16px;font-weight:600;font-family:'Courier New',monospace;">${password}</p>
    </div>
    <div style="background:#ecfdf5;border-radius:8px;padding:16px;margin:0 0 24px;">
      <p style="margin:0 0 4px;color:#065f46;font-size:13px;font-weight:600;">Tu piloto</p>
      <p style="margin:0;color:#047857;font-size:13px;line-height:1.6;">Vigencia: hasta el <strong>${endStr}</strong> · Hasta <strong>${classificationLimit}</strong> clasificaciones · Hasta <strong>3</strong> usuarios</p>
    </div>
    <div style="text-align:center;margin:0 0 20px;">
      <a href="${APP_URL}/login" style="display:inline-block;background:#1a1a1a;color:#ffffff;font-size:15px;font-weight:600;padding:14px 32px;border-radius:6px;text-decoration:none;">Entrar a mi cuenta</a>
    </div>
    <p style="margin:0;color:#888888;font-size:13px;text-align:center;">Cambia tu contraseña al primer acceso. ¿Dudas? Responde a este correo.</p>
  `;
  const html = emailBase(subject, body);
  if (!process.env.RESEND_API_KEY) {
    console.log(`[EMAIL DEV] To: ${to} | Pilot activated | Login: ${loginEmail} Pass: ${password} Ends: ${endStr}`);
    return;
  }
  await getResend()!.emails.send({ from: FROM, to, subject, html });
}

export async function sendPilot15DayEmail(to: string, name: string, companyName: string, classificationsUsed: number, classificationLimit: number): Promise<void> {
  const subject = '¿Cómo va tu experiencia con ADUANAI?';
  const body = `
    <h2 style="margin:0 0 8px;color:#1a1a1a;font-size:24px;font-weight:700;">Hola, ${name}</h2>
    <p style="margin:0 0 20px;color:#555555;font-size:15px;line-height:1.6;">Estás a mitad de tu piloto en <strong>${companyName}</strong>. Hasta ahora has realizado <strong>${classificationsUsed}</strong> de <strong>${classificationLimit}</strong> clasificaciones.</p>
    <p style="margin:0 0 20px;color:#555555;font-size:15px;line-height:1.6;">¿Te gustaría agendar una llamada de 20 minutos para resolver dudas, ver módulos que no has explorado y platicar sobre el siguiente paso?</p>
    <div style="text-align:center;margin:0 0 20px;">
      <a href="https://wa.me/523326617755?text=Hola%2C%20quiero%20agendar%20una%20llamada%20de%20seguimiento%20del%20piloto" style="display:inline-block;background:#25D366;color:#ffffff;font-size:15px;font-weight:600;padding:14px 32px;border-radius:6px;text-decoration:none;">Agendar llamada por WhatsApp</a>
    </div>
    <p style="margin:0;color:#888888;font-size:13px;text-align:center;">O responde a este correo con 2-3 horarios que te funcionen.</p>
  `;
  const html = emailBase(subject, body);
  if (!process.env.RESEND_API_KEY) {
    console.log(`[EMAIL DEV] To: ${to} | Pilot 15-day | Used: ${classificationsUsed}/${classificationLimit}`);
    return;
  }
  await getResend()!.emails.send({ from: FROM, to, subject, html });
}

export async function sendPilot25DayEmail(to: string, name: string, companyName: string, daysLeft: number, classificationsUsed: number): Promise<void> {
  const subject = `Tu piloto vence en ${daysLeft} días`;
  const body = `
    <h2 style="margin:0 0 8px;color:#1a1a1a;font-size:24px;font-weight:700;">Hola, ${name}</h2>
    <p style="margin:0 0 20px;color:#555555;font-size:15px;line-height:1.6;">Tu piloto para <strong>${companyName}</strong> vence en <strong>${daysLeft} días</strong>. Durante este periodo realizaste <strong>${classificationsUsed}</strong> clasificaciones con ADUANAI.</p>
    <div style="background:#fef3c7;border-radius:8px;padding:16px;margin:0 0 24px;">
      <p style="margin:0 0 4px;color:#92400e;font-size:13px;font-weight:600;">Contrata ahora y conserva tu historial</p>
      <p style="margin:0;color:#92400e;font-size:13px;line-height:1.6;">Al vencer tu piloto sin contratar, la cuenta se suspende. Podrás recuperar el acceso al momento de contratar.</p>
    </div>
    <div style="text-align:center;margin:0 0 12px;">
      <a href="https://wa.me/523326617755?text=Hola%2C%20quiero%20contratar%20ADUANAI" style="display:inline-block;background:#1a1a1a;color:#ffffff;font-size:15px;font-weight:600;padding:14px 32px;border-radius:6px;text-decoration:none;">Hablar con el fundador</a>
    </div>
    <p style="margin:0;color:#888888;font-size:13px;text-align:center;">Responde este correo si prefieres que te contactemos por email.</p>
  `;
  const html = emailBase(subject, body);
  if (!process.env.RESEND_API_KEY) {
    console.log(`[EMAIL DEV] To: ${to} | Pilot 25-day | ${daysLeft}d left, used ${classificationsUsed}`);
    return;
  }
  await getResend()!.emails.send({ from: FROM, to, subject, html });
}

export async function sendPilotExpiredEmail(to: string, name: string, companyName: string): Promise<void> {
  const subject = 'Tu periodo de prueba en ADUANAI terminó';
  const body = `
    <h2 style="margin:0 0 8px;color:#1a1a1a;font-size:24px;font-weight:700;">Hola, ${name}</h2>
    <p style="margin:0 0 20px;color:#555555;font-size:15px;line-height:1.6;">El piloto de <strong>${companyName}</strong> ha concluido. Tu historial, clasificaciones y datos siguen seguros en nuestros servidores.</p>
    <p style="margin:0 0 24px;color:#555555;font-size:15px;line-height:1.6;">Para recuperar el acceso basta con activar tu cuenta. ¿Seguimos?</p>
    <div style="text-align:center;margin:0 0 12px;">
      <a href="https://wa.me/523326617755?text=Hola%2C%20quiero%20reactivar%20mi%20cuenta%20ADUANAI" style="display:inline-block;background:#25D366;color:#ffffff;font-size:15px;font-weight:600;padding:14px 20px;border-radius:6px;text-decoration:none;margin:0 4px 8px;">Contratar por WhatsApp</a>
      <a href="mailto:hola@aduanai.mx?subject=Extension%20de%20piloto" style="display:inline-block;background:#f5f5f5;color:#1a1a1a;font-size:15px;font-weight:600;padding:14px 20px;border-radius:6px;text-decoration:none;margin:0 4px 8px;">Solicitar extensión</a>
    </div>
  `;
  const html = emailBase(subject, body);
  if (!process.env.RESEND_API_KEY) {
    console.log(`[EMAIL DEV] To: ${to} | Pilot expired for ${companyName}`);
    return;
  }
  await getResend()!.emails.send({ from: FROM, to, subject, html });
}

export async function sendContractActivatedEmail(to: string, name: string, companyName: string, planName: string, monthlyPrice: number, startDate: Date): Promise<void> {
  const subject = 'Tu cuenta ADUANAI está activa';
  const startStr = formatDateEs(startDate);
  const priceStr = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(monthlyPrice);
  const body = `
    <h2 style="margin:0 0 8px;color:#1a1a1a;font-size:24px;font-weight:700;">¡Bienvenido a bordo, ${name}!</h2>
    <p style="margin:0 0 20px;color:#555555;font-size:15px;line-height:1.6;">Tu contrato para <strong>${companyName}</strong> está activo. A partir de hoy tienes acceso completo a tu plan.</p>
    <div style="background:#ecfdf5;border-radius:8px;padding:16px;margin:0 0 24px;">
      <p style="margin:0 0 4px;color:#065f46;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Plan contratado</p>
      <p style="margin:0 0 10px;color:#047857;font-size:18px;font-weight:700;">${planName}</p>
      <p style="margin:0 0 4px;color:#065f46;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Costo mensual</p>
      <p style="margin:0 0 10px;color:#047857;font-size:16px;font-weight:600;">${priceStr} MXN</p>
      <p style="margin:0 0 4px;color:#065f46;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Inicio de contrato</p>
      <p style="margin:0;color:#047857;font-size:14px;">${startStr}</p>
    </div>
    <div style="text-align:center;margin:0 0 20px;">
      <a href="${APP_URL}/app" style="display:inline-block;background:#1a1a1a;color:#ffffff;font-size:15px;font-weight:600;padding:14px 32px;border-radius:6px;text-decoration:none;">Ir al Dashboard</a>
    </div>
    <p style="margin:0;color:#888888;font-size:13px;text-align:center;">Al iniciar sesión verás un onboarding guiado en 6 pasos.</p>
  `;
  const html = emailBase(subject, body);
  if (!process.env.RESEND_API_KEY) {
    console.log(`[EMAIL DEV] To: ${to} | Contract active | ${planName} ${priceStr}/mo`);
    return;
  }
  await getResend()!.emails.send({ from: FROM, to, subject, html });
}

export async function sendLeadThankYouEmail(to: string, name: string): Promise<void> {
  const subject = 'Gracias por tu interés — ADUANAI';
  const body = `
    <h2 style="margin:0 0 8px;color:#1a1a1a;font-size:24px;font-weight:700;">Hola, ${name}</h2>
    <p style="margin:0 0 20px;color:#555555;font-size:15px;line-height:1.6;">Gracias por tu interés en ADUANAI. El fundador se pondrá en contacto contigo en las próximas 24 horas para agendar una demo personalizada.</p>
    <p style="margin:0 0 20px;color:#555555;font-size:15px;line-height:1.6;">Mientras tanto, prueba nuestro clasificador de fracciones arancelarias con IA:</p>
    <div style="text-align:center;margin:0 0 28px;">
      <a href="${APP_URL}/#demo-clasificador" style="display:inline-block;background:#1a1a1a;color:#ffffff;font-size:15px;font-weight:600;padding:14px 32px;border-radius:6px;text-decoration:none;">Probar Clasificador IA</a>
    </div>
    <p style="margin:0;color:#888888;font-size:13px;text-align:center;">Si tienes alguna pregunta, responde a este email o escríbenos por WhatsApp.</p>
  `;
  const html = emailBase(subject, body);

  if (!process.env.RESEND_API_KEY) {
    console.log(`[EMAIL DEV] To: ${to} | Subject: ${subject} | Thank you email`);
    return;
  }

  await getResend()!.emails.send({ from: FROM, to, subject, html });
}

// ── Digest semanal (Operación 2026-08) ────────────────────────────────────
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const mxn = (n: number): string => `$${Math.round(Math.abs(n)).toLocaleString('es-MX')} MXN`;
const SEV_COLOR: Record<string, string> = { critical: '#be123c', high: '#c2410c', medium: '#b45309', low: '#0369a1' };

export function digestSemanalHtml(d: Digest): string {
  const f = (iso: string) => iso.slice(0, 10);
  const bloques = d.clientes.map(c => `
    <div style="margin:0 0 22px;padding:16px 18px;border:1px solid #eeeeee;border-radius:8px;">
      <p style="margin:0 0 10px;color:#1a1a1a;font-size:15px;font-weight:700;">${esc(c.nombre)}${c.rfc ? ` <span style="color:#888;font-weight:400;font-family:'Courier New',monospace;font-size:12px;">${esc(c.rfc)}</span>` : ''}</p>
      ${c.alertas.length ? `<p style="margin:0 0 4px;color:#555;font-size:12px;font-weight:600;">Alertas nuevas (${c.alertas.length})</p><ul style="margin:0 0 10px;padding-left:18px;color:#333;font-size:13px;line-height:1.5;">${c.alertas.slice(0, 8).map(a => `<li><span style="color:${SEV_COLOR[a.severity] ?? '#555'};font-weight:700;">[${esc(a.severity)}]</span> ${esc(a.title)}${a.estimatedImpactMXN != null ? ` — ${mxn(a.estimatedImpactMXN)}` : ''}${a.ruta ? ` <a href="${APP_URL}${esc(a.ruta)}" style="color:#1a1a1a;">abrir</a>` : ''}</li>`).join('')}${c.alertas.length > 8 ? `<li>… y ${c.alertas.length - 8} más</li>` : ''}</ul>` : ''}
      ${c.vencimientos.length ? `<p style="margin:0 0 4px;color:#555;font-size:12px;font-weight:600;">Importaciones temporales que vencen ≤30 días (${c.vencimientos.length})</p><ul style="margin:0 0 10px;padding-left:18px;color:#333;font-size:13px;line-height:1.5;">${c.vencimientos.slice(0, 8).map(v => `<li>${f(v.expirationDate)} (${v.dias}d) — pedimento ${esc(v.pedimento)}, ${esc(v.fractionCode)}, saldo ${v.saldo} ${esc(v.unit)}</li>`).join('')}${c.vencimientos.length > 8 ? `<li>… y ${c.vencimientos.length - 8} más</li>` : ''}</ul>` : ''}
      ${c.obligaciones.length ? `<p style="margin:0 0 4px;color:#555;font-size:12px;font-weight:600;">Obligaciones del calendario ≤30 días (${c.obligaciones.length})</p><ul style="margin:0;padding-left:18px;color:#333;font-size:13px;line-height:1.5;">${c.obligaciones.slice(0, 8).map(o => `<li>${o.estado === 'vencida' ? '<strong style="color:#be123c;">VENCIDA</strong>' : `${o.dias}d`} — ${esc(o.titulo)} (${f(o.fechaLimite)}) <a href="${APP_URL}/calendario/${esc(o.id)}" style="color:#1a1a1a;">ver</a></li>`).join('')}${c.obligaciones.length > 8 ? `<li>… y ${c.obligaciones.length - 8} más</li>` : ''}</ul>` : ''}
    </div>`).join('');
  return `
    <h2 style="margin:0 0 8px;color:#1a1a1a;font-size:22px;font-weight:700;">Resumen semanal — ${esc(d.tenantNombre)}</h2>
    <p style="margin:0 0 18px;color:#555555;font-size:14px;line-height:1.6;">Del ${d.periodo.desde} al ${d.periodo.hasta}: <strong>${d.totales.alertas}</strong> alertas nuevas · <strong>${d.totales.vencimientos}</strong> vencimientos ≤30d · <strong>${d.totales.obligaciones}</strong> obligaciones ≤30d${d.totales.impactoMXN > 0 ? ` · exposición estimada <strong>${mxn(d.totales.impactoMXN)}</strong>` : ''}.</p>
    ${bloques || '<p style="margin:0 0 18px;color:#555;font-size:14px;">Sin novedades esta semana.</p>'}
    <div style="text-align:center;margin:8px 0 0;"><a href="${APP_URL}/alertas" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:6px;">Ver alertas en ADUANAI</a></div>
  `;
}

export async function sendDigestSemanalEmail(to: string, d: Digest): Promise<void> {
  const subject = `Resumen semanal ADUANAI — ${d.tenantNombre} (${d.periodo.hasta})`;
  const r = getResend();
  if (!r) {
    console.warn(`[email] Resend not configured — digest NO enviado a ${to}`);
    throw new Error('canal no configurado (RESEND_API_KEY ausente)');
  }
  await r.emails.send({ from: FROM, to, subject, html: emailBase(subject, digestSemanalHtml(d)) });
}
