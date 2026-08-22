import { env } from '../config/env.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GroqCallOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  jsonMode?: boolean;
}

export class GroqAPIError extends Error {
  constructor(message: string, public statusCode?: number, public details?: any) {
    super(message);
    this.name = 'GroqAPIError';
  }
}

/**
 * Executes a chat completion request to the Groq API.
 * Throws explicit GroqAPIError if API key is missing or request fails.
 * NO HARDCODED OR SILENT FALLBACKS.
 */
export async function callGroq(
  messages: ChatMessage[],
  options: GroqCallOptions = {}
): Promise<string> {
  const apiKey = env.GROQ_API_KEY || process.env.GROQ_API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    throw new GroqAPIError(
      'GROQ_API_KEY is missing. Please set GROQ_API_KEY in your .env file to enable autonomous AI reasoning.'
    );
  }

  const model = options.model || env.GROQ_MODEL || process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
  const temperature = options.temperature ?? 0.2;
  const maxTokens = options.max_tokens ?? 2048;

  const payload: any = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  if (options.jsonMode) {
    payload.response_format = { type: 'json_object' };
  }

  let response: Response;
  try {
    response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (netErr: any) {
    throw new GroqAPIError(`Failed to connect to Groq API: ${netErr.message}`);
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new GroqAPIError(
      `Groq API responded with status ${response.status}: ${errorBody}`,
      response.status,
      errorBody
    );
  }

  const data: any = await response.json();
  const choice = data?.choices?.[0]?.message?.content;

  if (!choice || typeof choice !== 'string') {
    throw new GroqAPIError('Groq API returned an empty or invalid completion choice.');
  }

  return choice.trim();
}

/**
 * Extracts and parses JSON from model responses, handling <think> tags, markdown codeblocks, and raw JSON strings.
 */
export function extractJsonFromLlm(text: string): any {
  // Strip thought tags (e.g. <think>...</think>)
  let clean = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  clean = clean.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1').trim();
  // If text contains extra narrative, slice to the outermost JSON braces
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    clean = clean.slice(firstBrace, lastBrace + 1);
  }
  return JSON.parse(clean);
}
