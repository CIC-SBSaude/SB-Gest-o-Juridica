import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export function centralErrorHandler(
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Erro interno no servidor SB Gestão Jurídica';

  // Log seguro: nunca loga tokens, senhas ou a SUPABASE_SECRET_KEY
  console.error(`[API ERROR] ${req.method} ${req.path} - Status: ${statusCode} - Mensagem: ${message}`);

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      code: err.code || 'INTERNAL_SERVER_ERROR',
    },
  });
}
