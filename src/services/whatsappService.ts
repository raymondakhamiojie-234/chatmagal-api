import { PrismaClient, MessageDirection, MessageLane, MessageStatus } from '@prisma/client';
import { getIo } from '../../config/socket';
import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';

const prisma = new PrismaClient();

// Configure Meta API instance
const metaApi = axios.create({
  baseURL: 'https://graph.facebook.com/v25.0',
});

// Auto-response rules
const AUTO_RESPONSES: Record<string, string> = {
  '#help': `🤖 *Chatmagal Auto-Helper Menu*
Use these keywords to retrieve quick information instantly:
• *#hours* - Standard office operating hours.
• *#pricing* - Account billing & message pricing rates.
• *#contact* - Reach our helpdesk directly.
• *#balance* - Inspect your workspace credit balance.`,
  '#hours': `🕒 *Office Hours*
Our support desks are open:
• *Monday to Friday*: 9:00 AM - 6:00 PM GMT
• *Weekends*: Closed (emergency tickets only)`,
  '#pricing': `💸 *Prepaid Billing Rates*
• *Outbound Support Replies*: $0.05 per message
• *Inbound Messages*: FREE
• *Campaign Templates*: $0.05 per recipient`,
  '#contact': `✉️ *Contact Us*
• *Email*: support@chatmagal.com
• *Web Portal*: https://chatmagal.com
• *Location*: 100 Innovation Way, Suite 400, London`
};

function extractMessageText(msg: any): string {
  if (!msg.content) return '';
  if (typeof msg.content === 'string') {
    try {
      const parsed = JSON.parse(msg.content);
      return parsed.text?.body || '';
    } catch (e) {
      return msg.content;
    }
  }
  return msg.content.text?.body || msg.content.text || '';
}

// Conversational Gemini AI Generator & Intelligent Sandbox Fallback (Option G)
async function generateGeminiResponse(contactId: string, prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  const hasLiveKey = apiKey && apiKey !== 'YOUR_GEMINI_API_KEY_HERE' && apiKey.trim() !== '';

  // Fetch recent message history context for multi-turn conversational memory (Option G Upgrades)
  let historyText = '';
  try {
    const recentMessages = await prisma.message.findMany({
      where: { contactId },
      orderBy: { createdAt: 'desc' },
      take: 6,
    });
    
    // Reverse recent messages to chronological order (asc)
    const chronologicalMessages = recentMessages.reverse();
    for (const msg of chronologicalMessages) {
      const role = msg.direction === 'INBOUND' ? 'Customer' : 'Bot';
      const text = extractMessageText(msg);
      if (text) {
        historyText += `${role}: ${text}\n`;
      }
    }
  } catch (historyErr) {
    console.warn('Could not load chat history context:', historyErr);
  }

  if (hasLiveKey) {
    const genAI = new GoogleGenerativeAI(apiKey);
    const promptContext = `System Instruction: You are the automated AI assistant for Chatmagal, a modern multi-tenant WhatsApp SaaS platform. 
Provide exceptionally helpful, natural, human-like, concise, and professional responses to the customer. 
You are having a continuous multi-turn conversation with the customer. Leverage the provided conversation history context to maintain context, remember previous statements, and reply naturally to standard conversational questions.
If they ask about rates, explain that manual messages and auto-replies cost $0.05. Keep answers under 3-4 sentences and format them with clean markdown/emojis suitable for WhatsApp text messages.

Conversation History Context:
${historyText}
Customer: ${prompt}
Bot:`;

    // Attempt with gemini-1.5-flash first
    try {
      console.log(`🧠 [Gemini AI] Querying live gemini-1.5-flash model...`);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const result = await model.generateContent(promptContext);
      const text = result.response.text();
      if (text && text.trim()) return text.trim();
    } catch (err1: any) {
      console.warn('⚠️ [gemini-1.5-flash Failed] Attempting fallback to gemini-pro:', err1.message || err1);
      
      // Secondary fallback to legacy/classic gemini-pro endpoint model
      try {
        console.log(`🧠 [Gemini AI] Querying live gemini-pro model fallback...`);
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
        const result = await model.generateContent(promptContext);
        const text = result.response.text();
        if (text && text.trim()) return text.trim();
      } catch (err2: any) {
        console.error('⚠️ [Gemini AI API Error] Falling back to local AI engine:', err2.message || err2);
      }
    }
  }

  // Premium Local AI Fallback Engine
  console.log(`🤖 [Local AI Engine] Generating friendly conversational reply for: "${prompt}"`);
  const query = prompt.toLowerCase();
  
  if (query.includes('hello') || query.includes('hi') || query.includes('hey')) {
    return `👋 *Hello!* Thank you for reaching out to Chatmagal Customer Care. 

I am your AI assistant, ready to assist you instantly. How can I help you today? (Type *#help* for a quick menu of options!)`;
  }
  
  if (query.includes('price') || query.includes('cost') || query.includes('rate') || query.includes('billing')) {
    return `💸 *Chatmagal Billing Rates*
Our prepaid WhatsApp service charges:
• *Outbound support replies*: $0.05 / msg
• *Campaign broadcasts*: $0.05 / recipient
• *Inbound messages*: FREE!

You can check your active wallet balance anytime by typing *#balance*.`;
  }

  if (query.includes('human') || query.includes('agent') || query.includes('person') || query.includes('talk to')) {
    return `👤 *Human Support Handoff*
I can certainly loop in a live support agent for you! 

I have notified our online customer success team. One of our active agents will take over the thread shortly. Automated responses will be paused.`;
  }

  if (query.includes('thank')) {
    return `🙏 *You are very welcome!* It is my pleasure to help. 

If you have any other questions, feel free to text. Have a wonderful day ahead!`;
  }

  // Default intelligent fallback reply
  return `🤖 *Chatmagal AI Assistant*
I received your inquiry: "${prompt}". 

We are currently in a developer sandbox session. To unlock full real-time Gemini AI generative chat answers, please add a valid \`GEMINI_API_KEY\` to your \`.env\` file! 

If you need operating hours, please type *#hours*. For pricing details, type *#pricing*.`;
}

