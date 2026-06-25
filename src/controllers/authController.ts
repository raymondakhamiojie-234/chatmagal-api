import { Request, Response } from 'express';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Configure Axios with hardcoded v25.0
const metaApi = axios.create({
  baseURL: 'https://graph.facebook.com/v25.0',
});

export const onboardWhatsApp = async (req: Request, res: Response) => {
  try {
    const { accessToken, code, redirectUri, workspaceId } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Missing workspaceId' });
    }

    let tokenToUse = accessToken;

    // Server-to-server code exchange for access token
    if (code) {
      const appId = process.env.META_APP_ID;
      const appSecret = process.env.META_APP_SECRET;

      if (!appId || !appSecret) {
        return res.status(500).json({ error: 'Meta App ID or App Secret is not configured on the server.' });
      }

      try {
        const tokenExchangeResponse = await axios.get('https://graph.facebook.com/v25.0/oauth/access_token', {
          params: {
            client_id: appId,
            client_secret: appSecret,
            code: code,
            redirect_uri: process.env.META_REDIRECT_URI || redirectUri || ''
          }
        });

        tokenToUse = tokenExchangeResponse.data.access_token;
      } catch (exchangeErr: any) {
        console.error('Error exchanging code for access token:', exchangeErr.response?.data || exchangeErr.message);
        return res.status(400).json({
          error: 'Failed to exchange authorization code for access token.',
          details: exchangeErr.response?.data || exchangeErr.message
        });
      }
    }

    if (!tokenToUse) {
      return res.status(400).json({ error: 'Missing accessToken or authorization code' });
    }

    // Verify workspace exists
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // 1. Isolate the client's waba_id
    const wabaResponse = await metaApi.get('/me/whatsapp_business_accounts', {
      headers: {
        Authorization: `Bearer ${tokenToUse}`,
      },
    });

    const wabaData = wabaResponse.data.data;
    if (!wabaData || wabaData.length === 0) {
      return res.status(400).json({ error: 'No WhatsApp Business Account found for this user.' });
    }

    const wabaId = wabaData[0].id;

    // 2. Fetch their verified phone_number_id
    const phoneResponse = await metaApi.get(`/${wabaId}/phone_numbers`, {
      headers: {
        Authorization: `Bearer ${tokenToUse}`,
      },
    });

    const phoneData = phoneResponse.data.data;
    if (!phoneData || phoneData.length === 0) {
      return res.status(400).json({ error: 'No phone numbers found for this WABA.' });
    }

    const phoneNumberId = phoneData[0].id;

    // 3. Update the user's Workspace row with official Meta assets
    const updatedWorkspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        metaWabaId: wabaId,
        metaPhoneNumberId: phoneNumberId,
        metaAccessToken: tokenToUse.trim(),
      },
    });

    return res.status(200).json({
      message: 'Successfully onboarded WhatsApp Business Account',
      workspace: updatedWorkspace,
    });
  } catch (error: any) {
    console.error('Error in onboardWhatsApp:', error.response?.data || error.message);
    return res.status(500).json({ error: 'Failed to onboard WhatsApp' });
  }
};
