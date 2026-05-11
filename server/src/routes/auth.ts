import { Router, Request } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/error';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { authLoginLimiter, authRegisterLimiter, forgotPasswordLimiter } from '../middlewares/rateLimit';
import { sendVerificationEmail, sendPasswordResetEmail, sendWelcomeEmail } from '../lib/email';
import { validateEmail, validatePhone, validateRFC, hasMXRecords } from '../lib/validators';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { recordAudit } from '../services/audit-service';
import { seedTenantRoles, autoAssignTenantAdmin } from '../services/permissions';

export const authRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const JWT_EXPIRES = '8h';
const REFRESH_EXPIRES = '7d';
const REFRESH_LONG_EXPIRES = '30d';
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const LOCK_MINUTES_LONG = 60;
const HARD_LOCK_THRESHOLD = 10;
const CODE_EXPIRY_MINUTES = 10;
const CODE_MAX_ATTEMPTS = 5;
const CODE_COOLDOWN_SECONDS = 60;

function getIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
}

function validatePassword(password: string): string | null {
  if (!password || password.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
  if (!/[A-Z]/.test(password)) return 'La contraseña debe incluir al menos una mayúscula';
  if (!/[a-z]/.test(password)) return 'La contraseña debe incluir al menos una minúscula';
  if (!/[0-9]/.test(password)) return 'La contraseña debe incluir al menos un número';
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) return 'La contraseña debe incluir al menos un símbolo (!@#$%...)';
  return null;
}

async function logAttempt(email: string, ip: string, userAgent: string | undefined, success: boolean, reason?: string) {
  await prisma.loginAttempt.create({
    data: { email, ip, userAgent: userAgent || null, success, reason },
  });
}

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ── REGISTER ──
authRouter.post('/register', authRegisterLimiter, async (req, res, next) => {
  try {
    const { email, password, name, companyName, phone, rfc } = req.body;

    if (!email || !password || !name) {
      throw new AppError('Email, contraseña y nombre son requeridos', 400);
    }

    const emailError = validateEmail(email);
    if (emailError) throw new AppError(emailError, 400);

    const mxOk = await hasMXRecords(email);
    if (!mxOk) throw new AppError('El dominio del email no tiene registros de correo válidos', 400);

    const pwError = validatePassword(password);
    if (pwError) throw new AppError(pwError, 400);

    if (phone) {
      const phoneError = validatePhone(phone);
      if (phoneError) throw new AppError(phoneError, 400);
    }

    if (rfc) {
      const rfcError = validateRFC(rfc);
      if (rfcError) throw new AppError(rfcError, 400);
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new AppError('El email ya está registrado', 409);

    const hashedPassword = await bcrypt.hash(password, 12);
    const ip = getIp(req);
    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60000);

    const tenant = await prisma.tenant.create({
      data: {
        name: companyName || name,
        plan: 'STARTER',
        users: {
          create: {
            email,
            password: hashedPassword,
            name,
            role: 'ADMIN',
            status: 'UNVERIFIED',
            emailVerified: false,
            phone: phone || null,
            rfc: rfc || null,
            lastLoginAt: new Date(),
            lastLoginIp: ip,
          },
        },
      },
      include: { users: true },
    });

    await seedTenantRoles(tenant.id);

    const user = tenant.users[0]!;
    await autoAssignTenantAdmin(user.id, tenant.id);

    await prisma.verificationCode.create({
      data: {
        userId: user.id,
        code,
        type: 'email_verify',
        expiresAt,
      },
    });

    const token = jwt.sign({ userId: user.id, tenantId: tenant.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    const refreshToken = jwt.sign({ userId: user.id, tenantId: tenant.id, type: 'refresh' }, JWT_SECRET, { expiresIn: REFRESH_EXPIRES });

    await logAttempt(email, ip, req.headers['user-agent'], true);

    // Send verification email (non-blocking on error)
    sendVerificationEmail(email, name, code).catch((err) =>
      console.error('[email] sendVerificationEmail error:', err)
    );

    res.status(201).json({
      token,
      refreshToken,
      expiresIn: 8 * 60 * 60,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: user.emailVerified,
        status: user.status,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── VERIFY EMAIL ──
authRouter.post('/verify-email', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { code } = req.body;
    if (!code) throw new AppError('Código requerido', 400);

    const verification = await prisma.verificationCode.findFirst({
      where: {
        userId: req.userId,
        type: 'email_verify',
        used: false,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!verification) throw new AppError('No hay un código de verificación activo', 400);

    if (verification.expiresAt < new Date()) {
      throw new AppError('El código ha expirado. Solicita uno nuevo.', 400);
    }

    if (verification.attempts >= CODE_MAX_ATTEMPTS) {
      throw new AppError('Demasiados intentos. Solicita un nuevo código.', 429);
    }

    if (verification.code !== code) {
      await prisma.verificationCode.update({
        where: { id: verification.id },
        data: { attempts: verification.attempts + 1 },
      });

      const remaining = CODE_MAX_ATTEMPTS - (verification.attempts + 1);
      if (remaining <= 0) {
        throw new AppError('Demasiados intentos. Solicita un nuevo código.', 429);
      }

      throw new AppError(`Código incorrecto. ${remaining} intento(s) restante(s).`, 400);
    }

    // Mark code used and verify user
    await prisma.$transaction([
      prisma.verificationCode.update({
        where: { id: verification.id },
        data: { used: true },
      }),
      prisma.user.update({
        where: { id: req.userId },
        data: { emailVerified: true, status: 'VERIFIED' },
      }),
    ]);

    // Send welcome email (non-blocking)
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { email: true, name: true },
    });
    if (user) {
      sendWelcomeEmail(user.email, user.name).catch((err) =>
        console.error('[email] sendWelcomeEmail error:', err)
      );
    }

    res.json({ status: 'ok', message: 'Email verificado' });
  } catch (err) {
    next(err);
  }
});

// ── RESEND CODE ──
authRouter.post('/resend-code', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const type: string = req.body.type || 'email_verify';

    // Check cooldown
    const lastCode = await prisma.verificationCode.findFirst({
      where: { userId: req.userId, type },
      orderBy: { createdAt: 'desc' },
    });

    if (lastCode) {
      const elapsedSeconds = (Date.now() - lastCode.createdAt.getTime()) / 1000;
      if (elapsedSeconds < CODE_COOLDOWN_SECONDS) {
        const remaining = Math.ceil(CODE_COOLDOWN_SECONDS - elapsedSeconds);
        throw new AppError(`Espera ${remaining} segundo(s) antes de solicitar un nuevo código.`, 429);
      }
    }

    // Invalidate old codes
    await prisma.verificationCode.updateMany({
      where: { userId: req.userId, type, used: false },
      data: { used: true },
    });

    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60000);

    await prisma.verificationCode.create({
      data: { userId: req.userId!, code, type, expiresAt },
    });

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { email: true, name: true },
    });
    if (!user) throw new AppError('Usuario no encontrado', 404);

    if (type === 'password_reset') {
      sendPasswordResetEmail(user.email, user.name, code).catch((err) =>
        console.error('[email] sendPasswordResetEmail error:', err)
      );
    } else {
      sendVerificationEmail(user.email, user.name, code).catch((err) =>
        console.error('[email] sendVerificationEmail error:', err)
      );
    }

    res.json({ status: 'ok', message: 'Código reenviado' });
  } catch (err) {
    next(err);
  }
});

