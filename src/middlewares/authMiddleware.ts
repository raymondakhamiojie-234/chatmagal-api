import { Request, Response, NextFunction } from 'express';

// Augment the Express Request type to include the user property
declare global {
  namespace Express {
    interface Request {
      user?: {
        workspaceId: string;
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

  // DUMMY IMPLEMENTATION: In production, verify the JWT properly.
  // Here we assume the token is a simple string for demonstration,
  // or we just decode it mockingly. Let's assume the token IS the workspace ID for testing.
  // Or we decode a fake JWT structure. Let's fake it.

  try {
    // Fake JWT verification logic
    // We'll mock that the verified payload has a workspaceId.
    // Replace this with `jwt.verify(token, secret)`
    const decoded = { workspaceId: token === 'dummy-token' ? 'test-workspace-id' : token };

    req.user = {
      workspaceId: decoded.workspaceId,
    };

    next();
  } catch (error) {
    return res.status(403).json({ error: 'Forbidden: Invalid token' });
  }
};
