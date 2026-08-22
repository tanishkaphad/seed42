import { ChatGroq } from '@langchain/groq';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

const DEAD_GROQ = new Set(['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'llama-3.1-70b-versatile']);

export function groqReady() {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

function groqModel() {
  const m = process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-120b';
  return DEAD_GROQ.has(m) ? 'openai/gpt-oss-120b' : m;
}

export function chatModel() {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) throw new Error('GROQ_API_KEY is not set in the Next.js env');
  return new ChatGroq({
    apiKey: key,
    model: groqModel(),
    temperature: 0.1,
  });
}

export async function runSpecialist(name: string, system: string, user: string) {
  const model = chatModel();
  const out = await model.invoke([
    new SystemMessage(
      `${system} Reply in at most 4 short sentences. Plain text only. Do not invent POs, quotes, shipments, or coverage formulas. days_of_coverage in the data is usable_stock ÷ daily_usage.`
    ),
    new HumanMessage(user.slice(0, 6000)),
  ]);
  const text = typeof out.content === 'string' ? out.content : JSON.stringify(out.content);
  return { agent: name, brief: text.trim() };
}