// ── FORGOT PASSWORD ──
authRouter.post('/forgot-password', forgotPasswordLimiter, async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) throw new AppError('Email requerido', 400);

    const user = await prisma.user.findUnique({ where: { email } });

    // Always return success to avoid leaking user existence
    if (!user) {
      res.json({ status: 'ok', message: 'Si el email existe, recibirás un código' });
      return;
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60000);

    // Invalidate previous password_reset codes
    await prisma.verificationCode.updateMany({
      where: { userId: user.id, type: 'password_reset', used: false },
      data: { used: true },
    });

    await prisma.verificationCode.create({
      data: { userId: user.id, code, type: 'password_reset', expiresAt },
    });

    sendPasswordResetEmail(email, user.name, code).catch((err) =>
      console.error('[email] sendPasswordResetEmail error:', err)
    );

    res.json({ status: 'ok', message: 'Si el email existe, recibirás un código' });
  } catch (err) {
    next(err);
  }
});

// ── VERIFY RESET CODE ──
authRouter.post('/verify-reset-code', async (req, res, next) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) throw new AppError('Email y código requeridos', 400);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new AppError('Código inválido o expirado', 400);

    const verification = await prisma.verificationCode.findFirst({
      where: { userId: user.id, type: 'password_reset', used: false },
      orderBy: { createdAt: 'desc' },
    });

    if (!verification) throw new AppError('Código inválido o expirado', 400);

    if (verification.expiresAt < new Date()) {
      throw new AppError('El código ha expirado. Solicita uno nuevo.', 400);
    }

    if (verification.attempts >= CODE_MAX_ATTEMPTS) {
      throw new AppError('Demasiados intentos. Solicita un nuevo código.', 429);
    }

    if (verification.code !== code) {
      await prisma.verificationCode.update({
        where: { id: verification.id },
        data: { attempts: verification.attempts + 1 },
      });

      const remaining = CODE_MAX_ATTEMPTS - (verification.attempts + 1);
      if (remaining <= 0) {
        throw new AppError('Demasiados intentos. Solicita un nuevo código.', 429);
      }

      throw new AppError(`Código incorrecto. ${remaining} intento(s) restante(s).`, 400);
    }

    // Mark used
    await prisma.verificationCode.update({
      where: { id: verification.id },
      data: { used: true },
    });

    // Issue short-lived reset token (15 min)
    const resetToken = jwt.sign(
      { userId: user.id, type: 'reset' },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.json({ status: 'ok', resetToken });
  } catch (err) {
    next(err);
  }
});

