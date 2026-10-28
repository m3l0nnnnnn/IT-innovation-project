import 'dotenv/config';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';

// DATABASE_CA_CERT is relative to apps/api, where the npm workspace scripts run.
// Supabase signs its certificates with its own CA, so we trust that CA instead of disabling verification.
const caPath = process.env.DATABASE_CA_CERT;

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: caPath ? { ca: readFileSync(caPath, 'utf8') } : undefined,
  max: 5
});
export const db = drizzle(pool, { schema });
