import { PrismaClient, Prisma, MessageDirection, MessageLane, MessageStatus } from '@prisma/client';
import { getIo } from '../../config/socket';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { getServicePrice } from './pricingService';
import OpenAI from 'openai';

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
export async function detectIntent(workspace: any, contactId: string, queryText: string, activeFlowId?: string, currentQuestion?: string): Promise<any | null> {
  const flowConfig = workspace.flowConfig as any;
  if (!flowConfig?.chatFlowUpdate?.intentRouter?.enabled) return null;
  
  const intents = flowConfig.chatFlowUpdate.intentRouter.intents;
  if (!intents || !Array.isArray(intents) || intents.length === 0) return null;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const aiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const openai = new OpenAI({
    apiKey,
    
  });

  let historyText = '';
  try {
    const recentMessages = await prisma.message.findMany({
      where: { contactId },
      orderBy: { createdAt: 'desc' },
      take: 6,
    });
    const chronologicalMessages = recentMessages.reverse();
    for (const msg of chronologicalMessages) {
      const role = msg.direction === 'INBOUND' ? 'Customer' : 'Us (Previous Agent or Bot)';
      const text = extractMessageText(msg);
      if (text) {
        historyText += `${role}: ${text}\n`;
      }
    }
  } catch (err) {
    console.warn('Could not load chat history context:', err);
  }

  try {
    const intentDescriptions = intents.map((i: any) => `- ${i.id}: ${i.category} (Examples: ${i.examples?.slice(0,5).join(', ')})`).join('\n');
    const outsideScopeDesc = `- OUTSIDE_SCOPE: Use this if the customer asks completely unrelated questions (e.g. weather, jokes, homework, who is the president, write a poem).
- MAIN_MENU: Use this if the customer says a general greeting (hi, hello), asks to see the menu, asks for a list of services, or asks 'can I see your services'.`;
    
    let activeFlowContextText = '';
    if (activeFlowId && currentQuestion) {
      activeFlowContextText = `
CURRENT FLOW STATUS:
The customer is currently inside the flow ID: "${activeFlowId}".
You just asked them this question: "${currentQuestion}"
`;
    }

    const prompt = `You are an intent router and flow controller for a customer service bot.
Given the customer's message, determine which intent matches best based on meaning.
Available Intents:
${intentDescriptions}
${outsideScopeDesc}

Conversation History (for context):
${historyText}
${activeFlowContextText}
Customer Message: "${queryText}"

Respond ONLY with a valid JSON object containing:
- "intentId": the matched intent ID, or "UNKNOWN", "OUTSIDE_SCOPE", or "MAIN_MENU".
- "isAnswerToCurrentFlow": boolean. True ONLY if their message is a reasonable answer to the "CURRENT FLOW STATUS" question. If they are completely ignoring the question to ask something new, false. (If no flow is active, false).
- "isFlowSwitchRequested": boolean. True if they are explicitly asking to stop the current flow and start a different service.

Example: {"intentId": "SERVICE_FOLLOWERS", "isAnswerToCurrentFlow": false, "isFlowSwitchRequested": false}
Example 2: {"intentId": "UNKNOWN", "isAnswerToCurrentFlow": true, "isFlowSwitchRequested": false}
Example 3: {"intentId": "MAIN_MENU", "isAnswerToCurrentFlow": false, "isFlowSwitchRequested": false}`;
    console.log(`🧠 [OpenAI] Classifying message using ${aiModel}: "${queryText}"`);
    const completion = await openai.chat.completions.create({
      model: aiModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 1024,
    });
    let text = completion.choices[0]?.message?.content?.trim() || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      text = jsonMatch[0];
    }
    const parsed = JSON.parse(text);
    
    let routeTo = null;
    if (parsed.intentId && parsed.intentId !== 'UNKNOWN' && parsed.intentId !== 'OUTSIDE_SCOPE') {
      const matched = intents.find((i: any) => i.id === parsed.intentId);
      if (matched && matched.routeTo) {
        routeTo = matched.routeTo;
      }
    }
    
    return {
      intentId: parsed.intentId,
      routeTo: routeTo,
      isAnswerToCurrentFlow: parsed.isAnswerToCurrentFlow || false,
      isFlowSwitchRequested: parsed.isFlowSwitchRequested || false
    };
  } catch (err) {
    console.error('Intent detection error:', err);
  }
  return null;
}