// ── RESET PASSWORD ──
authRouter.post('/reset-password', async (req, res, next) => {
  try {
    const { resetToken, newPassword } = req.body;
    if (!resetToken || !newPassword) throw new AppError('Token y nueva contraseña requeridos', 400);

    let decoded: { userId: string; type: string };
    try {
      decoded = jwt.verify(resetToken, JWT_SECRET) as { userId: string; type: string };
    } catch {
      throw new AppError('Token inválido o expirado', 400);
    }

    if (decoded.type !== 'reset') throw new AppError('Token inválido', 400);

    const pwError = validatePassword(newPassword);
    if (pwError) throw new AppError(pwError, 400);

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: decoded.userId },
      data: { password: hashed },
    });

    res.json({ status: 'ok', message: 'Contraseña actualizada' });
  } catch (err) {
    next(err);
  }
});

// ── LOGIN ──
authRouter.post('/login', authLoginLimiter, async (req, res, next) => {
  try {
    const { email, password, rememberMe } = req.body;
    const ip = getIp(req);
    const ua = req.headers['user-agent'];

    if (!email || !password) {
      throw new AppError('Email y contraseña son requeridos', 400);
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { tenant: true },
    });

    if (!user) {
      await logAttempt(email, ip, ua, false, 'user_not_found');
      throw new AppError('Credenciales inválidas', 401);
    }

    // Account locked?
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minsLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      await logAttempt(email, ip, ua, false, 'account_locked');
      throw new AppError(`Cuenta bloqueada. Intenta en ${minsLeft} minutos.`, 423);
    }

    // Check password
    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      const attempts = user.failedLoginAttempts + 1;
      let lockedUntil: Date | null = null;

      if (attempts >= HARD_LOCK_THRESHOLD) {
        lockedUntil = new Date(Date.now() + LOCK_MINUTES_LONG * 60000);
      } else if (attempts >= MAX_ATTEMPTS) {
        lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60000);
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: attempts, lockedUntil },
      });

      await logAttempt(email, ip, ua, false, 'invalid_password');

      // Registrar SecurityEvent
      const { recordSecurityEvent, blockIP } = await import('../lib/security');
      await recordSecurityEvent({
        type: 'failed_login',
        severity: attempts >= HARD_LOCK_THRESHOLD ? 'high' : attempts >= MAX_ATTEMPTS ? 'medium' : 'low',
        ip,
        userId: user.id,
        email,
        details: { attempts, willBeLocked: lockedUntil != null },
      });

      // Bloqueo de IP: ≥10 intentos fallidos desde misma IP en última hora → 24h block
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const ipFailures = await prisma.loginAttempt.count({
        where: { ip, success: false, createdAt: { gte: oneHourAgo } },
      });
      if (ipFailures >= 10) {
        await blockIP(ip, `${ipFailures} login fails en última hora`, 24 * 60 * 60 * 1000);
      }

      if (lockedUntil) {
        const mins = attempts >= HARD_LOCK_THRESHOLD ? LOCK_MINUTES_LONG : LOCK_MINUTES;
        throw new AppError(`Demasiados intentos fallidos. Cuenta bloqueada por ${mins} minutos.`, 423);
      }

      throw new AppError('Credenciales inválidas', 401);
    }

    // Account inactive
    if (!user.active) {
      await logAttempt(email, ip, ua, false, 'account_inactive');
      throw new AppError('Cuenta desactivada. Contacta al administrador.', 403);
    }

    // Account banned
    if (user.status === 'BANNED') {
      await logAttempt(email, ip, ua, false, 'account_banned');
      throw new AppError('Cuenta suspendida', 403);
    }

    // Success — reset failed attempts
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ip,
      },
    });

    const refreshExpiry = rememberMe ? REFRESH_LONG_EXPIRES : REFRESH_EXPIRES;
    const token = jwt.sign({ userId: user.id, tenantId: user.tenantId }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    const refreshToken = jwt.sign(
      { userId: user.id, tenantId: user.tenantId, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: refreshExpiry }
    );

    await logAttempt(email, ip, ua, true);
    await recordAudit({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'LOGIN',
      entity: 'User',
      entityId: user.id,
      ipAddress: ip,
      userAgent: ua ?? null,
      endpoint: '/api/auth/login',
      method: 'POST',
      metadata: { rememberMe: !!rememberMe, role: user.role },
    });

    res.json({
      token,
      refreshToken,
      expiresIn: 8 * 60 * 60,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: user.emailVerified,
        status: user.status,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── REFRESH TOKEN ──
authRouter.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) throw new AppError('Refresh token requerido', 400);

    // Check blacklist
    const blacklisted = await prisma.tokenBlacklist.findUnique({ where: { token: refreshToken } });
    if (blacklisted) throw new AppError('Token inválido', 401);

    const decoded = jwt.verify(refreshToken, JWT_SECRET) as { userId: string; tenantId: string; type?: string };
    if (decoded.type !== 'refresh') throw new AppError('Token inválido', 401);

    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user || !user.active) throw new AppError('Usuario no encontrado', 401);

    const newToken = jwt.sign({ userId: user.id, tenantId: decoded.tenantId }, JWT_SECRET, { expiresIn: JWT_EXPIRES });

    res.json({ token: newToken, expiresIn: 8 * 60 * 60 });
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError) return next(new AppError('Token inválido o expirado', 401));
    next(err);
  }
});

