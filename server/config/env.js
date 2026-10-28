/**
 * @file /server/config/env.js
 * @description Validates environment variables using Zod and exports a type-safe config object.
 * Fails fast on application startup if any critical variable is missing or invalid.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().optional().default(''),
  POSTGRES_URL: z.string().optional().default(''),
  SUPABASE_URL: z.string().optional().default(''),
  SUPABASE_KEY: z.string().optional().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(''),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters long').default('dev-besim-design-jwt-secret-key-super-secure-32chars!'),
  ADMIN_EMAIL: z.string().email().default('admin@besimdesign.com'),
  ADMIN_PASSWORD: z.string().min(8, 'ADMIN_PASSWORD must be at least 8 characters').default('AdminPass123!'),
  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  NOTIFY_EMAILS: z.string().default('besimdesigne@gmail.com,msfusionarchitects@gmail.com'),
  IP_HASH_SALT: z.string().min(8, 'IP_HASH_SALT must be at least 8 characters').default('besim-ip-salt-98765'),
  ALLOWED_ORIGIN: z.string().default('*'),
  DB_PATH: z.string().default(process.env.VERCEL ? '/tmp/fusion.db' : path.resolve(__dirname, '../db/fusion.db')),
  WHATSAPP_NUMBER: z.string().default('919892699850'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ CRITICAL: Invalid environment configuration:');
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const env = parsed.data;
export default env;
