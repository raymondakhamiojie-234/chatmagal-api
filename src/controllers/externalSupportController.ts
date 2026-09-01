import { Request, Response } from 'express';
import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// POST /api/support/chat
export const externalSupportChat = async (req: Request, res: Response) => {
  try {
    const { message, sessionId } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'NVIDIA_API_KEY is not configured on the server.' });
    }

    const openai = new OpenAI({ 
      apiKey: apiKey,
      baseURL: 'https://integrate.api.nvidia.com/v1' 
    });

    const aiModel = process.env.NVIDIA_MODEL || 'meta/llama-3.1-70b-instruct';

    // Prepare a powerful system prompt injected with deep social media knowledge
    const systemPrompt = `You are a highly intelligent Support Agent and Expert for Falcus Media Ltd.
You have deep technical knowledge of social media algorithms, account violations (shadowbans, community guidelines), engagement strategies, and follower growth across Facebook, TikTok, Instagram, and YouTube.

Your objective is to provide professional, accurate, and helpful answers to users asking about social media issues or Falcus Media services.
- If they ask about account restrictions, explain common reasons (e.g., copyright strikes, inauthentic behavior, restricted monetization).
- If they ask about growing followers, provide actionable strategies.
- Maintain a polite, helpful, and professional tone.
- Do NOT use internal system language (don't say "I am an AI", just act as the Falcus Media expert).
- Keep your answers concise but detailed enough to be genuinely helpful.`;

    // To make it conversational, we can fetch previous messages using the sessionId (optional)
    let messages: any[] = [
      { role: 'system', content: systemPrompt }
    ];

    messages.push({ role: 'user', content: message });

    const completion = await openai.chat.completions.create({
      model: aiModel,
      messages: messages,
      temperature: 0.7,
      max_tokens: 1024,
    });

    const reply = completion.choices[0]?.message?.content || 'I am sorry, I am currently unable to process your request.';

    res.json({
      reply: reply,
      sessionId: sessionId // return it back so the client can keep track if they want
    });
  } catch (error) {
    console.error('External Support API Error:', error);
    res.status(500).json({ error: 'Internal server error while processing AI response' });
  }
};
