import { Router } from 'express';
import { sendBroadcast } from '../controllers/broadcastController';
import { renderAccountSetup, processAccountSetup, renderAccountRecover, processAccountRecover } from '../controllers/accountController';
import { externalSupportChat } from '../controllers/externalSupportController';
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
  loginWorkspace,
  toggleContactBot,
  cancelCampaign,
  updateWorkspaceMeta,
  getBotTraining,
  uploadBotTraining,
  addSingleBotTraining,
  clearBotTraining,
  getTeamMembers,
  addTeamMember,
  updateWorkspaceSettings,
  updateContactName
} from '../controllers/dashboardController';

const router = Router();

// Public onboarding / registration route
router.post('/workspaces', createWorkspace);
router.post('/workspaces/login', loginWorkspace);

// Account Web UI Routes (Public, token based)
router.get('/account/setup', renderAccountSetup);
router.post('/account/setup', processAccountSetup);
router.get('/account/recover', renderAccountRecover);
router.post('/account/recover', processAccountRecover);

// External AI Support Chat (Public)
router.post('/external/chat', externalSupportChat);

// Public API Config route (used by frontend to retrieve META_APP_ID and META_CONFIG_ID for Facebook Login SDK)
router.get('/config', (req, res) => {
  res.json({
    metaAppId: process.env.META_APP_ID || null,
    metaConfigId: process.env.META_CONFIG_ID || null
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
router.post('/workspace/settings', authMiddleware, updateWorkspaceSettings);
router.get('/media/:mediaId', authMiddleware, getMediaProxy);
router.get('/billing/transactions', authMiddleware, getTransactions);
router.post('/contacts/:contactId/assign', authMiddleware, assignContact);
router.post('/contacts/:contactId/name', authMiddleware, updateContactName);
router.post('/contacts/:contactId/bot-toggle', authMiddleware, toggleContactBot);
router.get('/workspace/training', authMiddleware, getBotTraining);
router.post('/workspace/training/upload', authMiddleware, uploadBotTraining);
router.post('/workspace/training/single', authMiddleware, addSingleBotTraining);
router.delete('/workspace/training', authMiddleware, clearBotTraining);
router.get('/workspace/team-members', authMiddleware, getTeamMembers);
router.post('/workspace/team-members', authMiddleware, addTeamMember);

export default router;
