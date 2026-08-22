import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';
import { fileURLToPath } from 'url';

// ponytail: Cursor MCP often starts with cwd != repo root; pin .env to this package
dotenv.config({ path: path.resolve(fileURLToPath(new URL('../../.env', import.meta.url))) });

const envSchema = z.object({
  DATABASE_URL: z.string().default(''),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  DEFAULT_APPROVAL_THRESHOLD: z.coerce.number().default(150000),
  GROQ_API_KEY: z.string().default(''),
  GROQ_MODEL: z.string().default('openai/gpt-oss-120b'),
  RESEND_API_KEY: z.string().default(''),
  MAIL_FROM: z.string().default('Supply Control Room <beth.t@example.com>'),
  MAIL_TO: z.string().default(''),
  MAIL_SEND_TO_CONTACTS: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  MAIL_WEBHOOK_SECRET: z.string().default(''),
  AGENT_COVERAGE_DAYS: z.coerce.number().default(7),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_REFRESH_TOKEN: z.string().default(''),
  GMAIL_PUBSUB_TOPIC: z.string().default(''),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL || '',
  PORT: process.env.PORT,
  HOST: process.env.HOST,
  REDIS_URL: process.env.REDIS_URL,
  DEFAULT_APPROVAL_THRESHOLD: process.env.DEFAULT_APPROVAL_THRESHOLD,
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',
  GROQ_MODEL: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  MAIL_FROM: process.env.MAIL_FROM,
  MAIL_TO: process.env.MAIL_TO || '',
  MAIL_SEND_TO_CONTACTS: process.env.MAIL_SEND_TO_CONTACTS || 'false',
  MAIL_WEBHOOK_SECRET: process.env.MAIL_WEBHOOK_SECRET || '',
  AGENT_COVERAGE_DAYS: process.env.AGENT_COVERAGE_DAYS,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
  GOOGLE_REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN || '',
  GMAIL_PUBSUB_TOPIC: process.env.GMAIL_PUBSUB_TOPIC || '',
});
