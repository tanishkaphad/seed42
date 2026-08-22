import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required to connect to Neon PostgreSQL'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  DEFAULT_APPROVAL_THRESHOLD: z.coerce.number().default(150000),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL || '',
  PORT: process.env.PORT,
  HOST: process.env.HOST,
  REDIS_URL: process.env.REDIS_URL,
  DEFAULT_APPROVAL_THRESHOLD: process.env.DEFAULT_APPROVAL_THRESHOLD,
});
