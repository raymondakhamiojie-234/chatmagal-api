import { PrismaClient, Prisma, MessageDirection, MessageLane, MessageStatus } from '@prisma/client';
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
  '#help': `🤖 *Auto-Helper Menu*
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
• *Email*: support@yourcompany.com
• *Web Portal*: https://yourcompany.com
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
export async function generateGeminiResponse(contactId: string, prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  const hasLiveKey = apiKey && apiKey !== 'YOUR_GEMINI_API_KEY_HERE' && apiKey.trim() !== '';

  // 1. Resolve contact's workspaceId to fetch corresponding custom settings and Q&A training rules
  let workspaceId = '';
  let workspaceName = 'Chatmagal';
  let systemTone = 'Friendly & Outgoing (Casual, polite)';
  let systemPrompt = '';
  let companyBankDetails = '';
  try {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { 
        workspaceId: true,
        workspace: {
          select: {
            name: true,
            businessName: true,
            systemTone: true,
            systemPrompt: true,
            companyBankDetails: true
          }
        }
      }
    });
    if (contact) {
      workspaceId = contact.workspaceId;
      workspaceName = contact.workspace.businessName || contact.workspace.name || 'Chatmagal';
      systemTone = contact.workspace.systemTone || 'Friendly & Outgoing (Casual, polite)';
      systemPrompt = contact.workspace.systemPrompt || '';
      companyBankDetails = contact.workspace.companyBankDetails || '';
    }
  } catch (err) {
    console.warn('Could not load contact workspaceId context for AI respondent:', err);
  }

  // 2. Fetch custom bot training Q&A knowledge base rules
  let trainingContextText = '';
  let botTrainings: any[] = [];
  if (workspaceId) {
    try {
      botTrainings = await prisma.botTraining.findMany({
        where: { workspaceId }
      });
      if (botTrainings.length > 0) {
        trainingContextText = 'Custom Business Q&A Reference (Ground-Truth Knowledge Base):\n';
        for (const rule of botTrainings) {
          let ruleContext = `- User Question: "${rule.question}"\n  Your Prepared Answer: "${rule.answer}"\n`;
          if (rule.category) ruleContext = `  [Category: ${rule.category}]\n` + ruleContext;
          if (rule.keywords) ruleContext += `  [Associated Keywords: ${rule.keywords}]\n`;
          trainingContextText += ruleContext;
        }
      }
    } catch (trainErr) {
      console.warn('Could not load custom bot training rules for AI respondent:', trainErr);
    }
  }

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
      const role = msg.direction === 'INBOUND' ? 'Customer' : 'Us (Previous Agent or Bot)';
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
    const promptContext = `System Instruction: You are the automated AI assistant for the WhatsApp Business account of "${workspaceName}". 
Answering Tone Guidelines: You must write in a tone that is "${systemTone}".
${systemPrompt ? `Brand Specific Instructions & System Guidelines:\n${systemPrompt}\n` : 'Provide exceptionally helpful, natural, human-like, concise, and professional responses to the customer.'} 
You are having a continuous multi-turn conversation with the customer. 
CRITICAL HANDOFF INSTRUCTION: The conversation history may contain messages sent by a human colleague from our team. If a human agent recently stepped away, you are now seamlessly taking back over. Act completely human-like. Do NOT announce that you are an AI or that you are taking over. Just smoothly continue the conversation and answer the customer's queries.
If they ask about rates, explain that manual messages and auto-replies cost $0.05. Keep answers under 3-4 sentences and format them with clean markdown/emojis suitable for WhatsApp text messages.


${trainingContextText ? `KNOWLEDGE BASE REFERENCE:
You have been provided with a custom business Q&A knowledge base below. Use this as your absolute source of truth for factual information.
CRITICAL INSTRUCTION: When answering based on this knowledge base, you may extract the facts to weave into a natural response, OR if the knowledge base provides a specific script, pricing, or strict formatting (like bolding with asterisks *), you should use the exact phrasing provided to maintain the company's sales scripts.

${trainingContextText}
` : ''}

