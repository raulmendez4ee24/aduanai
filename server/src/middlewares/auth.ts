import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from './error';
import { prisma } from '../lib/prisma';
import type { UserRole } from '@prisma/client';

export interface AuthRequest extends Request {
  userId?: string;
  tenantId?: string;
  userRole?: UserRole;
  emailVerified?: boolean;
  userStatus?: string;
}

export async function authenticate(req: AuthRequest, _res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return next(new AppError('Token de autenticación requerido', 401));
  }

  try {
    // Check blacklist
    const blacklisted = await prisma.tokenBlacklist.findUnique({ where: { token } });
    if (blacklisted) {
      return next(new AppError('Sesión expirada. Inicia sesión de nuevo.', 401));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret') as {
      userId: string;
      tenantId: string;
    };

    // Verify user exists and is active
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, active: true, role: true, tenantId: true, emailVerified: true, status: true },
    });

    if (!user || !user.active) {
      return next(new AppError('Usuario no encontrado o inactivo', 401));
    }

    // Verify tenant matches
    if (user.tenantId !== decoded.tenantId) {
      return next(new AppError('Token inválido', 401));
    }

    req.userId = decoded.userId;
    req.tenantId = decoded.tenantId;
    req.userRole = user.role;
    req.emailVerified = user.emailVerified;
    req.userStatus = user.status;
    next();
  } catch {
    return next(new AppError('Token inválido o expirado', 401));
  }
}

// Role-based access
export function requireRole(...roles: UserRole[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      return next(new AppError('No tienes permiso para esta acción', 403));
    }
    next();
  };
}

export function requireVerified(req: AuthRequest, _res: Response, next: NextFunction) {
  if (!req.emailVerified) {
    return next(new AppError('Email no verificado', 403));
  }
  next();
}
