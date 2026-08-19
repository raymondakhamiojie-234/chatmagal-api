import axios from 'axios';
import OpenAI from 'openai';

const PRICING_SHEET_URL = 'https://docs.google.com/spreadsheets/d/18Xao0VU6frNik4OB8Tp85TpednvbNLPHnwNqa37ViG8/export?format=csv';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

let cachedPricingData: string | null = null;
let lastFetchTime: number = 0;

export async function fetchPricingSheet(): Promise<string> {
  const now = Date.now();
  if (cachedPricingData && (now - lastFetchTime < CACHE_TTL_MS)) {
    return cachedPricingData;
  }

  try {
    console.log('fetching live pricing sheet from Google Sheets...');
    const response = await axios.get(PRICING_SHEET_URL);
    if (response.data) {
      cachedPricingData = response.data;
      lastFetchTime = now;
      return cachedPricingData!;
    }
  } catch (error) {
    console.error('Failed to fetch pricing sheet:', error);
  }
  
  return cachedPricingData || ''; // return stale if available, else empty
}

export async function getServicePrice(serviceName: string, customerQuery: string): Promise<string | null> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return null;
  }
  const aiModel = process.env.NVIDIA_MODEL || 'meta/llama-3.1-70b-instruct';

  const csvData = await fetchPricingSheet();
  if (!csvData) {
    return null;
  }

  const openai = new OpenAI({
    apiKey,
    baseURL: 'https://integrate.api.nvidia.com/v1',
  });

  const systemPrompt = `You are an internal pricing API for Falcus Media.
You have the following live pricing data (CSV format):

=== PRICING DATA ===
${csvData}
====================

Find the exact price from the CSV that matches the customer's request.
Rules:
1. Handle variations in quantity like 10k, 10000, 10,000.
2. Return ONLY a strict JSON object with no markdown wrappers and no explanation. Do not include any reasoning or search logic.
3. The JSON format must be EXACTLY: {"success": true, "amount": "50,000"} or {"success": false, "reason": "NOT_FOUND" / "AMBIGUOUS"}.`;

  const userPrompt = `The customer is asking about: "${serviceName}"
Their exact message/quantity request was: "${customerQuery}"`;

  try {
    const completion = await openai.chat.completions.create({
      model: aiModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1,
      max_tokens: 150,
      response_format: { type: 'json_object' }
    });
    
    const text = completion.choices[0]?.message?.content?.trim() || '';
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0].replace(/```json/g, '').replace(/```/g, '').trim());
      if (parsed.success && parsed.amount) {
        return parsed.amount;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Failed to fetch price via NVIDIA NIM AI:', error);
    return null;
  }
}
