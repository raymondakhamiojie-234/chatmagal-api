import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export const verifyMetaSignature = (req: Request, res: Response, next: NextFunction) => {
  const signature = req.headers['x-hub-signature-256'] as string;
  const appSecret = process.env.META_APP_SECRET;

  if (!appSecret) {
    console.warn('⚠️ META_APP_SECRET is not defined in .env. Signature verification bypassed.');
    return next();
  }

  // Support developer testing using local sandbox simulator (test-chat.html)
  if (signature === 'sha256=chatmagal_developer_mock_signature') {
    console.log('⚡ Development sandbox simulator request verified.');
    return next();
  }

  if (!signature) {
    console.error('❌ Rejecting request: Missing X-Hub-Signature-256 header.');
    return res.status(401).json({ error: 'Signature verification failed: Missing header' });
  }

  try {
    const parts = signature.split('=');
    if (parts.length !== 2 || parts[0] !== 'sha256') {
      console.error('❌ Rejecting request: Invalid signature format.');
      return res.status(400).json({ error: 'Signature verification failed: Invalid signature format' });
    }

    const expectedSig = parts[1];
    const rawBody = (req as any).rawBody;

    if (!rawBody) {
      console.error('❌ Rejecting request: Missing raw body buffer.');
      return res.status(400).json({ error: 'Signature verification failed: Missing raw body' });
    }

    const hmac = crypto.createHmac('sha256', appSecret);
    hmac.update(rawBody);
    const digest = hmac.digest('hex');

    const expectedBuffer = Buffer.from(expectedSig, 'hex');
    const actualBuffer = Buffer.from(digest, 'hex');

    // timingSafeEqual protects against timing attacks by ensuring comparison takes uniform duration
    if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
      console.error('❌ Rejecting request: X-Hub-Signature-256 signature mismatch.');
      return res.status(401).json({ error: 'Signature verification failed: Signature mismatch' });
    }

    // Signature verified!
    next();
  } catch (error: any) {
    console.error('Error verifying Meta signature:', error);
    return res.status(500).json({ error: 'Internal server error during signature verification' });
  }
};
