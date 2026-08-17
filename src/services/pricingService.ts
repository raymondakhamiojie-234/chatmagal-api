import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';

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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
    return null;
  }

  const csvData = await fetchPricingSheet();
  if (!csvData) {
    return null;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = `You are an internal pricing API for Falcus Media.
You have the following live pricing data (CSV format):

=== PRICING DATA ===
${csvData}
====================

The customer is asking about: "${serviceName}"
Their exact message/quantity request was: "${customerQuery}"

Find the exact price from the CSV that matches their request.
Rules:
1. Handle variations in quantity like 10k, 10000, 10,000.
2. Return ONLY the exact price string as it appears in the CSV (e.g. "50,000").
3. DO NOT format it as a full sentence. DO NOT invent prices.
4. If the price cannot be clearly determined, or if multiple rows could match and you need more clarification from the customer, return EXACTLY: "AMBIGUOUS"
5. If the service does not exist in the list, return EXACTLY: "NOT_FOUND"

Response:`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    
    if (text === 'AMBIGUOUS' || text === 'NOT_FOUND' || text === '') {
      return null;
    }

    return text;
  } catch (error) {
    console.error('Failed to fetch price via Gemini:', error);
    return null;
  }
}
