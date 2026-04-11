import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from './error';

export interface AuthRequest extends Request {
  userId?: string;
  tenantId?: string;
}

export function authenticate(req: AuthRequest, _res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return next(new AppError('Token de autenticación requerido', 401));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret') as {
      userId: string;
      tenantId: string;
    };
    req.userId = decoded.userId;
    req.tenantId = decoded.tenantId;
    next();
  } catch {
    return next(new AppError('Token inválido o expirado', 401));
  }
}