// ── LOGOUT ──
authRouter.post('/logout', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      const decoded = jwt.decode(token) as { exp?: number } | null;
      const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 8 * 3600000);

      await prisma.tokenBlacklist.create({
        data: { token, expiresAt },
      });
    }

    const { refreshToken } = req.body;
    if (refreshToken) {
      const decoded = jwt.decode(refreshToken) as { exp?: number } | null;
      const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 7 * 86400000);
      await prisma.tokenBlacklist.create({
        data: { token: refreshToken, expiresAt },
      }).catch(() => {});
    }

    if (req.tenantId) {
      await recordAudit({
        tenantId: req.tenantId,
        userId: req.userId,
        action: 'LOGOUT',
        entity: 'User',
        entityId: req.userId,
        ipAddress: getIp(req),
        userAgent: req.headers['user-agent'] ?? null,
        endpoint: '/api/auth/logout',
        method: 'POST',
      });
    }

    res.json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
});

// ── CHANGE PASSWORD ──
authRouter.post('/change-password', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) throw new AppError('Contraseña actual y nueva requeridas', 400);

    const pwError = validatePassword(newPassword);
    if (pwError) throw new AppError(pwError, 400);

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) throw new AppError('Usuario no encontrado', 404);

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw new AppError('Contraseña actual incorrecta', 401);

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });

    res.json({ status: 'ok', message: 'Contraseña actualizada' });
  } catch (err) {
    next(err);
  }
});

// ── ME (current user) ──
authRouter.get('/me', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        emailVerified: true,
        status: true,
        onboardingCompleted: true,
        onboardingStep: true,
        lastLoginAt: true,
        lastLoginIp: true,
        createdAt: true,
        tenant: {
          select: { id: true, name: true, plan: true, status: true },
        },
      },
    });
    if (!user) throw new AppError('Usuario no encontrado', 404);
    res.json({ status: 'ok', data: user });
  } catch (err) {
    next(err);
  }
});