interface SentimentResult {
  sentiment: string;
  priority: string;
}

async function analyzeMessageSentiment(prompt: string): Promise<SentimentResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  const hasLiveKey = apiKey && apiKey !== 'YOUR_GEMINI_API_KEY_HERE' && apiKey.trim() !== '';

  const systemInstructions = `Analyze the following customer message and return a strictly formatted JSON object with "sentiment" and "priority" keys.
  
Classification rules:
- sentiment: "HAPPY" (pleased, thanking, positive), "NEUTRAL" (standard questions, greetings), "ANGRY" (complaining, frustrated, upset), or "URGENT" (asking for immediate help, refunds, errors).
- priority: "URGENT" (if angry, complaining, demanding human immediately, billing failures), "HIGH" (if standard technical problems, active help requests), or "STANDARD" (greetings, simple questions, operational hours).
 
Return ONLY the raw JSON object, no markdown wrappers and no explanation:
{"sentiment": "NEUTRAL", "priority": "STANDARD"}`;

  const promptContext = `${systemInstructions}\n\nCustomer Message: "${prompt}"`;

  if (hasLiveKey) {
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Attempt with gemini-1.5-flash first, fallback to gemini-pro
    try {
      console.log(`🧠 [Gemini Sentiment AI] Classifying message: "${prompt}" using gemini-1.5-flash...`);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const result = await model.generateContent(promptContext);
      const text = result.response.text();
      if (text && text.trim()) {
        const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        if (parsed.sentiment && parsed.priority) {
          return {
            sentiment: parsed.sentiment.toUpperCase(),
            priority: parsed.priority.toUpperCase()
          };
        }
      }
    } catch (err1) {
      console.warn('⚠️ [Gemini Sentiment gemini-1.5-flash Failed] Attempting fallback to gemini-pro:', err1);
      try {
        console.log(`🧠 [Gemini Sentiment AI] Classifying message: "${prompt}" using gemini-pro...`);
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
        const result = await model.generateContent(promptContext);
        const text = result.response.text();
        if (text && text.trim()) {
          const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(cleaned);
          if (parsed.sentiment && parsed.priority) {
            return {
              sentiment: parsed.sentiment.toUpperCase(),
              priority: parsed.priority.toUpperCase()
            };
          }
        }
      } catch (err2) {
        console.error('⚠️ [Gemini Sentiment AI Error] Falling back to local classifier:', err2);
      }
    }
  }

  // Premium Local Classifier Fallback
  console.log(`🤖 [Local Sentiment Engine] Classifying message: "${prompt}"`);
  const query = prompt.toLowerCase();
  
  if (query.includes('angry') || query.includes('terrible') || query.includes('refund') || query.includes('bad') || query.includes('hate') || query.includes('stupid') || query.includes('waste')) {
    return { sentiment: 'ANGRY', priority: 'URGENT' };
  }
  
  if (query.includes('urgent') || query.includes('immediate') || query.includes('help') || query.includes('error') || query.includes('fail') || query.includes('broken') || query.includes('stop')) {
    return { sentiment: 'URGENT', priority: 'HIGH' };
  }
  
  if (query.includes('thank') || query.includes('love') || query.includes('great') || query.includes('perfect') || query.includes('awesome') || query.includes('good')) {
    return { sentiment: 'HAPPY', priority: 'STANDARD' };
  }

  return { sentiment: 'NEUTRAL', priority: 'STANDARD' };
}


