import { Router } from 'express';
import { onboardWhatsApp } from '../controllers/authController';

const router = Router();

router.post('/', onboardWhatsApp);

export default router;
