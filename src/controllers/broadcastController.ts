import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { broadcastQueue } from '../services/queueService';

const prisma = new PrismaClient();

export const sendBroadcast = async (req: Request, res: Response) => {
  try {
    // CRUCIAL SECURITY RULE: Only use workspaceId from the verified user session
    const workspaceId = req.user?.workspaceId;
    
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized: No workspace ID found' });
    }

    const { templateName, phoneNumbers, scheduledAt } = req.body;

    if (!templateName || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
      return res.status(400).json({ error: 'Invalid payload: Requires templateName and an array of phoneNumbers' });
    }

    // Verify the workspace exists
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Upfront Prepaid Credit Validation Check
    const cost = phoneNumbers.length * 0.05;
    const currentBalance = Number(workspace.walletBalance);

    if (currentBalance < cost) {
      return res.status(402).json({
        error: `Insufficient funds: Campaign cost is $${cost.toFixed(2)}, but wallet balance is $${currentBalance.toFixed(2)}.`
      });
    }

    // Determine if campaign should be scheduled
    let isScheduled = false;
    let delayMs = 0;
    let campaignStatus: 'PROCESSING' | 'SCHEDULED' = 'PROCESSING';
    let scheduledDate: Date | null = null;

    if (scheduledAt) {
      const parsedDate = new Date(scheduledAt);
      if (!isNaN(parsedDate.getTime())) {
        scheduledDate = parsedDate;
        delayMs = parsedDate.getTime() - Date.now();
        if (delayMs > 0) {
          isScheduled = true;
          campaignStatus = 'SCHEDULED';
        }
      }
    }

    // Create a new Campaign record
    const campaign = await prisma.campaign.create({
      data: {
        workspaceId,
        templateName,
        status: campaignStatus,
        scheduledAt: scheduledDate,
      },
    });

    // Split phone numbers into batches of 50
    const batchSize = 50;
    const batches = [];
    for (let i = 0; i < phoneNumbers.length; i += batchSize) {
      batches.push(phoneNumbers.slice(i, i + batchSize));
    }

    // Enqueue batches as BullMQ jobs
    for (const [index, batch] of batches.entries()) {
      await broadcastQueue.add(
        `broadcast-${campaign.id}-batch-${index}`,
        {
          campaignId: campaign.id,
          workspaceId,
          templateName,
          phoneNumbers: batch,
        },
        isScheduled ? { delay: delayMs } : {}
      );
    }

    return res.status(202).json({
      message: isScheduled
        ? `Broadcast scheduled for ${scheduledDate?.toISOString()}`
        : 'Broadcast accepted and is processing',
      campaignId: campaign.id,
      totalBatches: batches.length,
      status: campaign.status,
    });
  } catch (error) {
    console.error('Error sending broadcast:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
