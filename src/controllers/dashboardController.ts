import { Request, Response } from 'express';
import { PrismaClient, MessageDirection, MessageLane, MessageStatus } from '@prisma/client';
import axios from 'axios';
import { getIo } from '../../config/socket';

const prisma = new PrismaClient();

// Configure Axios with v25.0
const metaApi = axios.create({
  baseURL: 'https://graph.facebook.com/v25.0',
});

// GET /api/workspace
export const getWorkspace = async (req: Request, res: Response) => {
  try {
    const workspaceId = req.user?.workspaceId;

    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized: No workspace ID found' });
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Aggregate simple analytics
    const totalSent = await prisma.message.count({
      where: { workspaceId, direction: MessageDirection.OUTBOUND },
    });

    const totalReceived = await prisma.message.count({
      where: { workspaceId, direction: MessageDirection.INBOUND },
    });

    const totalContacts = await prisma.contact.count({
      where: { workspaceId },
    });

    const activeCampaigns = await prisma.campaign.count({
      where: { workspaceId, status: 'PROCESSING' },
    });

    const completedCampaigns = await prisma.campaign.count({
      where: { workspaceId, status: 'COMPLETED' },
    });

    return res.status(200).json({
      workspace,
      analytics: {
        totalSent,
        totalReceived,
        totalContacts,
        activeCampaigns,
        completedCampaigns,
      },
    });
  } catch (error) {
    console.error('Error fetching workspace dashboard:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/contacts
export const getContacts = async (req: Request, res: Response) => {
  try {
    const workspaceId = req.user?.workspaceId;

    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Fetch contacts with their latest message included to show previews in chat list
    const contacts = await prisma.contact.findMany({
      where: { workspaceId },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    // Sort contacts locally by Priority Weight (URGENT > HIGH > STANDARD) first, then latest message date
    const getPriorityWeight = (priority: string) => {
      if (priority === 'URGENT') return 3;
      if (priority === 'HIGH') return 2;
      return 1; // STANDARD
    };

    const sortedContacts = contacts.sort((a, b) => {
      const aWeight = getPriorityWeight((a as any).priority || 'STANDARD');
      const bWeight = getPriorityWeight((b as any).priority || 'STANDARD');
      
      if (aWeight !== bWeight) {
        return bWeight - aWeight; // higher priority at top
      }

      const aTime = a.messages[0]?.createdAt.getTime() || 0;
      const bTime = b.messages[0]?.createdAt.getTime() || 0;
      return bTime - aTime;
    });

    return res.status(200).json(sortedContacts);
  } catch (error) {
    console.error('Error fetching contacts:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/messages/:contactId
export const getMessages = async (req: Request, res: Response) => {
  try {
    const workspaceId = req.user?.workspaceId;
    const { contactId } = req.params;

    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify contact belongs to the workspace
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, workspaceId },
    });

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const messages = await prisma.message.findMany({
      where: { workspaceId, contactId },
      orderBy: { createdAt: 'asc' }, // standard chronological order for chat history
    });

    return res.status(200).json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/campaigns
export const getCampaigns = async (req: Request, res: Response) => {
  try {
    const workspaceId = req.user?.workspaceId;

    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const campaigns = await prisma.campaign.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json(campaigns);
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/support/send
export const sendSupportReply = async (req: Request, res: Response) => {
  try {
    const workspaceId = req.user?.workspaceId;
    const { contactId, messageText } = req.body;

    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!contactId || !messageText) {
      return res.status(400).json({ error: 'Missing contactId or messageText' });
    }

    // Retrieve Workspace & Contact
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    const contact = await prisma.contact.findFirst({
      where: { id: contactId, workspaceId },
    });

    if (!workspace || !workspace.metaPhoneNumberId) {
      return res.status(400).json({ error: 'Workspace lacks valid Meta configurations' });
    }

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found in this workspace' });
    }

    // 1. Simulating Workspace balance check (outbound support messages cost $0.05)
    const cost = 0.05;
    const currentBalance = Number(workspace.walletBalance);

    if (currentBalance < cost) {
      return res.status(402).json({
        error: 'Insufficient funds: Wallet balance is below message cost ($0.05). Please refill your wallet.',
      });
    }

    const token = workspace.metaAccessToken || process.env.META_SYSTEM_USER_TOKEN;

    // 2. Prepare WhatsApp Text Payload (Option F: Append assigned agent signature)
    const finalBodyText = contact.assignedAgent
      ? `${messageText}\n\n— from ${contact.assignedAgent}`
      : messageText;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: contact.phoneNumber,
      type: 'text',
      text: {
        preview_url: false,
        body: finalBodyText,
      },
    };

    let newMessage;
    try {
      // 3. Post to Meta API
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

      // Deduct message charge and create a transaction log inside a database transaction
      const updatedBalance = currentBalance - cost;
      
      const [updatedWorkspace] = await prisma.$transaction([
        prisma.workspace.update({
          where: { id: workspaceId },
          data: { walletBalance: updatedBalance },
        }),
        prisma.transaction.create({
          data: {
            workspaceId,
            type: 'CHARGE',
            amount: -cost,
            description: `Outbound Support Message to +${contact.phoneNumber}`,
          },
        }),
      ]);

      // Save as SENT outbound message
      newMessage = await prisma.message.create({
        data: {
          workspaceId,
          contactId: contact.id,
          direction: MessageDirection.OUTBOUND,
          lane: MessageLane.SUPPORT,
          content: {
            ...payload,
            meta_response: response.data,
          },
          status: MessageStatus.SENT,
        },
      });
    } catch (metaError: any) {
      const errorResponse = metaError.response?.data || { error: metaError.message };
      console.error('Meta API Inbound Reply Error:', errorResponse);

      // Save as FAILED message so history keeps trace of errors
      newMessage = await prisma.message.create({
        data: {
          workspaceId,
          contactId: contact.id,
          direction: MessageDirection.OUTBOUND,
          lane: MessageLane.SUPPORT,
          content: {
            ...payload,
            meta_error: errorResponse,
          },
          status: MessageStatus.FAILED,
        },
      });

      // Emit failed event to sockets
      try {
        const io = getIo();
        io.to(workspaceId).emit('newMessage', newMessage);
      } catch (wsErr) {}

      return res.status(400).json({
        error: 'Failed to deliver message via Meta WhatsApp API',
        details: errorResponse,
        newMessage,
      });
    }

    // 4. Emit to Workspace Socket.io Room
    try {
      const io = getIo();
      io.to(workspaceId).emit('newMessage', newMessage);
    } catch (wsErr) {
      console.warn('Failed to stream newMessage via socket:', wsErr);
    }

    return res.status(200).json({
      message: 'Support reply delivered successfully',
      newMessage,
    });
  } catch (error) {
    console.error('Error in sendSupportReply:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/workspace/refill
export const refillWallet = async (req: Request, res: Response) => {
  try {
    const workspaceId = req.user?.workspaceId;

    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Refill by $100.00
    const refillAmount = 100.00;
    const newBalance = Number(workspace.walletBalance) + refillAmount;

    const [updatedWorkspace] = await prisma.$transaction([
      prisma.workspace.update({
        where: { id: workspaceId },
        data: { walletBalance: newBalance },
      }),
      prisma.transaction.create({
        data: {
          workspaceId,
          type: 'REFILL',
          amount: refillAmount,
          description: 'Workspace Credits Top Up via Admin Portal',
        },
      }),
    ]);

    return res.status(200).json({
      message: 'Wallet refilled successfully by $100.00',
      workspace: updatedWorkspace,
    });
  } catch (error) {
    console.error('Error refilling wallet:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/media/:mediaId (Secure Media Proxy)
export const getMediaProxy = async (req: Request, res: Response) => {
  try {
    const workspaceId = req.user?.workspaceId;
    const { mediaId } = req.params;

    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized: No workspace ID found' });
    }

    // Support local developer testing in sandbox simulator (mock media IDs)
    // If the mediaId is a dummy UUID (like the workspace ID), contains dashes, is non-numeric, or starts with 'mock-', 
    // we bypass Meta and redirect directly to beautiful, reliable sample assets!
    const isMockMedia = mediaId.startsWith('mock-') || mediaId.includes('-') || isNaN(Number(mediaId)) || workspaceId === 'test-workspace-id';
    
    if (isMockMedia) {
      console.log(`⚡ Serving mock development asset for mediaId: ${mediaId}`);
      if (req.headers.accept?.includes('audio') || req.url.includes('audio') || req.query.type === 'audio') {
        return res.redirect('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3');
      } else if (req.headers.accept?.includes('pdf') || req.url.includes('pdf') || req.query.type === 'pdf') {
        return res.redirect('https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf-literal.pdf');
      } else {
        // Return a beautiful green abstract image matching our Emerald theme
        return res.redirect('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=640&q=80');
      }
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    const token = workspace?.metaAccessToken || process.env.META_SYSTEM_USER_TOKEN;

    // 1. Fetch lookaside metadata from Meta Graph API
    const metaResponse = await metaApi.get(`/${mediaId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const downloadUrl = metaResponse.data.url;
    const mimeType = metaResponse.data.mime_type;

    if (!downloadUrl) {
      return res.status(404).json({ error: 'Media lookaside URL not found on Meta' });
    }

    // 2. Fetch the binary media data from Meta's lookaside URL as a stream
    const mediaFileResponse = await axios({
      method: 'GET',
      url: downloadUrl,
      responseType: 'stream',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    // 3. Set the correct MIME type and stream the binary directly to the browser
    res.setHeader('Content-Type', mimeType);
    mediaFileResponse.data.pipe(res);

  } catch (error: any) {
    console.error('Media proxy failed:', error.response?.data || error.message);
    return res.status(400).json({
      error: 'Failed to retrieve media from Meta API',
      details: error.response?.data || error.message,
    });
  }
};

// GET /api/billing/transactions
export const getTransactions = async (req: Request, res: Response) => {
  try {
    const workspaceId = req.user?.workspaceId;

    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized: No workspace ID found' });
    }

    const transactions = await prisma.transaction.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json(transactions);
  } catch (error) {
    console.error('Error fetching transactions ledger:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/contacts/:contactId/assign (Ticket Assignment - Option F)
export const assignContact = async (req: Request, res: Response) => {
  try {
    const workspaceId = req.user?.workspaceId;
    const { contactId } = req.params;
    const { agentName } = req.body; // e.g. "Agent Me" or "Unassigned"
    const isTeamLeader = req.user?.isTeamLeader;

    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized: No workspace ID found' });
    }

    // Strict Access Guard: Only Team Leader can assign tickets
    if (isTeamLeader !== true) {
      return res.status(403).json({
        error: 'Forbidden: Only the Team Leader is authorized to reassign tickets.'
      });
    }

    const updatedContact = await prisma.contact.update({
      where: { id: contactId },
      data: { assignedAgent: agentName || null } as any, // Cast to any to bypass query engine temp locked client issues
    });

    // Stream the ticket assignment in real-time to all online agents!
    try {
      const io = getIo();
      io.to(workspaceId).emit('contactAssigned', { contactId, agentName: agentName || null });
    } catch (wsErr) {}

    return res.status(200).json(updatedContact);
  } catch (error) {
    console.error('Error assigning contact:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/contacts/:contactId/bot-toggle (Bot Toggle - Option A)
export const toggleContactBot = async (req: Request, res: Response) => {
  try {
    const workspaceId = req.user?.workspaceId;
    const { contactId } = req.params;
    const { botEnabled } = req.body;

    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized: No workspace ID found' });
    }

    if (typeof botEnabled !== 'boolean') {
      return res.status(400).json({ error: 'Missing or invalid botEnabled status' });
    }

    const updatedContact = await prisma.contact.update({
      where: { id: contactId },
      data: { botEnabled } as any,
    });

    try {
      const io = getIo();
      io.to(workspaceId).emit('contactBotToggled', { contactId, botEnabled });
    } catch (wsErr) {}

    return res.status(200).json(updatedContact);
  } catch (error) {
    console.error('Error toggling contact bot:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /api/campaigns/:campaignId
export const cancelCampaign = async (req: Request, res: Response) => {
  try {
    const workspaceId = req.user?.workspaceId;
    const { campaignId } = req.params;

    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized: No workspace ID found' });
    }

    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId },
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.status !== 'SCHEDULED') {
      return res.status(400).json({ error: 'Only SCHEDULED campaigns can be cancelled.' });
    }

    const updatedCampaign = await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'CANCELLED' },
    });

    try {
      const io = getIo();
      io.to(workspaceId).emit('campaignUpdated', updatedCampaign);
    } catch (wsErr) {
      console.warn('Failed to emit campaignUpdated on cancel:', wsErr);
    }

    return res.status(200).json({
      message: 'Campaign successfully cancelled',
      campaign: updatedCampaign,
    });
  } catch (error) {
    console.error('Error cancelling campaign:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/workspaces (Register a new SaaS Workspace)
export const createWorkspace = async (req: Request, res: Response) => {
  try {
    const { name, leaderPassword, memberPassword } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Business or Workspace name is required.' });
    }

    const trimmedName = name.trim();

    // Check if name is already registered
    const existing = await prisma.workspace.findUnique({
      where: { name: trimmedName }
    });
    if (existing) {
      return res.status(400).json({ error: 'A workspace with this business name already exists. Please choose a unique name.' });
    }

    // 1. Create a brand new workspace in the PostgreSQL database
    const workspace = await prisma.workspace.create({
      data: {
        name: trimmedName,
        leaderPassword: leaderPassword ? leaderPassword.trim() : 'leader123',
        memberPassword: memberPassword ? memberPassword.trim() : 'member123',
        walletBalance: 100.00, // Pre-funded with starting credits!
        metaPhoneNumberId: "106574929348123", // default/mock phone ID for immediate testing
        metaWabaId: "2094838294829" // default mock WABA ID
      }
    });

    // 2. Log a welcome transaction ledger entry
    await prisma.transaction.create({
      data: {
        workspaceId: workspace.id,
        type: 'REFILL',
        amount: 100.00,
        description: 'Welcome Sign Up Bonus Credits!'
      }
    });

    // 3. Pre-seed a starting thread/contact so the dashboard live inbox is populated immediately!
    const welcomeContact = await prisma.contact.create({
      data: {
        workspaceId: workspace.id,
        phoneNumber: "15550109999", // standard mock phone
        optInStatus: true,
        assignedAgent: "Agent Me"
      }
    });

    // 4. Pre-seed a welcome inbound message in the conversation history!
    await prisma.message.create({
      data: {
        workspaceId: workspace.id,
        contactId: welcomeContact.id,
        direction: 'INBOUND',
        lane: 'SUPPORT',
        content: {
          messaging_product: "whatsapp",
          type: "text",
          text: {
            body: "Hello! Welcome to your new Chatmagal workspace. Try typing a reply below!"
          }
        },
        status: 'READ'
      }
    });

    return res.status(201).json(workspace);
  } catch (error) {
    console.error('Error creating workspace:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/workspaces/login (Authenticate Workspace by name and password)
export const loginWorkspace = async (req: Request, res: Response) => {
  try {
    const { name, password } = req.body;

    if (!name || !password) {
      return res.status(400).json({ error: 'Business name and password are required.' });
    }

    const workspace = await prisma.workspace.findFirst({
      where: {
        OR: [
          { name: { equals: name.trim(), mode: 'insensitive' } },
          { id: name.trim() }
        ]
      }
    });

    if (!workspace) {
      return res.status(401).json({ error: 'Invalid business name, workspace ID, or password.' });
    }

    const trimmedPassword = password.trim();
    let role = '';

    if (workspace.leaderPassword === trimmedPassword) {
      role = 'leader';
    } else if (workspace.memberPassword === trimmedPassword) {
      role = 'member';
    } else {
      return res.status(401).json({ error: 'Invalid business name or password.' });
    }

    return res.status(200).json({
      message: 'Authentication successful',
      token: `${workspace.id}:${role}`,
      isTeamLeader: role === 'leader',
      workspaceId: workspace.id,
      workspace
    });
  } catch (error) {
    console.error('Error in loginWorkspace:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/workspace/update-meta (Update Meta credentials via API)
export const updateWorkspaceMeta = async (req: Request, res: Response) => {
  try {
    const workspaceId = req.user?.workspaceId;
    const { phoneNumberId, wabaId } = req.body;

    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized: No workspace ID found' });
    }

    if (!phoneNumberId || !wabaId) {
      return res.status(400).json({ error: 'Missing phoneNumberId or wabaId' });
    }

    const updatedWorkspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        metaPhoneNumberId: phoneNumberId.trim(),
        metaWabaId: wabaId.trim()
      }
    });

    return res.status(200).json({
      message: 'Workspace Meta credentials updated successfully',
      workspace: updatedWorkspace
    });
  } catch (error) {
    console.error('Error updating workspace meta:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/workspace/training (Fetch all custom training Q&A pairs for the workspace)
export const getBotTraining = async (req: Request, res: Response) => {
  try {
    const workspaceId = req.user?.workspaceId;

    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized: No workspace ID found' });
    }

    const trainings = await prisma.botTraining.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json(trainings);
  } catch (error) {
    console.error('Error fetching bot training rules:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/workspace/training/upload (Batch upload custom Q&A training rules)
export const uploadBotTraining = async (req: Request, res: Response) => {
  try {
    const workspaceId = req.user?.workspaceId;
    const { rules } = req.body; // Expects rules: { question: string, answer: string }[]

    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized: No workspace ID found' });
    }

    if (!rules || !Array.isArray(rules)) {
      return res.status(400).json({ error: 'Missing or invalid training rules list' });
    }

    // 1. Delete all existing training rules for this workspace to replace them cleanly
    await prisma.botTraining.deleteMany({
      where: { workspaceId }
    });

    // 2. Batch insert the new parsed rules
    if (rules.length > 0) {
      const dataToInsert = rules.map((r: any) => ({
        workspaceId,
        question: r.question.trim(),
        answer: r.answer.trim()
      }));

      await prisma.botTraining.createMany({
        data: dataToInsert
      });
    }

    // 3. Fetch the newly saved rules to return to the client
    const updatedTrainings = await prisma.botTraining.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({
      message: `Successfully uploaded and saved ${rules.length} AI training rules!`,
      trainings: updatedTrainings
    });
  } catch (error) {
    console.error('Error uploading bot training rules:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /api/workspace/training (Clear all custom training Q&A rules for the workspace)
export const clearBotTraining = async (req: Request, res: Response) => {
  try {
    const workspaceId = req.user?.workspaceId;

    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized: No workspace ID found' });
    }

    await prisma.botTraining.deleteMany({
      where: { workspaceId }
    });

    return res.status(200).json({
      message: 'Successfully cleared all AI training knowledge base rules!',
      trainings: []
    });
  } catch (error) {
    console.error('Error clearing bot training rules:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/workspace/team-members (Fetch all team members for the workspace)
export const getTeamMembers = async (req: Request, res: Response) => {
  try {
    const workspaceId = req.user?.workspaceId;

    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized: No workspace ID found' });
    }

    const members = await prisma.teamMember.findMany({
      where: { workspaceId },
      orderBy: { name: 'asc' }
    });

    return res.status(200).json(members);
  } catch (error) {
    console.error('Error fetching team members:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/workspace/team-members (Add a new team member to the workspace - Team Leader Only)
export const addTeamMember = async (req: Request, res: Response) => {
  try {
    const workspaceId = req.user?.workspaceId;
    const isTeamLeader = req.user?.isTeamLeader;
    const { name, role } = req.body;

    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized: No workspace ID found' });
    }

    // Strict Access Guard: Only Team Leader can add new team members
    if (isTeamLeader !== true) {
      return res.status(403).json({
        error: 'Forbidden: Only the Team Leader is authorized to add new team members.'
      });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Team member name is required.' });
    }

    const trimmedName = name.trim();
    const trimmedRole = role ? role.trim() : 'Agent';

    const newMember = await prisma.teamMember.create({
      data: {
        workspaceId,
        name: trimmedName,
        role: trimmedRole
      }
    });

    // Real-Time Socket.io Broadcast: sync the new team member to all logged in agents
    try {
      const io = getIo();
      io.to(workspaceId).emit('teamMemberAdded', newMember);
    } catch (wsErr) {}

    return res.status(201).json(newMember);
  } catch (error) {
    console.error('Error adding team member:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
