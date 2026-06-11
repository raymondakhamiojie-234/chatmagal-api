import { Router } from 'express';
import { sendBroadcast } from '../controllers/broadcastController';
import { authMiddleware } from '../middlewares/authMiddleware';
import {
  getWorkspace,
  getContacts,
  getMessages,
  getCampaigns,
  sendSupportReply,
  refillWallet,
  getMediaProxy,
  getTransactions,
  assignContact,
  createWorkspace,
  toggleContactBot,
  cancelCampaign,
  updateWorkspaceMeta
} from '../controllers/dashboardController';

const router = Router();

// Public onboarding / registration route
router.post('/workspaces', createWorkspace);

// Public API Config route (used by frontend to retrieve META_APP_ID for Facebook Login SDK)
router.get('/config', (req, res) => {
  res.json({
    metaAppId: process.env.META_APP_ID || null
  });
});

// Secure all other endpoints using the dummy authentication middleware
router.post('/broadcast', authMiddleware, sendBroadcast);
router.get('/workspace', authMiddleware, getWorkspace);
router.get('/contacts', authMiddleware, getContacts);
router.get('/messages/:contactId', authMiddleware, getMessages);
router.get('/campaigns', authMiddleware, getCampaigns);
router.delete('/campaigns/:campaignId', authMiddleware, cancelCampaign);
router.post('/support/send', authMiddleware, sendSupportReply);
router.post('/workspace/refill', authMiddleware, refillWallet);
router.post('/workspace/update-meta', authMiddleware, updateWorkspaceMeta);
router.get('/media/:mediaId', authMiddleware, getMediaProxy);
router.get('/billing/transactions', authMiddleware, getTransactions);
router.post('/contacts/:contactId/assign', authMiddleware, assignContact);
router.post('/contacts/:contactId/bot-toggle', authMiddleware, toggleContactBot);

export default router;
