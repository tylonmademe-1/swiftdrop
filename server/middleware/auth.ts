import { Request, Response, NextFunction } from 'express';
import { UserRepository, UserRow, SessionRow } from '../db/users';

export interface AuthenticatedRequest extends Request {
  user?: UserRow;
  session?: SessionRow;
  userRepo?: UserRepository;
}

export function createAuthMiddleware(userRepo: UserRepository) {
  return {
    optionalAuth: (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
      req.userRepo = userRepo;
      const rawToken = req.cookies?.swiftdrop_session || req.headers.authorization?.replace(/^Bearer\s+/, '');
      if (rawToken) {
        const result = userRepo.validateSession(rawToken);
        if (result) {
          req.user = result.user;
          req.session = result.session;
        }
      }
      next();
    },

    requireAuth: (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      req.userRepo = userRepo;
      const rawToken = req.cookies?.swiftdrop_session || req.headers.authorization?.replace(/^Bearer\s+/, '');
      if (!rawToken) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const result = userRepo.validateSession(rawToken);
      if (!result) {
        res.status(401).json({ error: 'Session invalid or expired' });
        return;
      }

      req.user = result.user;
      req.session = result.session;
      next();
    }
  };
}
