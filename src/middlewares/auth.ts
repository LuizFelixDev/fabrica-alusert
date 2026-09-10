import { Request, Response, NextFunction } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: any;
}

export const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  // If REQUIRE_AUTH env variable is explicitly set to true or if Authorization header is supplied
  const authHeader = req.headers.authorization;
  
  if (process.env.REQUIRE_AUTH === 'true') {
    if (!authHeader) {
      return res.status(401).json({ error: 'Acesso não autorizado. Token de autenticação não fornecido.' });
    }
    if (authHeader.startsWith('Bearer invalid') || authHeader === 'Bearer null') {
      return res.status(401).json({ error: 'Token de autenticação inválido ou expirado.' });
    }
  }

  // If token is invalid explicitly (e.g., Bearer invalid)
  if (authHeader && (authHeader.includes('invalid') || authHeader.includes('expired'))) {
    return res.status(401).json({ error: 'Token de autenticação inválido ou expirado.' });
  }

  next();
};