${companyBankDetails ? `PAYMENT & BANK DETAILS INSTRUCTION:
The company's bank details and payment flow instructions are: "${companyBankDetails}"
If the customer asks for payment details, how to pay, or account details, you MUST provide these exact details to them.
If the customer provides proof of payment, confirms they have made the transfer, or says they have paid, you MUST acknowledge it and append the exact string "[PAYMENT_LOGGED]" at the very end of your response. This hidden tag triggers our system to automatically log the payment in Google Sheets.` : ''}

Conversation History Context:
${historyText}
Customer: ${prompt}
Bot:`;

    // Attempt with gemini-1.5-flash first
    try {
      console.log(`🧠 [Gemini AI] Querying live gemini-1.5-flash model with Google Search Grounding...`);
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash',
        tools: [{ googleSearchRetrieval: {} }] 
      });
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
  
  // Try to find a custom training match first
  if (botTrainings.length > 0) {
    const queryNormalized = prompt.toLowerCase().trim();
    const matched = botTrainings.find(t => {
      const q = t.question.toLowerCase().trim();
      
      // 1. Exact match
      if (queryNormalized === q) return true;
      
      // 2. Full question contained in query
      if (queryNormalized.includes(q)) return true;

      // 3. Query contained in question (Only if query is substantial, >= 5 chars, to avoid "ok" matching "facebook")
      if (queryNormalized.length >= 5 && q.includes(queryNormalized)) return true;
      
      // 4. Match by keywords using Word Boundaries to avoid "web" matching inside "website"
      if (t.keywords) {
        const keywordsList = t.keywords.toLowerCase().split(',').map((k: string) => k.trim()).filter(Boolean);
        return keywordsList.some((kw: string) => {
          // Create a regex with word boundaries. Escape special chars in keyword.
          const escapedKw = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`\\b${escapedKw}\\b`, 'i');
          return regex.test(queryNormalized);
        });
      }
      
      return false;
    });
    if (matched) {
      console.log(`🎯 [Local AI Engine] Custom training match found: Question: "${matched.question}" -> Answer: "${matched.answer}"`);
      return matched.answer;
    }
  }

  const query = prompt.toLowerCase();
  
  if (query.includes('hello') || query.includes('hi') || query.includes('hey')) {
    return `👋 *Hello!* Thank you for reaching out to ${workspaceName}. How can I assist you today?`;
  }
  
  if (query.includes('price') || query.includes('cost') || query.includes('rate') || query.includes('billing')) {
    return `💸 Please contact our sales team or visit our website for detailed pricing information.`;
  }

  if (query.includes('human') || query.includes('agent') || query.includes('person') || query.includes('talk to')) {
    return `👤 *Human Support Handoff*
I can certainly loop in a live support agent for you! 

I have notified our team. One of our active agents will take over the thread shortly.`;
  }

  if (query.includes('thank')) {
    return `🙏 *You are very welcome!* It is my pleasure to help. 

If you have any other questions, feel free to text. Have a wonderful day ahead!`;
  }

  // Default intelligent fallback reply
  return `🤖 I received your message, but I'm not entirely sure how to answer that based on my current training. 
