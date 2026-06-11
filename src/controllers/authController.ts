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
    const { accessToken, workspaceId } = req.body;

    if (!accessToken || !workspaceId) {
      return res.status(400).json({ error: 'Missing accessToken or workspaceId' });
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
        Authorization: `Bearer ${accessToken}`,
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
        Authorization: `Bearer ${accessToken}`,
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
        metaAccessToken: accessToken.trim(),
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
