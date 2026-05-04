import rateLimit from 'express-rate-limit';

export const authLoginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Demasiados intentos de login. Intenta en 1 minuto.' },
});

export const authRegisterLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Demasiados intentos de registro. Intenta en 1 minuto.' },
});

export const classifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Límite de clasificaciones alcanzado. Intenta en 1 minuto.' },
});

export const copilotLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Límite de consultas Copilot alcanzado. Intenta en 1 minuto.' },
});

export const demoLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Límite de demos alcanzado. Intenta en 1 hora.' },
});

export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Demasiadas solicitudes. Intenta en 1 minuto.' },
});

export const leadsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Demasiadas solicitudes. Intenta en 1 minuto.' },
});

export const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Demasiados intentos. Intenta en 15 minutos.' },
});
