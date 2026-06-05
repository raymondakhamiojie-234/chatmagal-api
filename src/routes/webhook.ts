import { Router } from 'express';
import { verifyWebhook, processWebhook } from '../controllers/webhookController';
import { verifyMetaSignature } from '../middlewares/signatureMiddleware';

const router = Router();

router.get('/', verifyWebhook);
router.post('/', verifyMetaSignature, processWebhook);

export default router;