// ── PILOT / TENANT STATUS (for banner and limits) ──
authRouter.get('/tenant-status', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId },
      include: { _count: { select: { classifications: true, users: true } } },
    });
    if (!tenant) throw new AppError('Empresa no encontrada', 404);

    const now = Date.now();
    const pilotDaysLeft = tenant.pilotEndsAt ? Math.max(0, Math.ceil((tenant.pilotEndsAt.getTime() - now) / 86400000)) : null;
    const contractDaysLeft = tenant.contractEndsAt ? Math.ceil((tenant.contractEndsAt.getTime() - now) / 86400000) : null;

    res.json({
      status: 'ok',
      data: {
        id: tenant.id,
        name: tenant.name,
        plan: tenant.plan,
        status: tenant.status,
        isPilot: tenant.plan === 'PILOT',
        pilotStartedAt: tenant.pilotStartedAt,
        pilotEndsAt: tenant.pilotEndsAt,
        pilotDaysLeft,
        classificationsUsed: tenant._count.classifications,
        classificationLimit: tenant.classificationLimit,
        usersCount: tenant._count.users,
        userLimit: tenant.userLimit,
        contractStartedAt: tenant.contractStartedAt,
        contractEndsAt: tenant.contractEndsAt,
        contractDaysLeft,
        monthlyPrice: tenant.monthlyPrice,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── ONBOARDING PROGRESS ──
authRouter.patch('/onboarding', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { step, completed } = req.body as { step?: number; completed?: boolean };
    const data: Record<string, unknown> = {};
    if (typeof step === 'number') data.onboardingStep = step;
    if (typeof completed === 'boolean') data.onboardingCompleted = completed;
    const user = await prisma.user.update({
      where: { id: req.userId },
      data,
      select: { id: true, onboardingCompleted: true, onboardingStep: true },
    });
    res.json({ status: 'ok', data: user });
  } catch (err) {
    next(err);
  }
});

// ── ACCEPT INVITATION (público — el invitado crea su cuenta) ──
authRouter.post('/accept-invitation', async (req, res, next) => {
  try {
    const { token, password } = req.body as { token?: string; password?: string };
    if (!token || !password) throw new AppError('Token y contraseña requeridos', 400);

    const inv = await prisma.invitation.findUnique({ where: { token } });
    if (!inv) throw new AppError('Invitación no encontrada o inválida', 404);
    if (inv.status !== 'PENDING') throw new AppError(`Invitación ya ${inv.status.toLowerCase()}`, 400);
    if (inv.expiresAt < new Date()) {
      await prisma.invitation.update({ where: { id: inv.id }, data: { status: 'EXPIRED' } });
      throw new AppError('Invitación expirada — pide a tu admin que reenvíe', 410);
    }

    const pwError = validatePassword(password);
    if (pwError) throw new AppError(pwError, 400);

    const dup = await prisma.user.findUnique({ where: { email: inv.email }, select: { id: true } });
    if (dup) throw new AppError('Ya existe una cuenta con este email — usa "Olvidé contraseña"', 409);

    const hashedPassword = await bcrypt.hash(password, 12);

    // Crear usuario en el tenant de la invitación
    const user = await prisma.user.create({
      data: {
        email: inv.email, password: hashedPassword, name: inv.name,
        role: 'USER', emailVerified: true, status: 'VERIFIED',
        tenantId: inv.tenantId, lastLoginAt: new Date(), lastLoginIp: getIp(req),
      },
    });

    // Asignar roles iniciales (la invitación ya pasó validación SOD al crearse)
    const tenantRoles = await prisma.tenantRole.findMany({
      where: { tenantId: inv.tenantId, code: { in: inv.initialRoleCodes }, active: true },
      select: { id: true, code: true },
    });
    for (const r of tenantRoles) {
      await prisma.userTenantRole.create({
        data: {
          userId: user.id, tenantId: inv.tenantId, roleId: r.id,
          assignedBy: inv.invitedBy, reason: `invitation:${inv.id}`, active: true,
        },
      });
      await prisma.permissionAuditLog.create({
        data: {
          tenantId: inv.tenantId, userId: inv.invitedBy,
          action: 'ROLE_ASSIGNED', targetUserId: user.id, roleId: r.id,
          details: { roleCode: r.code, viaInvitation: inv.id } as unknown as object,
          ipAddress: getIp(req) ?? null,
        },
      });
    }

    await prisma.invitation.update({
      where: { id: inv.id },
      data: { status: 'ACCEPTED', acceptedAt: new Date(), acceptedUserId: user.id },
    });

    const jwtToken = jwt.sign({ userId: user.id, tenantId: inv.tenantId }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    const refreshToken = jwt.sign({ userId: user.id, tenantId: inv.tenantId, type: 'refresh' }, JWT_SECRET, { expiresIn: REFRESH_EXPIRES });

    res.status(201).json({
      token: jwtToken, refreshToken, expiresIn: 8 * 60 * 60,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, emailVerified: true, status: 'VERIFIED' },
      assignedRoles: tenantRoles.map(r => r.code),
    });
  } catch (err) { next(err); }
});

// ── LOGIN HISTORY ──
authRouter.get('/login-history', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { email: true } });
    if (!user) throw new AppError('Usuario no encontrado', 404);

    const attempts = await prisma.loginAttempt.findMany({
      where: { email: user.email },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, ip: true, userAgent: true, success: true, reason: true, createdAt: true },
    });

    res.json({ status: 'ok', data: attempts });
  } catch (err) {
    next(err);
  }
});
