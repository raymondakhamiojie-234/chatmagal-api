import { Request, Response, NextFunction } from 'express';

// Augment the Express Request type to include the user property
declare global {
  namespace Express {
    interface Request {
      user?: {
        workspaceId: string;
        isTeamLeader: boolean;
      };
    }
  }
}

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  let token = '';

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token as string;
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }

  try {
    let workspaceId = token;
    let isTeamLeader = false;

    // Handle dummy/test keys and split credentials
    if (token === 'dummy-token' || token === 'test-workspace-id') {
      workspaceId = 'test-workspace-id';
      isTeamLeader = true; // Default test environment workspace defaults to leader access
    } else if (token.includes(':')) {
      const parts = token.split(':');
      workspaceId = parts[0];
      isTeamLeader = parts[1] === 'leader';
    }

    req.user = {
      workspaceId,
      isTeamLeader,
    };

    next();
  } catch (error) {
    return res.status(403).json({ error: 'Forbidden: Invalid token' });
  }
};
