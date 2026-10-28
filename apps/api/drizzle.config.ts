import { defineConfig } from 'drizzle-kit';
import { readFileSync } from 'node:fs';
import 'dotenv/config';

// Split the URL so the Supabase CA certificate can be passed as an SSL option (see src/db/index.ts).
const url = new URL(process.env.DATABASE_URL ?? 'postgres://localhost/estara');
const caPath = process.env.DATABASE_CA_CERT;

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    ssl: caPath ? { ca: readFileSync(caPath, 'utf8') } : false
  }
});
