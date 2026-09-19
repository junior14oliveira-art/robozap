import { Request, Response, NextFunction } from 'express';
import { logger } from '../index';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error({ err }, 'Unhandled error');

  // Multer errors
  if (err.message.includes('Arquivo inválido')) {
    res.status(400).json({ error: err.message });
    return;
  }

  // Default
  res.status(500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Erro interno do servidor.'
      : err.message,
  });
}