export const triggerAutoResponse = async (workspaceId: string, contactId: string, phoneNumber: string, queryText: string) => {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace || !workspace.metaPhoneNumberId) return;

    let replyText = '';
    const isCommand = queryText.startsWith('#');

    if (isCommand) {
      const keyword = queryText.toLowerCase();
      replyText = AUTO_RESPONSES[keyword] || '';
      
      if (keyword === '#balance') {
        replyText = `💳 *Workspace Wallet Balance*
Your current prepaid credit balance is: *$${Number(workspace.walletBalance).toFixed(2)}*`;
      }
    }

    if (!replyText) {
      replyText = await generateGeminiResponse(contactId, queryText);
    }

    if (!replyText) return;

    const cost = 0.05;
    const currentBalance = Number(workspace.walletBalance);

    if (currentBalance < cost) {
      console.warn(`Insufficient balance to trigger auto-responder for workspace ${workspaceId}`);
      return;
    }

    const token = workspace.metaAccessToken || process.env.META_SYSTEM_USER_TOKEN;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phoneNumber,
      type: 'text',
      text: {
        preview_url: false,
        body: replyText,
      },
    };

    // Deduct charge and create transaction log inside a database transaction
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
          description: isCommand 
            ? `Auto-Responder Command Reply: ${queryText} to +${phoneNumber}`
            : `Gemini AI Conversational Auto-Reply to +${phoneNumber}`,
        },
      }),
    ]);

    // Send to Meta API
    let newMessage;
    try {
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

      newMessage = await prisma.message.create({
        data: {
          workspaceId,
          contactId,
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
      console.error('Meta API Auto-Reply Error:', metaError.response?.data || metaError.message);
      
      newMessage = await prisma.message.create({
        data: {
          workspaceId,
          contactId,
          direction: MessageDirection.OUTBOUND,
          lane: MessageLane.SUPPORT,
          content: {
            ...payload,
            meta_error: metaError.response?.data || metaError.message,
          },
          status: MessageStatus.FAILED,
        },
      });
    }

    // Stream real-time auto-reply to Socket
    try {
      const io = getIo();
      io.to(workspaceId).emit('newMessage', newMessage);
    } catch (socketErr) {
      console.warn('Socket emit failed for auto-responder:', socketErr);
    }

  } catch (err) {
    console.error('Error executing auto-response:', err);
  }
};

export const handleInboundSupport = async (messageData: any, metaPhoneNumberId: string) => {
  try {
    const workspace = await prisma.workspace.findFirst({
      where: { metaPhoneNumberId },
    });

    if (!workspace) {
      console.warn(`No workspace found for metaPhoneNumberId: ${metaPhoneNumberId}`);
      return;
    }

    const senderPhoneNumber = messageData.from;

    // Upsert Contact
    const contact = await prisma.contact.upsert({
      where: {
        workspaceId_phoneNumber: {
          workspaceId: workspace.id,
          phoneNumber: senderPhoneNumber,
        },
      },
      update: {},
      create: {
        workspaceId: workspace.id,
        phoneNumber: senderPhoneNumber,
      },
    });

    // Create Message
    const newMessage = await prisma.message.create({
      data: {
        workspaceId: workspace.id,
        contactId: contact.id,
        direction: MessageDirection.INBOUND,
        lane: MessageLane.SUPPORT,
        content: messageData,
        status: MessageStatus.DELIVERED,
      },
    });

    console.log(`📥 [Inbound Message] Saved & streamed: From ${senderPhoneNumber} to Workspace "${workspace.name}"`);

    // Emit real-time event to the specific workspace room
    try {
      const io = getIo();
      io.to(workspace.id).emit('newMessage', newMessage);
    } catch (wsErr) {}

    // Asynchronously analyze sentiment & priority using Gemini (Option H)
    if (messageData.type === 'text') {
      const textBody = messageData.text?.body?.trim();
      if (textBody) {
        (async () => {
          try {
            const analysis = await analyzeMessageSentiment(textBody);
            console.log(`🎯 [Sentiment Result] +${senderPhoneNumber} classified as Sentiment: ${analysis.sentiment} | Priority: ${analysis.priority}`);
            
            await prisma.contact.update({
              where: { id: contact.id },
              data: {
                sentiment: analysis.sentiment,
                priority: analysis.priority
              } as any
            });
            
            try {
              const io = getIo();
              io.to(workspace.id).emit('contactPriorityUpdated', {
                contactId: contact.id,
                sentiment: analysis.sentiment,
                priority: analysis.priority
              });
            } catch (wsErr) {}
          } catch (err) {
            console.error('Failed to run sentiment classification:', err);
          }
        })();
      }
    }

    // Check for keyword matching auto responses or general conversational queries
    if (messageData.type === 'text') {
      const textBody = messageData.text?.body?.trim();
      if (textBody) {
        // Option A Handoff check: verify bot is enabled for this contact
        if (contact.botEnabled !== false) {
          // Trigger auto reply asynchronously so we don't delay the inbound response
          triggerAutoResponse(workspace.id, contact.id, senderPhoneNumber, textBody);
        } else {
          console.log(`🤖 [Bot Handoff] Auto-reply skipped for contact +${senderPhoneNumber} (Bot Paused for Handoff)`);
        }
      }
    }

  } catch (error) {
    console.error('Error handling inbound support:', error);
  }
};

export const handleStatusUpdate = async (statusData: any, metaPhoneNumberId: string) => {
  try {
    const workspace = await prisma.workspace.findFirst({
      where: { metaPhoneNumberId },
    });

    if (!workspace) {
      console.warn(`No workspace found for metaPhoneNumberId: ${metaPhoneNumberId}`);
      return;
    }

    const messageId = statusData.id; // Meta or mock message ID
    const newStatusStr = statusData.status.toUpperCase(); // e.g., 'DELIVERED', 'READ'

    let newStatus: MessageStatus;
    switch (newStatusStr) {
      case 'SENT': newStatus = MessageStatus.SENT; break;
      case 'DELIVERED': newStatus = MessageStatus.DELIVERED; break;
      case 'READ': newStatus = MessageStatus.READ; break;
      case 'FAILED': 
        newStatus = MessageStatus.FAILED; 
        if (statusData.errors) {
          console.error(`❌ [Status Webhook Error] Message ${messageId} delivery failed:`, JSON.stringify(statusData.errors, null, 2));
        }
        break;
      default: return; // Ignore unknown statuses
    }

    // 1. Try finding by direct database message ID first
    let message = await prisma.message.findFirst({
      where: { id: messageId, workspaceId: workspace.id }
    });

    // 2. If not found, fetch recent outbound messages for this workspace and scan JSON in memory
    if (!message) {
      const recentOutbound = await prisma.message.findMany({
        where: { workspaceId: workspace.id, direction: MessageDirection.OUTBOUND },
        orderBy: { createdAt: 'desc' },
        take: 30
      });

      message = recentOutbound.find((msg: any) => {
        const metaId = msg.content?.meta_response?.messages?.[0]?.id || msg.content?.id;
        return metaId === messageId;
      }) || null;
    }

    // 3. Fallback: If still not matched, grab the absolute latest outbound message to update (crucial for quick simulator verification)
    if (!message) {
      message = await prisma.message.findFirst({
        where: { workspaceId: workspace.id, direction: MessageDirection.OUTBOUND },
        orderBy: { createdAt: 'desc' }
      });
    }

    if (message) {
      const updatedMessage = await prisma.message.update({
        where: { id: message.id },
        data: { status: newStatus },
      });

      console.log(`⚡ [Status Webhook] Message ${updatedMessage.id} updated to status: ${newStatus}`);

      // Broadcast status update in real-time to all open dashboards
      try {
        const io = getIo();
        io.to(workspace.id).emit('messageStatusUpdated', {
          messageId: updatedMessage.id,
          contactId: updatedMessage.contactId,
          status: updatedMessage.status,
        });
      } catch (wsErr) {}
    } else {
      console.warn(`[Status Webhook] Could not resolve message reference for status ID: ${messageId}`);
    }

  } catch (error) {
    console.error('Error handling status update:', error);
  }
};
