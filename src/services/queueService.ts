import { Queue, Worker, Job } from 'bullmq';
import { redisClient } from '../../config/redis';
import { PrismaClient, MessageDirection, MessageLane, MessageStatus } from '@prisma/client';
import axios from 'axios';
import dotenv from 'dotenv';
import { getIo } from '../../config/socket';

dotenv.config();

const prisma = new PrismaClient();

const queueName = 'marketing-broadcasts';

export const broadcastQueue = new Queue(queueName, {
  connection: redisClient,
});

// Configure Axios instance with hardcoded v25.0 as requested
const metaApi = axios.create({
  baseURL: 'https://graph.facebook.com/v25.0',
});

interface BroadcastJobData {
  campaignId: string;
  workspaceId: string;
  templateName: string;
  phoneNumbers: string[];
}

export const worker = new Worker(
  queueName,
  async (job: Job<BroadcastJobData>) => {
    const { campaignId, workspaceId, templateName, phoneNumbers } = job.data;

    // Fetch the campaign to check if it exists and check its status (e.g. CANCELLED or SCHEDULED)
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      console.warn(`Campaign ${campaignId} not found in database. Skipping job.`);
      return;
    }

    if (campaign.status === 'CANCELLED') {
      console.log(`Campaign ${campaignId} is CANCELLED. Skipping delayed campaign execution.`);
      return;
    }

    // Transition SCHEDULED campaigns to PROCESSING when they start
    if (campaign.status === 'SCHEDULED') {
      const updatedCampaign = await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'PROCESSING' },
      });
      try {
        const io = getIo();
        io.to(workspaceId).emit('campaignUpdated', updatedCampaign);
      } catch (wsErr) {
        console.warn('Failed to emit campaignUpdated via socket:', wsErr);
      }
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace || !workspace.metaPhoneNumberId) {
      throw new Error(`Invalid workspace or missing metaPhoneNumberId for workspace ${workspaceId}`);
    }

    const token = workspace.metaAccessToken || process.env.META_SYSTEM_USER_TOKEN;

    // Calculate campaign cost and deduct from workspace wallet
    const cost = phoneNumbers.length * 0.05;
    const currentBalance = Number(workspace.walletBalance);

    if (currentBalance < cost) {
      throw new Error(`Insufficient funds: Campaign cost is $${cost.toFixed(2)}, but wallet balance is $${currentBalance.toFixed(2)}.`);
    }

    // Deduct balance and create a transaction log inside a database transaction
    const newBalance = currentBalance - cost;
    await prisma.$transaction([
      prisma.workspace.update({
        where: { id: workspaceId },
        data: { walletBalance: newBalance },
      }),
      prisma.transaction.create({
        data: {
          workspaceId,
          type: 'CHARGE',
          amount: -cost,
          description: `Bulk Campaign Broadcast: ${templateName} (${phoneNumbers.length} recipients)`,
        },
      }),
    ]);

    // Process batch of max 50 numbers at a time
    for (const phoneNumber of phoneNumbers) {
      let contact: any = null;
      const payload = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'en_US' },
        },
      };
      try {
        // Upsert contact for the broadcast recipient
        contact = await prisma.contact.upsert({
          where: {
            workspaceId_phoneNumber: {
              workspaceId,
              phoneNumber,
            },
          },
          update: {},
          create: {
            workspaceId,
            phoneNumber,
          },
        });

        const response = await metaApi.post(
          `/${workspace.metaPhoneNumberId}/messages`,
          payload,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        // Record the outbound message in the database
        const newMessage = await prisma.message.create({
          data: {
            workspaceId,
            contactId: contact.id,
            direction: MessageDirection.OUTBOUND,
            lane: MessageLane.MARKETING,
            content: {
              ...payload,
              meta_response: response.data
            },
            status: MessageStatus.SENT, // Initial status
          },
        });

        // Emit real-time socket event
        try {
          const io = getIo();
          io.to(workspaceId).emit('newMessage', newMessage);
        } catch (socketErr) {
          console.warn('Socket emit failed in queue worker:', socketErr);
        }
      } catch (error: any) {
        const errorData = error.response?.data || { error: error.message };
        console.error(`Failed to send message to ${phoneNumber}:`, errorData);

        // Record the FAILED outbound message in the database so history is preserved
        try {
          if (contact) {
            const failedMessage = await prisma.message.create({
              data: {
                workspaceId,
                contactId: contact.id,
                direction: MessageDirection.OUTBOUND,
                lane: MessageLane.MARKETING,
                content: {
                  ...payload,
                  meta_error: errorData
                },
                status: MessageStatus.FAILED,
              },
            });

            // Emit real-time socket event for the failure
            const io = getIo();
            io.to(workspaceId).emit('newMessage', failedMessage);
          } else {
            console.warn(`Could not log failed message for ${phoneNumber} because contact was not initialized.`);
          }
        } catch (dbErr) {
          console.error('Failed to create error-log message in DB:', dbErr);
        }
      }
    }

    // Mark campaign as completed and emit socket update
    const updatedCampaign = await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'COMPLETED' },
    });

    try {
      const io = getIo();
      io.to(workspaceId).emit('campaignUpdated', updatedCampaign);
    } catch (wsErr) {
      console.warn('Failed to emit campaignUpdated via socket:', wsErr);
    }
  },
  {
    connection: redisClient,
    concurrency: 5, // Strict concurrency rate limit
  }
);

worker.on('failed', (job, err) => {
  if (job) {
    console.error(`Job ${job.id} failed with error:`, err.message);
  }
});