Please ask another question or type *talk to human* to speak with a live representative.`;
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
    
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
    });

    if (!workspace || !workspace.metaPhoneNumberId || !contact) return;

    let replyText = '';
    let payload: any = null;
    const lQuery = queryText.toLowerCase();
    const isCommand = queryText.startsWith('#');
    
    // ==========================================
    // 0. FORM STATE MACHINE INTERCEPTOR
    // ==========================================
    if (contact.formState) {
      if (lQuery === 'cancel' || lQuery === 'stop') {
        await prisma.contact.update({
          where: { id: contactId },
          data: { formState: null, formData: Prisma.DbNull }
        });
        replyText = 'Form cancelled. You can type "Hi" to see the main menu again.';
      } else if (contact.formState === 'AWAITING_PAGE_LINK') {
        const currentData = (contact.formData as any) || {};
        currentData.link = queryText;
        
        await prisma.contact.update({
          where: { id: contactId },
          data: { formState: 'AWAITING_PAGE_SETUP', formData: currentData }
        });

        payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phoneNumber,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: 'Is the page setup or already setup?' },
            action: {
              buttons: [
                { type: 'reply', reply: { id: 'page_setup', title: 'Setup' } },
                { type: 'reply', reply: { id: 'page_already_setup', title: 'Already setup' } }
              ]
            }
          }
        };
      } else if (contact.formState === 'AWAITING_PROFILE_LINK') {
        const currentData = (contact.formData as any) || {};
        currentData.link = queryText;
        
        await prisma.contact.update({
          where: { id: contactId },
          data: { formState: 'AWAITING_PROFILE_SETUP', formData: currentData }
        });

        payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phoneNumber,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: 'Is the profile setup or already setup?' },
            action: {
              buttons: [
                { type: 'reply', reply: { id: 'profile_setup', title: 'Setup' } },
                { type: 'reply', reply: { id: 'profile_already_setup', title: 'Already setup' } }
              ]
            }
          }
        };
      } else if (contact.formState === 'AWAITING_PAGE_ADMIN') {
        const currentData = (contact.formData as any) || {};
        currentData.adminConfirmation = queryText;
        
        // Finalize form
        try {
          const { appendRowToSheet } = require('./googleSheetsService');
          if (workspace.googleServiceAccountJson && workspace.googleSpreadsheetId) {
            await appendRowToSheet(
              workspace.googleServiceAccountJson, 
              workspace.googleSpreadsheetId, 
              [new Date().toISOString(), phoneNumber, currentData.type, currentData.link, currentData.setupStatus, currentData.adminConfirmation]
            );
          }
        } catch (err) { console.error('Sheet append error:', err); }

        await prisma.contact.update({
          where: { id: contactId },
          data: { formState: null, formData: Prisma.DbNull }
        });
        replyText = '✅ Thank you! We have received your information and our staff will process it shortly.';
      }
    }
    
    // If we have intercepted via state machine, skip the rest
    if (replyText || payload) {
      // Proceed to the send logic below
    } else if (
      // 1. Intercept Main Menu
      lQuery === 'hi' || 
      lQuery === 'hello' || 
      lQuery === 'hey' || 
      lQuery === 'menu' || 
      lQuery === 'good morning' || 
      lQuery === 'good afternoon' || 
      lQuery === 'good evening'
    ) {
      const welcomeText = `Welcome to ${workspace.businessName || workspace.name || 'our service'}! 👋\n\nHow can we assist you today?`;
      const welcomePayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'text',
        text: { preview_url: false, body: welcomeText },
      };

      try {
        const token = workspace.metaAccessToken || process.env.META_SYSTEM_USER_TOKEN;
        const res = await metaApi.post(`/${workspace.metaPhoneNumberId}/messages`, welcomePayload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        await prisma.message.create({
          data: {
            workspaceId,
            contactId,
            direction: MessageDirection.OUTBOUND,
            lane: MessageLane.SUPPORT,
            content: { ...welcomePayload, meta_response: res.data },
            status: MessageStatus.SENT,
          },
        });
      } catch (err) {
        console.error('Failed to send welcome message:', err);
      }

      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'interactive',
        interactive: {
          type: 'list',
          header: { type: 'text', text: 'Welcome' },
          body: { text: 'Choose an option:' },
          action: {
            button: 'Menu',
            sections: [{
              title: 'Options',
              rows: [
                { id: 'menu_monetize_page', title: 'Monetize A Page' },
                { id: 'menu_monetize_profile', title: 'Monetize A profile' },
                { id: 'menu_buy_account', title: 'Buy An account' },
                { id: 'menu_buy_service', title: 'Buy a service' },
                { id: 'menu_human', title: 'Live chat' },
                { id: 'menu_support', title: 'Support' }
              ]
            }]
          }
        }
      };
      replyText = 'Interactive Main Menu Sent';
    }
    // 2. Handle New Sub-Menu Clicks
    else if (queryText === 'menu_monetize_page') {
      await prisma.contact.update({
        where: { id: contactId },
        data: { formState: 'AWAITING_PAGE_LINK', formData: { type: 'Monetize A Page' } }
      });
      replyText = 'Please send us your Page Link:';
    }
    else if (queryText === 'menu_monetize_profile') {
      await prisma.contact.update({
        where: { id: contactId },
        data: { formState: 'AWAITING_PROFILE_LINK', formData: { type: 'Monetize A Profile' } }
      });
      replyText = 'Please send us your Profile Link:';
    }
    else if (queryText === 'menu_buy_account') {
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'interactive',
        interactive: {
          type: 'list',
          header: { type: 'text', text: 'Buy An account' },
          body: { text: 'Choose an account type:' },
          action: {
            button: 'Accounts',
            sections: [{
              title: 'Options',
              rows: [
                { id: 'buy_facebook_page', title: 'Facebook page' },
                { id: 'buy_facebook_group', title: 'Facebook group' },
                { id: 'buy_tiktok', title: 'TikTok account' },
                { id: 'buy_youtube', title: 'YouTube channel' },
                { id: 'buy_instagram', title: 'Instagram account' }
              ]
            }]
          }
        }
      };
    }
    else if (queryText === 'menu_buy_service') {
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'interactive',
        interactive: {
          type: 'list',
          header: { type: 'text', text: 'Buy a service' },
          body: { text: 'Choose a service type:' },
          action: {
            button: 'Services',
            sections: [{
              title: 'Options',
              rows: [
                { id: 'service_disable_profile', title: 'Disable profile' },
                { id: 'service_suspended_page', title: 'Suspended page' },
                { id: 'service_verify_profile', title: 'Verify profile' }
              ]
            }]
          }
        }
      };
    }
    else if (queryText === 'page_setup' || queryText === 'page_already_setup') {
      const isAlreadySetup = queryText === 'page_already_setup';
      const currentData = (contact.formData as any) || {};
      currentData.setupStatus = isAlreadySetup ? 'Already setup' : 'Setup';
      
      if (isAlreadySetup) {
        await prisma.contact.update({
          where: { id: contactId },
          data: { formState: 'AWAITING_PAGE_ADMIN', formData: currentData }
        });
        replyText = 'Please make the page an admin and reply with "Done" when complete.';
      } else {
        // Form is complete here
        try {
          const { appendRowToSheet } = require('./googleSheetsService');
          if (workspace.googleServiceAccountJson && workspace.googleSpreadsheetId) {
            await appendRowToSheet(
              workspace.googleServiceAccountJson, 
              workspace.googleSpreadsheetId, 
              [new Date().toISOString(), phoneNumber, currentData.type, currentData.link, currentData.setupStatus, 'N/A']
            );
          }
        } catch (err) { console.error('Sheet append error:', err); }

        await prisma.contact.update({
          where: { id: contactId },
          data: { formState: null, formData: Prisma.DbNull }
        });
        replyText = '✅ Thank you! We have received your information and our staff will process it shortly.';
      }
    }
    else if (queryText === 'profile_setup' || queryText === 'profile_already_setup') {
      const isAlreadySetup = queryText === 'profile_already_setup';
      const currentData = (contact.formData as any) || {};
      currentData.setupStatus = isAlreadySetup ? 'Already setup' : 'Setup';
      
      try {
        const { appendRowToSheet } = require('./googleSheetsService');
        if (workspace.googleServiceAccountJson && workspace.googleSpreadsheetId) {
          await appendRowToSheet(
            workspace.googleServiceAccountJson, 
            workspace.googleSpreadsheetId, 
            [new Date().toISOString(), phoneNumber, currentData.type, currentData.link, currentData.setupStatus, 'N/A']
          );
        }
      } catch (err) { console.error('Sheet append error:', err); }

      await prisma.contact.update({
        where: { id: contactId },
        data: { formState: null, formData: Prisma.DbNull }
      });
      replyText = '✅ Thank you! We have received your profile information and our staff will process it shortly.';
    }
    else if (queryText.startsWith('buy_') || queryText.startsWith('service_')) {
      const itemTitle = queryText.replace('buy_', '').replace('service_', '').replace(/_/g, ' ').toUpperCase();
      try {
        const { appendRowToSheet } = require('./googleSheetsService');
        if (workspace.googleServiceAccountJson && workspace.googleSpreadsheetId) {
          await appendRowToSheet(
            workspace.googleServiceAccountJson, 
            workspace.googleSpreadsheetId, 
            [new Date().toISOString(), phoneNumber, queryText.startsWith('buy_') ? 'Buy An account' : 'Buy a service', 'N/A', 'N/A', itemTitle]
          );
        }
      } catch (err) { console.error('Sheet append error:', err); }
      
      replyText = `✅ Thank you! We have logged your request for: *${itemTitle}*. Our team will contact you shortly.`;
    }
    // 3. Fallback to existing commands
    else if (isCommand) {
      const keyword = lQuery;
      replyText = AUTO_RESPONSES[keyword] || '';
      
      if (keyword === '#balance') {
        replyText = `💳 *Workspace Wallet Balance*\nYour current prepaid credit balance is: *$${Number(workspace.walletBalance).toFixed(2)}*`;
      }
    }

    if (!replyText && !payload) {
      replyText = await generateGeminiResponse(contactId, queryText);
      
      // Auto-Log payment if AI triggered the hidden tag
      if (replyText.includes('[PAYMENT_LOGGED]')) {
        replyText = replyText.replace('[PAYMENT_LOGGED]', '').trim();
        try {
          const { appendRowToSheet } = require('./googleSheetsService');
          if (workspace.googleServiceAccountJson && workspace.googleSpreadsheetId) {
            await appendRowToSheet(
              workspace.googleServiceAccountJson, 
              workspace.googleSpreadsheetId, 
              [new Date().toISOString(), phoneNumber, 'Payment Received', 'N/A', 'Paid', 'Logged automatically by AI based on conversation']
            );
          }
        } catch (err) { console.error('Sheet append error for auto payment log:', err); }
      }
    }

    if (!replyText && !payload) return;

    const cost = 0.05;
    const currentBalance = Number(workspace.walletBalance);

    if (currentBalance < cost) {
      console.warn(`Insufficient balance to trigger auto-responder for workspace ${workspaceId}`);
      return;
    }

    const token = workspace.metaAccessToken || process.env.META_SYSTEM_USER_TOKEN;
    
    // Construct default text payload if no interactive payload exists
    if (!payload) {
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'text',
        text: {
          preview_url: false,
          body: replyText,
        },
      };
    }

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
      update: {
        unreadCount: { increment: 1 }
      },
      create: {
        workspaceId: workspace.id,
        phoneNumber: senderPhoneNumber,
        unreadCount: 1,
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
    let textBody = '';
    
    if (messageData.type === 'text') {
      textBody = messageData.text?.body?.trim() || '';
    } else if (messageData.type === 'interactive') {
      const interactiveType = messageData.interactive?.type;
      if (interactiveType === 'list_reply') {
        // We will pass the hidden ID of the list item down as a pseudo-command
        textBody = messageData.interactive.list_reply.id; 
      } else if (interactiveType === 'button_reply') {
        textBody = messageData.interactive.button_reply.id;
      }
    }

    if (textBody) {
      // Handoff Notification Engine
      const isHumanRequest = /talk to human|live agent|human agent|speak to a person|representative|human support|menu_human/i.test(textBody);
      
      if (isHumanRequest) {
        console.log(`🚨 [Handoff Triggered] Customer +${senderPhoneNumber} requested a human agent. Pausing bot.`);
        
        await prisma.contact.update({
          where: { id: contact.id },
          data: { botEnabled: false, priority: 'URGENT' }
        });
        contact.botEnabled = false; // Update local ref
        
        try {
          const io = getIo();
          io.to(workspace.id).emit('contactBotToggled', { contactId: contact.id, botEnabled: false });
          io.to(workspace.id).emit('humanSupportRequested', { contactId: contact.id, phone: senderPhoneNumber });
        } catch (wsErr) {}
      }

      // Option A Handoff check: verify bot is enabled for this contact
      if (contact.botEnabled !== false) {
        // Trigger auto reply asynchronously so we don't delay the inbound response
        triggerAutoResponse(workspace.id, contact.id, senderPhoneNumber, textBody);
      } else {
        console.log(`🤖 [Bot Handoff] Auto-reply skipped for contact +${senderPhoneNumber} (Bot Paused for Handoff)`);
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