export async function generateGeminiResponse(contactId: string, prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  const hasLiveKey = apiKey && apiKey.trim() !== '';
  const aiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  let trainingContextText = '';
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
            companyBankDetails: true,
            flowConfig: true
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
      
      const flowConfig = contact.workspace.flowConfig as any;
      if (flowConfig && flowConfig.aiKnowledgeBase && flowConfig.aiKnowledgeBase.enabled) {
        trainingContextText += '\n[JSON AI Knowledge Base]:\n' + JSON.stringify({
          purpose: flowConfig.aiKnowledgeBase.purpose,
          responseRules: flowConfig.aiKnowledgeBase.responseRules,
          generalFaq: flowConfig.aiKnowledgeBase.generalFaq,
          serviceFaq: flowConfig.aiKnowledgeBase.serviceFaq,
          troubleshooting: flowConfig.aiKnowledgeBase.troubleshooting
        }, null, 2) + '\n\n';
      }
    }
  } catch (err) {
    console.warn('Could not load contact workspaceId context for AI respondent:', err);
  }

  // 2. Fetch custom bot training Q&A knowledge base rules
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
    const openai = new OpenAI({
      apiKey,
      
    });
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

    try {
      console.log(`🧠 [OpenAI] Querying model ${aiModel}...`);
      const completion = await openai.chat.completions.create({
        model: aiModel,
        messages: [{ role: 'user', content: promptContext }],
        temperature: 0.7,
        max_tokens: 1024,
      });
      const text = completion.choices[0]?.message?.content;
      if (text && text.trim()) return text.trim();
    } catch (err: any) {
      console.error('⚠️ [OpenAI API Error] Falling back to local AI engine:', err.message || err);
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
  const apiKey = process.env.OPENAI_API_KEY;
  const hasLiveKey = apiKey && apiKey.trim() !== '';
  const aiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const systemInstructions = `Analyze the following customer message and return a strictly formatted JSON object with "sentiment" and "priority" keys.
  
Classification rules:
- sentiment: "HAPPY" (pleased, thanking, positive), "NEUTRAL" (standard questions, greetings), "ANGRY" (complaining, frustrated, upset), or "URGENT" (asking for immediate help, refunds, errors).
- priority: "URGENT" (if angry, complaining, demanding human immediately, billing failures), "HIGH" (if standard technical problems, active help requests), or "STANDARD" (greetings, simple questions, operational hours).
 
Return ONLY the raw JSON object, no markdown wrappers and no explanation:
{"sentiment": "NEUTRAL", "priority": "STANDARD"}`;

  if (hasLiveKey) {
    try {
      const openai = new OpenAI({
        apiKey,
        
      });
      
      const completion = await openai.chat.completions.create({
        model: aiModel,
        messages: [
          { role: 'system', content: systemInstructions },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 150,
      });

      const text = completion.choices[0]?.message?.content?.trim() || '';
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const cleaned = jsonMatch[0].replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        if (parsed.sentiment && parsed.priority) {
          return {
            sentiment: parsed.sentiment.toUpperCase(),
            priority: parsed.priority.toUpperCase()
          };
        }
      }
    } catch (err) {
      console.warn('⚠️ [OpenAI Sentiment Failed] Falling back to local classifier:', err);
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
    // 0. FORM STATE MACHINE INTERCEPTOR & FLOW CONTROLLER
    // ==========================================
    if (contact.formState) {
      if (lQuery === 'cancel' || lQuery === 'stop') {
        await prisma.contact.update({
          where: { id: contactId },
          data: { formState: null, formData: Prisma.DbNull }
        });
        replyText = 'Form cancelled. You can type "Hi" to see the main menu again.';
      } else if (contact.formState === 'DYNAMIC_FORM') {
        const currentData = (contact.formData as any) || {};
        let formId = currentData.formId;
        let step = currentData.step || 0;
        
        const flowConfig = workspace.flowConfig as any;
        
        let matchedForm = null;
        const findForm = (id: string) => {
          if (!flowConfig || !flowConfig.mainMenu) return null;
          let m = flowConfig.mainMenu.find((item: any) => item.id === id);
          if (!m) {
            for (const item of flowConfig.mainMenu) {
              if (item.action === 'SUBMENU' && item.subMenu && item.subMenu.options) {
                m = item.subMenu.options.find((sub: any) => sub.id === id);
                if (m) break;
              }
            }
          }
          if (!m && flowConfig.chatFlowUpdate) {
            const keys = Object.keys(flowConfig.chatFlowUpdate);
            for (const key of keys) {
              const f = flowConfig.chatFlowUpdate[key];
              if (f && typeof f === 'object' && f.id === id && f.steps) {
                m = {
                  id: f.id, title: f.id, action: 'FORM',
                  formQuestions: f.steps.map((s: any) => s.question || s.message || s.instruction).filter(Boolean),
                  onCompleteMessage: "✅ Your information has been received."
                };
                break;
              }
            }
          }
          if (!m && id === 'register_customer') {
            m = {
              id: 'register_customer',
              title: 'Customer Registration',
              action: 'FORM',
              formQuestions: [
                "Let's get your account set up!\n\nFirst, what is your full name?",
                "Thank you. What is your email address?"
              ],
              onCompleteMessage: "✅ Registration submitted."
            };
          }
          return m;
        };
        
        matchedForm = findForm(formId);

        if (matchedForm && matchedForm.action === 'FORM' && matchedForm.formQuestions) {
          const questions = matchedForm.formQuestions;
          
          // INTENT DETECT & FLOW SWITCHING
          const intentObj = await detectIntent(workspace, contactId, queryText, formId, questions[step]);
          
          if (intentObj) {
            if (intentObj.intentId === 'OUTSIDE_SCOPE') {
              replyText = "I'm here to help with Falcus Media services and customer support. Please choose what you'd like help with.";
              // Soft lock: we don't clear the form state, just prompt them and show the menu
            } else if (!intentObj.isAnswerToCurrentFlow && intentObj.isFlowSwitchRequested && intentObj.routeTo) {
              // FLOW SWITCH
              formId = intentObj.routeTo;
              matchedForm = findForm(formId);
              if (matchedForm && matchedForm.action === 'FORM') {
                currentData.formId = formId;
                currentData.step = 0;
                currentData.answers = [];
                step = 0;
                await prisma.contact.update({
                  where: { id: contactId },
                  data: { formData: currentData }
                });
                replyText = `No problem 👍 You're switching to ${matchedForm.title}.\n\n${matchedForm.formQuestions[0]}`;
              }
            } else if (!intentObj.isAnswerToCurrentFlow && intentObj.intentId === 'PAYMENT' && currentData.selectedService) {
              // PAYMENT INTENT IN FLOW
              formId = 'payment_flow';
              matchedForm = findForm(formId);
              if (matchedForm && matchedForm.action === 'FORM') {
                currentData.formId = formId;
                currentData.step = 1; // skip asking service
                currentData.answers = [currentData.selectedService];
                step = 1;
                await prisma.contact.update({
                  where: { id: contactId },
                  data: { formData: currentData }
                });
                replyText = matchedForm.formQuestions[1];
              }
            } else if (!intentObj.isAnswerToCurrentFlow && intentObj.intentId === 'PRICE_QUERY' && currentData.selectedService) {
              // EXPLICIT PRICE QUERY IN FLOW
              const price = await getServicePrice(currentData.selectedService, queryText);
              if (price) {
                replyText = `The current price for ${currentData.selectedService} is ${price}.\n\nWould you like to proceed with your request? (Yes/No)`;
                currentData.awaitingPriceConfirmation = true;
                currentData.priceQuote = price;
                await prisma.contact.update({
                  where: { id: contactId },
                  data: { formData: currentData }
                });
              } else {
                replyText = "I couldn't find a current price for that exact service or package. I don't want to give you incorrect information, so I'll connect you with a Falcus Media representative to confirm.";
                // Clear state for handoff
                await prisma.contact.update({
                  where: { id: contactId },
                  data: { formState: null, formData: Prisma.DbNull }
                });
                // Note: Real system might trigger handoff logic here
              }
            }
          }

          // If we didn't generate a reply text yet, process the answer
          if (!replyText) {
            currentData.answers = currentData.answers || [];
            
            if (step === 0 && matchedForm.title) currentData.selectedService = matchedForm.title;

            // Price confirmation interceptor
            if (currentData.awaitingPriceConfirmation) {
              if (lQuery === 'yes' || lQuery === 'y') {
                currentData.awaitingPriceConfirmation = false;
                currentData.step = step + 1;
                currentData.answers.push("Confirmed Price: " + currentData.priceQuote);
              } else {
                replyText = "Okay, we have paused this request. Let me know if you need anything else.";
                await prisma.contact.update({ where: { id: contactId }, data: { formState: null, formData: Prisma.DbNull } });
              }
            } else {
              currentData.answers.push(queryText);
              currentData.step = step + 1;
            }

            if (!replyText) {
              if (currentData.step < questions.length) {
                await prisma.contact.update({
                  where: { id: contactId },
                  data: { formData: currentData }
                });
                replyText = questions[currentData.step];
              } else {
                // --- CUSTOM NATIVE ACCOUNT FLOWS ---
                if (formId === 'register_customer') {
                  const name = currentData.answers[0];
                  const email = currentData.answers[1];
                  
                  if (currentData.step === 2) {
                    // Generate setup token
                    const { v4: uuidv4 } = require('uuid');
                    const setupToken = uuidv4();
                    const expiry = new Date();
                    expiry.setHours(expiry.getHours() + 1);

                    await prisma.contact.update({
                      where: { id: contactId },
                      data: {
                        name: name,
                        email: email,
                        resetToken: setupToken,
                        resetExpiry: expiry,
                        accountStatus: 'REGISTERED'
                      }
                    });
                    
                    const setupLink = `${process.env.PUBLIC_URL || 'http://localhost:3000'}/api/account/setup?token=${setupToken}`;
                    replyText = `Great, ${name}! Please set up a secure password using this link:\n\n${setupLink}\n\n*Important: Once you set your password, we will send a 6-digit verification code to your email. Return to this chat and enter the code.*`;
                    
                    currentData.step = 3;
                    await prisma.contact.update({
                      where: { id: contactId },
                      data: { formData: currentData }
                    });
                  } else if (currentData.step === 3) {
                    // Check verification code
                    const code = currentData.answers[2];
                    if (contact.verificationCode === code && contact.verificationExpiry && contact.verificationExpiry > new Date()) {
                      // Verified!
                      const customerId = `FM-${Math.floor(100000 + Math.random() * 900000)}`;
                      await prisma.contact.update({
                        where: { id: contactId },
                        data: {
                          emailVerified: true,
                          accountStatus: 'VERIFIED',
                          customerId: customerId,
                          verificationCode: null,
                          verificationExpiry: null
                        }
                      });
                      
                      replyText = `✅ Account successfully verified!\nYour Falcus Media Customer ID is: ${customerId}`;
                      
                      // Check if there was a suspended flow
                      if (contact.suspendedFlowData) {
                        const suspended = JSON.parse(JSON.stringify(contact.suspendedFlowData));
                        replyText += `\n\nResuming your previous request...`;
                        
                        // We will complete the suspended flow!
                        try {
                          const orderNumber = `ORD-${Math.floor(10000 + Math.random() * 90000)}`;
                          await prisma.order.create({
                            data: {
                              workspaceId: workspace.id,
                              contactId: contact.id,
                              orderNumber: orderNumber,
                              serviceName: suspended.selectedService || 'Service Request',
                              price: suspended.priceQuote || null,
                              details: suspended.answers || []
                            }
                          });
                          replyText += `\n\n✅ Your request for ${suspended.selectedService || 'Service'} has been submitted.\nOrder Reference: ${orderNumber}`;
                          
                          const { appendRowToSheet } = require('./googleSheetsService');
                          if (workspace.googleServiceAccountJson && workspace.googleSpreadsheetId) {
                            const sheetData = [new Date().toISOString(), phoneNumber, suspended.selectedService || 'Service', ...suspended.answers];
                            await appendRowToSheet(workspace.googleServiceAccountJson, workspace.googleSpreadsheetId, sheetData);
                          }
                        } catch (err) { console.error('Error saving suspended order:', err); }
                      }

                      // Clear form state completely
                      await prisma.contact.update({
                        where: { id: contactId },
                        data: { formState: null, formData: Prisma.DbNull, suspendedFlowData: Prisma.DbNull }
                      });
                    } else {
                      // Failed verification
                      currentData.step = 2; // rollback step to ask again
                      currentData.answers.pop();
                      await prisma.contact.update({
                        where: { id: contactId },
                        data: { formData: currentData }
                      });
                      replyText = `❌ Invalid or expired verification code. Please try again. Enter the 6-digit code sent to ${contact.email}.`;
                    }
                  }
                } else {
                  // --- GENERIC FLOW COMPLETION (Service Requests) ---
                  // Intercept if GUEST
                  if (contact.accountStatus === 'GUEST' || !contact.emailVerified) {
                    // Stash current flow data
                    await prisma.contact.update({
                      where: { id: contactId },
                      data: {
                        suspendedFlowData: currentData,
                        formState: 'DYNAMIC_FORM',
                        formData: { formId: 'register_customer', step: 0, answers: [] }
                      }
                    });
                    replyText = `To complete your request for ${matchedForm.title}, you need a Falcus Media customer account.\n\nWhat is your full name?`;
                  } else {
                    // Normal completion (already verified)
                    try {
                      const orderNumber = `ORD-${Math.floor(10000 + Math.random() * 90000)}`;
                      await prisma.order.create({
                        data: {
                          workspaceId: workspace.id,
                          contactId: contact.id,
                          orderNumber: orderNumber,
                          serviceName: matchedForm.title || formId,
                          price: currentData.priceQuote || null,
                          details: currentData.answers || []
                        }
                      });

                      const { appendRowToSheet } = require('./googleSheetsService');
                      if (workspace.googleServiceAccountJson && workspace.googleSpreadsheetId) {
                        const sheetData = [new Date().toISOString(), phoneNumber, matchedForm.title || formId, ...currentData.answers];
                        await appendRowToSheet(workspace.googleServiceAccountJson, workspace.googleSpreadsheetId, sheetData);
                      }
                    } catch (err) { console.error('Order/Sheet save error:', err); }

                    await prisma.contact.update({
                      where: { id: contactId },
                      data: { formState: null, formData: Prisma.DbNull }
                    });
                    replyText = matchedForm.onCompleteMessage || '✅ Thank you! We have received your information and our staff will process it shortly.';
                  }
                }
              }
            } else {
              // update state if we replied (e.g. price check)
              await prisma.contact.update({
                where: { id: contactId },
                data: { formData: currentData }
              });
            }
          }
        } else {
          // Invalid state, reset
          await prisma.contact.update({
            where: { id: contactId },
            data: { formState: null, formData: Prisma.DbNull }
          });
          replyText = 'An error occurred with the form. Please try again.';
        }
      }
    }
    
    // If we have intercepted via state machine, skip the rest
    if (replyText || payload) {
      // Proceed to the send logic below
    } else {
      // ==========================================
      // 1. Dynamic Chat Flow Builder Interceptor
      // ==========================================
      const flowConfig = workspace.flowConfig as any;
      const hasFlow = flowConfig && flowConfig.mainMenu && Array.isArray(flowConfig.mainMenu) && flowConfig.mainMenu.length > 0;

      if (hasFlow) {
        if (['hi', 'hello', 'hey', 'menu', 'good morning', 'good afternoon', 'good evening'].includes(lQuery)) {
          // Send Main Menu
          const welcomeText = flowConfig.welcomeMessage || `Welcome to ${workspace.businessName || workspace.name || 'our service'}! 👋\n\nHow can we assist you today?`;
          
          try {
            const token = workspace.metaAccessToken || process.env.META_SYSTEM_USER_TOKEN;
            const res = await metaApi.post(`/${workspace.metaPhoneNumberId}/messages`, {
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: phoneNumber,
              type: 'text',
              text: { preview_url: false, body: welcomeText },
            }, { headers: { Authorization: `Bearer ${token}` } });
            
            await prisma.message.create({
              data: {
                workspaceId, contactId, direction: MessageDirection.OUTBOUND, lane: MessageLane.SUPPORT,
                content: { body: welcomeText, meta_response: res.data }, status: MessageStatus.SENT,
              },
            });
          } catch (err) { console.error('Failed to send welcome message:', err); }

          const rows = flowConfig.mainMenu.map((item: any) => ({
            id: item.id,
            title: item.title.substring(0, 24)
          }));

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
                sections: [{ title: 'Options', rows }]
              }
            }
          };
          replyText = 'Interactive Main Menu Sent';
        } else {
          // Find if queryText matches ANY id in the flow config (mainMenu or subMenus)
          let intentOverride = queryText;
          let matchedItem = flowConfig.mainMenu.find((item: any) => item.id === intentOverride);
          
          if (!matchedItem) {
            for (const item of flowConfig.mainMenu) {
              if (item.action === 'SUBMENU' && item.subMenu && item.subMenu.options) {
                matchedItem = item.subMenu.options.find((sub: any) => sub.id === intentOverride);
                if (matchedItem) break;
              }
            }
          }

          // If no direct button match, try AI Intent Routing for natural language!
          if (!matchedItem && flowConfig?.chatFlowUpdate?.intentRouter?.enabled) {
            const intentObj = await detectIntent(workspace, contactId, queryText);
            if (intentObj) {
              if (intentObj.intentId === 'OUTSIDE_SCOPE') {
                replyText = "I'm here to help with Falcus Media services and customer support. Please choose what you'd like help with.";
                
                // Construct standard main menu payload
                const rows = flowConfig.mainMenu.map((item: any) => ({
                  id: item.id,
                  title: item.title.substring(0, 24)
                }));
                payload = {
                  messaging_product: 'whatsapp',
                  recipient_type: 'individual',
                  to: phoneNumber,
                  type: 'interactive',
                  interactive: {
                    type: 'list',
                    header: { type: 'text', text: 'Falcus Media Ltd' },
                    body: { text: 'Choose an option:' },
                    action: { button: 'Menu', sections: [{ title: 'Options', rows }] }
                  }
                };
              } else if (intentObj.intentId === 'MAIN_MENU') {
                replyText = flowConfig.welcomeMessage || `Welcome to ${workspace.businessName || workspace.name || 'our service'}! 👋\n\nHow can we assist you today?`;
                const rows = flowConfig.mainMenu.map((item: any) => ({
                  id: item.id,
                  title: item.title.substring(0, 24)
                }));
                payload = {
                  messaging_product: 'whatsapp',
                  recipient_type: 'individual',
                  to: phoneNumber,
                  type: 'interactive',
                  interactive: {
                    type: 'list',
                    header: { type: 'text', text: 'Welcome' },
                    body: { text: 'Choose an option:' },
                    action: { button: 'Menu', sections: [{ title: 'Options', rows }] }
                  }
                };
              } else if (intentObj.routeTo) {
                intentOverride = intentObj.routeTo;
                
                // Search again with the AI detected route
                matchedItem = flowConfig.mainMenu.find((item: any) => item.id === intentOverride);
                if (!matchedItem) {
                  for (const item of flowConfig.mainMenu) {
                    if (item.action === 'SUBMENU' && item.subMenu && item.subMenu.options) {
                      matchedItem = item.subMenu.options.find((sub: any) => sub.id === intentOverride);
                      if (matchedItem) break;
                    }
                  }
                }
                
                // Also check if the AI detected route maps to a custom hidden flow in chatFlowUpdate (e.g. payment_flow)
                if (!matchedItem && flowConfig?.chatFlowUpdate) {
                  const updateKeys = Object.keys(flowConfig.chatFlowUpdate);
                  for (const key of updateKeys) {
                    const flowObj = flowConfig.chatFlowUpdate[key];
                    if (flowObj && typeof flowObj === 'object' && flowObj.id === intentOverride && flowObj.steps) {
                      matchedItem = {
                        id: flowObj.id,
                        title: flowObj.id,
                        action: 'FORM',
                        formQuestions: flowObj.steps.map((s: any) => s.question || s.message || s.instruction).filter(Boolean),
                        onCompleteMessage: "✅ Your information has been received."
                      };
                      break;
                    }
                  }
                }
              }
              
              if (!matchedItem && intentOverride === 'register_customer') {
                matchedItem = {
                  id: 'register_customer',
                  title: 'Customer Registration',
                  action: 'FORM',
                  formQuestions: [
                    "Let's get your account set up!\n\nFirst, what is your full name?",
                    "Thank you. What is your email address?"
                  ],
                  onCompleteMessage: "✅ Registration submitted."
                };
              }

              if (intentObj.intentId === 'TALK_TO_HUMAN') {
                replyText = "Connecting you with a human agent now...";
                // Add logic for human agent handoff here
              }
            }
          }

          // NATIVE ACCOUNT INTENTS INTERCEPTOR
          if (['my_orders', 'my_payments', 'my_account', 'account_recovery', 'login_customer'].includes(intentOverride)) {
            if (intentOverride === 'account_recovery' || intentOverride === 'login_customer') {
              if (contact.email) {
                // Generate setup token for recovery
                const { v4: uuidv4 } = require('uuid');
                const setupToken = uuidv4();
                const expiry = new Date();
                expiry.setHours(expiry.getHours() + 1);

                await prisma.contact.update({
                  where: { id: contactId },
                  data: {
                    resetToken: setupToken,
                    resetExpiry: expiry,
                  }
                });
                const setupLink = `${process.env.PUBLIC_URL || 'http://localhost:3000'}/api/account/recover?token=${setupToken}`;
                replyText = `🔐 Need to reset your password or login? Use this secure link:\n\n${setupLink}\n\n*Note: Do NOT share this link with anyone.*`;
              } else {
                replyText = `We don't have an email on file for you. Would you like to create an account? Type 'register me'.`;
              }
            } else if (contact.accountStatus === 'GUEST' || !contact.emailVerified) {
              replyText = `You need a verified Falcus Media account to access this feature. Would you like to create one now? Type 'register me'.`;
            } else {
              if (intentOverride === 'my_orders' || intentOverride === 'my_payments') {
                const orders = await prisma.order.findMany({
                  where: { contactId: contact.id },
                  orderBy: { createdAt: 'desc' },
                  take: 5
                });
                
                if (orders.length === 0) {
                  replyText = `📦 You don't have any recent orders or service requests.`;
                } else {
                  replyText = `📦 *Your Recent Orders*\n\n` + orders.map(o => `• Order: ${o.orderNumber}\n  Service: ${o.serviceName}\n  Status: ${o.status}\n  Date: ${o.createdAt.toLocaleDateString()}`).join('\n\n');
                }
              } else if (intentOverride === 'my_account') {
                replyText = `👤 *My Account*\n\nName: ${contact.name || 'Not set'}\nEmail: ${contact.email || 'Not set'}\nCustomer ID: ${contact.customerId || 'N/A'}\nStatus: ${contact.accountStatus}`;
              }
            }
            // Skip further processing for these intents
            matchedItem = null;
          }

          if (matchedItem) {
            if (matchedItem.action === 'TEXT') {
              replyText = matchedItem.reply || 'Thank you!';
            } else if (matchedItem.action === 'SUBMENU' && matchedItem.subMenu && matchedItem.subMenu.options) {
              const rows = matchedItem.subMenu.options.map((opt: any) => ({
                id: opt.id,
                title: opt.title.substring(0, 24)
              }));
              payload = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: phoneNumber,
                type: 'interactive',
                interactive: {
                  type: 'list',
                  header: { type: 'text', text: matchedItem.title.substring(0, 60) },
                  body: { text: matchedItem.subMenu.text || 'Choose an option:' },
                  action: {
                    button: 'View Options',
                    sections: [{ title: 'Options', rows }]
                  }
                }
              };
              replyText = `Submenu sent for ${matchedItem.title}`;
            } else if (matchedItem.action === 'FORM' && matchedItem.formQuestions && matchedItem.formQuestions.length > 0) {
              const price = await getServicePrice(matchedItem.title, queryText);
              if (price) {
                await prisma.contact.update({
                  where: { id: contactId },
                  data: { 
                    formState: 'DYNAMIC_FORM', 
                    formData: { formId: matchedItem.id, step: 0, answers: [], awaitingPriceConfirmation: true, priceQuote: price, selectedService: matchedItem.title } 
                  }
                });
                replyText = `The current price for ${matchedItem.title} is ${price}.\n\nWould you like to proceed? (Yes/No)`;
              } else {
                await prisma.contact.update({
                  where: { id: contactId },
                  data: { formState: 'DYNAMIC_FORM', formData: { formId: matchedItem.id, step: 0, answers: [], selectedService: matchedItem.title } }
                });
                replyText = matchedItem.formQuestions[0];
              }
            }
          }
        }
      }
      
      // 3. Fallback to existing commands if flow didn't intercept it
      if (!replyText && !payload && isCommand) {
        const keyword = lQuery;
        replyText = AUTO_RESPONSES[keyword] || '';
        
        if (keyword === '#balance') {
          replyText = `💳 *Workspace Wallet Balance*\nYour current prepaid credit balance is: *$${Number(workspace.walletBalance).toFixed(2)}*`;
        }
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

    // Apply variable interpolation across all replies
    if (replyText) {
      if (workspace.companyBankDetails) {
        replyText = replyText.replace(/{{bankDetails}}/g, workspace.companyBankDetails);
      }
      if (workspace.businessName || workspace.name) {
        replyText = replyText.replace(/{{businessName}}/g, workspace.businessName || workspace.name);
      }
    }

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
