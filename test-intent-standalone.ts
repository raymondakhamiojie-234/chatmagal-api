import 'dotenv/config';
import fs from 'fs';
import path from 'path';

async function testDetectIntent(queryText: string) {
  const configData = fs.readFileSync(path.join(__dirname, 'final_chatbot_config.json'), 'utf8');
  const flowConfig = JSON.parse(configData);
  
  if (!flowConfig?.chatFlowUpdate?.intentRouter?.enabled) {
    console.log("Intent router not enabled");
    return null;
  }
  
  const router = flowConfig.chatFlowUpdate.intentRouter;
  
  const prompt = `
System Rules:
${router.instruction}

Available Intents:
${router.intents.map((i: any) => `- ${i.id}: ${i.category} (Examples: ${i.examples.join(', ')})`).join('\n')}

Priority Rules:
${router.priorityOrder.join(' > ')}

Conversation History (for context):

Customer Message: "${queryText}"

Respond ONLY with a valid JSON object containing:
- "intentId": the matched intent ID, or "UNKNOWN", or "OUTSIDE_SCOPE".
- "isAnswerToCurrentFlow": boolean. True ONLY if their message is a reasonable answer to the "CURRENT FLOW STATUS" question. If they are completely ignoring the question to ask something new, false. (If no flow is active, false).
- "isFlowSwitchRequested": boolean. True if they are explicitly asking to stop the current flow and start a different service.
`;

  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    console.log(`🧠 [Gemini Intent AI] Classifying message: "${queryText}"`);
    const result = await model.generateContent(prompt);
    let text = result.response.text().trim();
    console.log("RAW TEXT:", text);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      text = jsonMatch[0];
    }
    const parsed = JSON.parse(text);
    console.log("PARSED:", parsed);
  } catch(err) {
    console.error("ERROR:", err);
  }
}

async function run() {
  await testDetectIntent("How much is Name Change");
  await testDetectIntent("where do i pay");
  await testDetectIntent("hello");
}

run();
